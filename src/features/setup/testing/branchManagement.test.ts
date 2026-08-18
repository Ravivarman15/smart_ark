import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { branchSchema } from "../schemas/setup.schema";
import { branchIsDeletable } from "../services/branches.service";
import { validate } from "../utils";
import { MODULE_CATALOG } from "@/features/rbac/constants/catalog";
import { ACTION_CATALOG } from "@/features/rbac/constants/actionCatalog";
import { NAV_CONFIG } from "@/core/navigation/menu.config";
import { SHARED_ROUTES } from "@/core/routing/sharedRoutes";
import type { Branch } from "../types/setup.types";

// ════════════════════════════════════════════════════════════════════════════
// BRANCHES — the feature the pricing page has been selling
//
// ┌── WHAT WAS WRONG ──────────────────────────────────────────────────────┐
// │ Professional lists "Branches: 5". plan_limit(org,'branches'),          │
// │ usage_status() and a trigger on `campuses` all existed and worked, and │
// │ Billing rendered the number. There was no way to create the second     │
// │ one: `campuses` has RLS enabled with SELECT-only policies, so every    │
// │ tenant was frozen at the single row provisioning created — verified on │
// │ the live database, where all three organizations had exactly 1.        │
// └────────────────────────────────────────────────────────────────────────┘
//
// A branch is ONE object over TWO rows — the `campuses` row 20 tables point
// at, and the `organization_branches` descriptor. Most of what follows guards
// that pairing, because a campus with no descriptor is invisible in the UI
// while still consuming a paid plan slot.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s: string) =>
  s.replace(/^\s*--.*$/gm, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const MIGRATION = read("supabase/migrations/20261009_branch_management.sql");
const SQL = stripComments(MIGRATION);
const SERVICE = stripComments(read("src/features/setup/services/branches.service.ts"));
const PAGE = read("src/features/setup/pages/ManageBranchesPage.tsx");
const HOOKS = stripComments(read("src/features/setup/hooks/useBranches.ts"));

const branch = (over: Partial<Branch> = {}): Branch => ({
  id: "b1",
  campusId: "c1",
  name: "North Campus",
  isPrimary: false,
  isActive: true,
  isCheckinLocation: false,
  studentCount: 0,
  staffCount: 0,
  batchCount: 0,
  ...over,
});

describe("A branch is created as both of its rows or neither", () => {
  it("creates the campus AND the descriptor in one function", () => {
    const body = SQL.slice(SQL.indexOf("FUNCTION public.create_branch"));
    const end = body.indexOf("FUNCTION public.update_branch");
    const create = body.slice(0, end > 0 ? end : undefined);
    expect(create).toMatch(/INSERT INTO public\.campuses/);
    expect(create).toMatch(/INSERT INTO public\.organization_branches/);
  });

  it("keeps campuses write-protected so there is no second way in", () => {
    // The whole reason the RPCs exist. If a write policy ever lands on
    // campuses, a client can create half a branch again.
    expect(SQL).not.toMatch(/CREATE POLICY[\s\S]{0,120}ON public\.campuses/i);
    expect(SQL).toMatch(/campuses has a write policy/);
  });

  it("renames the campus too, because that is what dropdowns read", () => {
    const update = SQL.slice(
      SQL.indexOf("FUNCTION public.update_branch"),
      SQL.indexOf("FUNCTION public.delete_branch"),
    );
    expect(update).toMatch(/UPDATE public\.campuses[\s\S]{0,80}SET name/);
  });

  it("deletes the campus row so the plan slot is actually freed", () => {
    const del = SQL.slice(SQL.indexOf("FUNCTION public.delete_branch"));
    expect(del).toMatch(/DELETE FROM public\.campuses/);
  });
});

describe("The browser never chooses the tenant", () => {
  it("no RPC accepts an organization id", () => {
    // A parameter here would let any authenticated user create a branch inside
    // somebody else's organization — the exact hole Phase 7B closed for leads.
    for (const fn of ["create_branch", "update_branch", "delete_branch", "branch_directory"]) {
      const start = SQL.indexOf(`FUNCTION public.${fn}(`);
      const signature = SQL.slice(start, SQL.indexOf(")", start));
      expect(signature, `${fn} takes an org argument`).not.toMatch(/_org|organization/i);
    }
  });

  it("the service sends no organization id either", () => {
    expect(SERVICE).not.toMatch(/organization_id|_org:/);
  });

  it("every SECURITY DEFINER function pins its search_path", () => {
    // Split on the CREATE so the phrase inside the verification block's own
    // error message is not counted as a sixth function.
    const bodies = SQL.split(/CREATE OR REPLACE FUNCTION/).slice(1);
    expect(bodies.length).toBe(5);
    for (const body of bodies) {
      const head = body.slice(0, body.indexOf("AS $$"));
      expect(head, `${body.slice(0, 40)} is not SECURITY DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(head, `${body.slice(0, 40)} has no pinned search_path`)
        .toMatch(/SET search_path TO 'public'/);
    }
  });
});

describe("Who may change a branch is decided once", () => {
  it("all three writers share one guard", () => {
    for (const fn of ["create_branch", "update_branch", "delete_branch"]) {
      const start = SQL.indexOf(`FUNCTION public.${fn}(`);
      const body = SQL.slice(start, start + 1200);
      expect(body, `${fn} does not call the shared guard`)
        .toMatch(/assert_can_manage_branches\(\)/);
    }
  });

  it("the guard checks role, tenant and suspension", () => {
    const guard = SQL.slice(
      SQL.indexOf("FUNCTION public.assert_can_manage_branches"),
      SQL.indexOf("FUNCTION public.branch_directory"),
    );
    expect(guard).toMatch(/has_any_role\(ARRAY\['admin', 'management'\]\)/);
    expect(guard).toMatch(/current_org_id\(\)/);
    // RLS normally applies this; a SECURITY DEFINER function has to do it itself.
    expect(guard).toMatch(/is_org_suspended\(\)/);
  });

  it("read is open to staff but writes are not", () => {
    const directory = SQL.slice(
      SQL.indexOf("FUNCTION public.branch_directory"),
      SQL.indexOf("FUNCTION public.create_branch"),
    );
    expect(directory).toMatch(/is_staff\(\)/);
    expect(directory).not.toMatch(/assert_can_manage_branches/);
  });

  it("revokes before granting, because anon already had EXECUTE", () => {
    // Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on every new
    // function in `public` to anon, authenticated and service_role. A file
    // that only GRANTs to authenticated changes nothing — verified by reading
    // the ACL back after the first apply, where all five came back `anon=X`.
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION[\s\S]{0,120}FROM PUBLIC, anon/);

    const grants = SQL.match(/GRANT EXECUTE[^;]+;/g) ?? [];
    expect(grants.length).toBe(4);
    for (const g of grants) expect(g).not.toMatch(/\banon\b/);
  });

  it("the internal guard is not callable from the client at all", () => {
    expect(SQL).toMatch(
      /assert_can_manage_branches\(\) '[\s\S]{0,80}FROM PUBLIC, anon, authenticated/,
    );
    const grants = SQL.match(/GRANT EXECUTE[^;]+;/g) ?? [];
    for (const g of grants) {
      expect(g, "the guard is granted to a client role")
        .not.toMatch(/assert_can_manage_branches/);
    }
  });

  it("asserts the resulting ACL instead of assuming the statements worked", () => {
    expect(SQL).toMatch(/anon or PUBLIC can still execute a branch function/);
    expect(SQL).toMatch(/the internal guard is callable from the client/);
  });
});

describe("An organization is never left without a primary branch", () => {
  it("the first branch becomes primary whichever way it was created", () => {
    const create = SQL.slice(
      SQL.indexOf("FUNCTION public.create_branch"),
      SQL.indexOf("FUNCTION public.update_branch"),
    );
    expect(create).toMatch(/NOT EXISTS[\s\S]{0,160}is_primary[\s\S]{0,160}SET is_primary = true/);
  });

  it("deleting the primary hands the flag on", () => {
    // Found by running delete_branch against the live schema: an empty branch
    // IS deletable and may well be the primary, and the delete succeeded
    // leaving the tenant with none. Nothing downstream would have complained.
    const del = SQL.slice(SQL.indexOf("FUNCTION public.delete_branch"));
    expect(del).toMatch(/was_primary/);
    expect(del).toMatch(/SET is_primary = true/);
  });

  it("update refuses to unset or deactivate the last primary", () => {
    const update = SQL.slice(
      SQL.indexOf("FUNCTION public.update_branch"),
      SQL.indexOf("FUNCTION public.delete_branch"),
    );
    expect(update).toMatch(/was_primary AND _is_active IS FALSE/);
    expect(update).toMatch(/was_primary AND _is_primary IS FALSE/);
  });

  it("the last branch cannot be deleted at all", () => {
    expect(SQL).toMatch(/must keep at least one branch/);
  });
});

describe("Deleting a branch cannot orphan records", () => {
  it("discovers blocking foreign keys instead of listing them", () => {
    // Nine tables block a campus delete today. A hand-written list would go
    // stale the moment a tenth arrives, and the user would meet a raw 23503
    // with a constraint name in it.
    const del = SQL.slice(SQL.indexOf("FUNCTION public.delete_branch"));
    expect(del).toMatch(/pg_constraint/);
    expect(del).toMatch(/confdeltype IN \('a', 'r'\)/);
    expect(del).toMatch(/blockers/);
  });

  it("names what is in the way", () => {
    expect(SQL).toMatch(/still in use by %/);
  });

  it("the UI hides Delete until every count is zero", () => {
    expect(branchIsDeletable(branch())).toBe(true);
    expect(branchIsDeletable(branch({ studentCount: 1 }))).toBe(false);
    expect(branchIsDeletable(branch({ staffCount: 1 }))).toBe(false);
    expect(branchIsDeletable(branch({ batchCount: 1 }))).toBe(false);
  });

  it("the page gates Delete on that check, not on a role alone", () => {
    expect(PAGE).toMatch(/canDelete && branchIsDeletable\(b\) && rows\.length > 1/);
  });
});

describe("Plan limits stay the database's job", () => {
  it("the migration does not re-implement the limit", () => {
    // A second copy of the rule is a second thing to get wrong. The INSERT
    // into campuses fires trg_enforce_plan_limit and its message propagates.
    expect(SQL).not.toMatch(/plan_limit\(/);
    expect(MIGRATION).toMatch(/trg_enforce_plan_limit/);
  });

  it("the usage read fails OPEN", () => {
    // If usage_status() is slow or errors, the page must not lock a paying
    // customer out of a branch they are entitled to. The trigger says no if
    // it really is a no.
    expect(PAGE).toMatch(/allowance\?\.atLimit \?\? false/);
    // An absent limit is unlimited, never "you have used them all".
    expect(HOOKS).toMatch(/atLimit: limit !== null && used >= limit/);
    // No throw on a missing usage row — a blank read is 0 used, not a lockout.
    expect(HOOKS).toMatch(/Number\(row\?\.used \?\? 0\)/);
  });

  it("surfaces the server's own message rather than a generic one", () => {
    expect(SERVICE).toMatch(/AppError\.fromSupabase\(error, "create_branch"\)/);
    expect(HOOKS).toMatch(/err instanceof Error \? err\.message/);
  });
});

describe("Branch changes reach the rest of the product", () => {
  it("invalidates every namespace that renders a campus", () => {
    // students, fees, exams, live classes, comms and reports all read campuses
    // through their own lookup caches. Without the fan-out a new branch is
    // missing from every dropdown until a hard reload.
    expect(HOOKS).toMatch(/invalidateSetupLookups/);
  });

  it("refreshes the plan counter after a write", () => {
    expect(HOOKS).toMatch(/queryKeys\.setup\.branchUsage\(\)/);
  });
});

describe("The module is registered everywhere RBAC looks", () => {
  const setup = MODULE_CATALOG.find((m) => m.id === "setup");

  it("both submodules are in the catalog", () => {
    const ids = (setup?.submodules ?? []).map((s) => s.id);
    expect(ids).toContain("setup.add_branch");
    expect(ids).toContain("setup.manage_branch");
  });

  it("create / edit / delete are separately grantable", () => {
    const ids = ACTION_CATALOG.map((a) => a.id);
    for (const id of ["setup.branch.create", "setup.branch.edit", "setup.branch.delete"]) {
      expect(ids, `${id} missing from ACTION_CATALOG`).toContain(id);
    }
  });

  it("every branch action hangs off a real submodule", () => {
    const submodules = new Set((setup?.submodules ?? []).map((s) => s.id));
    for (const a of ACTION_CATALOG.filter((x) => x.id.startsWith("setup.branch."))) {
      expect(submodules, `${a.id} → ${a.submoduleId}`).toContain(a.submoduleId);
    }
  });

  it("appears in the Setup menu for every role allowed to see Setup", () => {
    const group = NAV_CONFIG.find((g) => g.key === "setup");
    const items = (group?.items ?? []).filter((i) => i.submodule === "setup.manage_branch");
    expect(items.length).toBeGreaterThan(0);
    const roles = new Set(items.flatMap((i) => i.roles ?? []));
    expect(roles.has("admin")).toBe(true);
    expect(roles.has("management")).toBe(true);
  });

  it("has a real route, not a coming-soon placeholder", () => {
    const routes = SHARED_ROUTES.filter((r) => r.submodule?.startsWith("setup."))
      .filter((r) => r.path === "setup/branches");
    expect(routes.length).toBe(2); // manage + add, sharing one page
    for (const item of NAV_CONFIG.find((g) => g.key === "setup")?.items ?? []) {
      if (item.submodule !== "setup.manage_branch") continue;
      expect(item.path, "branch menu item points at coming-soon")
        .not.toMatch(/coming-soon/);
    }
  });

  it("the page checks the actions it declares", () => {
    for (const action of ["setup.branch.create", "setup.branch.edit", "setup.branch.delete"]) {
      expect(PAGE, `${action} declared but never checked`).toContain(action);
    }
  });
});

describe("Branch details are validated before they reach the database", () => {
  it("accepts a plain named branch", () => {
    const r = validate(branchSchema, { name: "North Campus" });
    expect(r.ok).toBe(true);
  });

  it("rejects a one-character name", () => {
    const r = validate(branchSchema, { name: "N" });
    expect(r.ok).toBe(false);
  });

  it("refuses half a coordinate", () => {
    // A lone latitude puts the geofence in the Gulf of Guinea, and every
    // staff check-in at the real building is then recorded as invalid — the
    // precise failure Phase 8 was created to fix for ABC Academi.
    const r = validate(branchSchema, { name: "North", geoLat: 13.0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toContain("geoLng");
  });

  it("accepts a complete coordinate pair", () => {
    const r = validate(branchSchema, { name: "North", geoLat: 13.0, geoLng: 80.19 });
    expect(r.ok).toBe(true);
  });

  it("rejects an out-of-range coordinate", () => {
    const r = validate(branchSchema, { name: "North", geoLat: 99, geoLng: 80.19 });
    expect(r.ok).toBe(false);
  });
});

describe("The migration is safe to run on a live database", () => {
  it("touches no table and no row", () => {
    expect(SQL).not.toMatch(/\bALTER TABLE\b/);
    expect(SQL).not.toMatch(/\bDROP\s+(TABLE|POLICY|COLUMN)\b/i);

    // DML is legitimate INSIDE a function body — that runs per call, when a
    // user asks for it. What must not exist is DML at the top level, which
    // would run once against live rows the moment the migration is applied.
    const topLevel = SQL.replace(/AS \$\$[\s\S]*?\$\$;/g, "BODY")
      .replace(/DO \$\$[\s\S]*?\$\$;/g, "VERIFY")
      // COMMENT ON text is prose, and prose about "create/update/delete" is
      // not a statement. Drop string literals before looking for keywords.
      .replace(/'(?:[^']|'')*'/g, "'…'");
    expect(topLevel).not.toMatch(/\b(INSERT INTO|UPDATE|DELETE FROM)\b/i);
  });

  it("is idempotent", () => {
    const creates = SQL.match(/CREATE (OR REPLACE )?FUNCTION/g) ?? [];
    const replaces = SQL.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    expect(replaces.length).toBe(creates.length);
  });

  it("verifies itself rather than assuming it worked", () => {
    expect(SQL).toMatch(/RAISE EXCEPTION 'branch_management: functions not created/);
  });
});
