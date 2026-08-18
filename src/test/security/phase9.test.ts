import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  resolveEntitlements, enabledSet, entitlementFlags, type EntitlementLayers,
} from "@/features/platform/modules/entitlements";
import {
  PLATFORM_MODULES, MODULE_METADATA, MODULE_IDS, checkDisable, checkEnable,
} from "@/features/platform/modules/moduleRegistry";
import { MODULE_CATALOG } from "@/features/rbac/constants/catalog";
import { resolveAccess } from "@/features/rbac/resolver/rbacResolver";

// ════════════════════════════════════════════════════════════════════════════
// PHASE 9A — PLATFORM SUPER ADMIN CONTROL CENTER
//
// Two things this suite exists to catch, both of which would be invisible in
// a screenshot and both of which have already happened once in this codebase:
//
//   1. AN ENTITLEMENT THAT NOBODY READS. `organization_features` shipped in
//      Phase 2C and was written to for months while no consumer existed. The
//      switch moved, a row was written, and the tenant's sidebar never
//      changed. The tests below assert the READ path exists end to end.
//
//   2. A CONTROL PLANE THAT GREW AN RLS BYPASS. Adding `OR
//      is_platform_admin()` to a tenant policy is one line, "just works", and
//      converts one compromised support account into a total breach of every
//      customer simultaneously. The mutation gate at the bottom fails the
//      build if that line ever appears.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const MIGRATION = read("supabase/migrations/20261001_phase9a_platform_control_center.sql");
const EDGE = read("supabase/functions/platform-admin/index.ts");
const SERVICE = read("src/features/platform/services/platform.service.ts");
const RESOLVER = read("src/features/rbac/resolver/rbacResolver.ts");

/** SQL comments discuss what is NOT done; only executable statements count. */
const executable = MIGRATION.replace(/^\s*--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── Test fixtures ───────────────────────────────────────────────────────────

const layers = (over: Partial<EntitlementLayers> = {}): EntitlementLayers => ({
  status: "active",
  plan_code: "growth",
  plan_id: "plan-1",
  governance: {},
  plan: {},
  overrides: {},
  ...over,
});

// ════════════════════════════════════════════════════════════════════════════
// 1 — THE REGISTRY IS DERIVED, NOT DUPLICATED
// ════════════════════════════════════════════════════════════════════════════

describe("The platform module registry stays in step with the RBAC catalog", () => {
  it("covers exactly the catalog's modules — no more, no fewer", () => {
    // A second module list is a list that will eventually disagree with the
    // first, and the symptom is a control plane offering to grant something
    // the product does not have.
    expect([...MODULE_IDS].sort()).toEqual(MODULE_CATALOG.map((m) => m.id).sort());
  });

  it("gives every module a category, a description and a dependency list", () => {
    for (const m of PLATFORM_MODULES) {
      expect(m.category, `${m.id} has no category`).toBeTruthy();
      expect(m.description.length, `${m.id} has no description`).toBeGreaterThan(20);
      expect(Array.isArray(m.dependsOn)).toBe(true);
    }
  });

  it("declares no dependency on a module that does not exist", () => {
    for (const m of PLATFORM_MODULES) {
      for (const dep of m.dependsOn) {
        expect(MODULE_IDS, `${m.id} depends on unknown module ${dep}`).toContain(dep);
      }
    }
  });

  it("has no dependency cycles", () => {
    // A cycle would make "disable X first" advice unfollowable in both
    // directions — the operator is told to disable A before B and B before A.
    const seen = new Set<string>();
    const stack = new Set<string>();
    const visit = (id: string): void => {
      if (stack.has(id)) throw new Error(`dependency cycle at ${id}`);
      if (seen.has(id)) return;
      stack.add(id);
      for (const d of MODULE_METADATA[id as never]?.dependsOn ?? []) visit(d);
      stack.delete(id);
      seen.add(id);
    };
    expect(() => MODULE_IDS.forEach(visit)).not.toThrow();
  });

  it("never marks an essential module as depending on a non-essential one", () => {
    // A core module that needs an optional one is core in name only: revoking
    // the optional module would break something declared unbreakable.
    for (const m of PLATFORM_MODULES) {
      if (!m.essential) continue;
      for (const d of m.dependsOn) {
        expect(MODULE_METADATA[d].essential, `${m.id} (core) depends on optional ${d}`).toBe(true);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 — PRECEDENCE
// ════════════════════════════════════════════════════════════════════════════

describe("Entitlement precedence is deterministic", () => {
  it("defaults to INCLUDED when nothing says otherwise", () => {
    // The single most consequential default in this phase. `plan_features` is
    // sparsely populated in production; defaulting to "excluded" would have
    // switched every module off for every existing customer the moment this
    // shipped — a total outage dressed up as a feature launch.
    const r = resolveEntitlements(layers());
    expect(r.fee.enabled).toBe(true);
    expect(r.fee.source).toBe("default");
  });

  it("lets the plan exclude a module", () => {
    const r = resolveEntitlements(layers({ plan: { payroll: { enabled: false, limit: null } } }));
    expect(r.payroll.enabled).toBe(false);
    expect(r.payroll.source).toBe("plan");
  });

  it("lets a Super Admin override BEAT the plan", () => {
    const r = resolveEntitlements(
      layers({
        plan: { payroll: { enabled: false, limit: null } },
        overrides: {
          payroll: { enabled: true, reason: "sales_override", expires_at: null, updated_at: "" },
        },
      }),
    );
    expect(r.payroll.enabled).toBe(true);
    expect(r.payroll.source).toBe("override");
    // The console has to be able to say "enabled DESPITE the plan" — that is
    // the difference between a billing conversation and a bug report.
    expect(r.payroll.overridesPlan).toBe(true);
  });

  it("lets organization STATUS beat both plan and override", () => {
    const r = resolveEntitlements(
      layers({
        status: "suspended",
        plan: { payroll: { enabled: true, limit: null } },
        overrides: {
          payroll: { enabled: true, reason: "sales_override", expires_at: null, updated_at: "" },
        },
      }),
    );
    expect(r.payroll.enabled).toBe(false);
    expect(r.payroll.source).toBe("organization_status");
  });

  it("lets GLOBAL GOVERNANCE beat everything", () => {
    const r = resolveEntitlements(
      layers({
        governance: { whatsapp: false },
        plan: { whatsapp: { enabled: true, limit: null } },
        overrides: {
          whatsapp: { enabled: true, reason: "beta", expires_at: null, updated_at: "" },
        },
      }),
    );
    expect(r.whatsapp.enabled).toBe(false);
    expect(r.whatsapp.source).toBe("global_governance");
  });

  it("keeps core modules on regardless of plan or override", () => {
    const r = resolveEntitlements(
      layers({
        plan: { student: { enabled: false, limit: null } },
        overrides: {
          student: { enabled: false, reason: "incident", expires_at: null, updated_at: "" },
        },
      }),
    );
    expect(r.student.enabled).toBe(true);
    expect(r.student.source).toBe("essential");
  });
});

describe("Lifecycle states restrict without destroying", () => {
  it("a HOLD leaves sign-in, fees and export reachable", () => {
    const r = resolveEntitlements(layers({ status: "hold" }));
    // Taking export away from a customer you have just paused is how a billing
    // dispute becomes a data-hostage complaint.
    expect(r.fee.enabled).toBe(true);
    expect(r.reports.enabled).toBe(true);
    expect(r.settings.enabled).toBe(true);
    expect(r.exam.enabled).toBe(false);
    expect(r.whatsapp.enabled).toBe(false);
  });

  it("a SUSPENSION is narrower than a hold but still allows paying", () => {
    const r = resolveEntitlements(layers({ status: "suspended" }));
    expect(r.fee.enabled).toBe(true);
    expect(r.settings.enabled).toBe(true);
    expect(r.reports.enabled).toBe(false);
    expect(r.attendance.enabled).toBe(false);
  });

  it("an ARCHIVED organization has nothing enabled", () => {
    const r = resolveEntitlements(layers({ status: "archived" }));
    expect(enabledSet(r).size).toBe(0);
  });

  it("past_due keeps the product running", () => {
    // Cutting a customer off the moment an invoice ages is a billing lifecycle
    // decision that belongs to Phase 5's grace period, not to this gate.
    const r = resolveEntitlements(layers({ status: "past_due" }));
    expect(r.exam.enabled).toBe(true);
  });
});

describe("Temporary overrides expire on their own", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it("applies an override that has not lapsed", () => {
    const r = resolveEntitlements(
      layers({
        plan: { payroll: { enabled: false, limit: null } },
        overrides: {
          payroll: { enabled: true, reason: "trial", expires_at: future, updated_at: "" },
        },
      }),
    );
    expect(r.payroll.enabled).toBe(true);
    expect(r.payroll.expiresAt).toBe(future);
  });

  it("IGNORES a lapsed override and falls back to the plan", () => {
    // Correctness must not depend on the sweeper having run. A grant that
    // expired on Friday must be gone on Saturday whether or not a cron fired.
    const r = resolveEntitlements(
      layers({
        plan: { payroll: { enabled: false, limit: null } },
        overrides: {
          payroll: { enabled: true, reason: "trial", expires_at: past, updated_at: "" },
        },
      }),
    );
    expect(r.payroll.enabled).toBe(false);
    expect(r.payroll.source).toBe("plan");
  });

  it("the sweeper DELETES expired rows rather than flipping them to false", () => {
    // Flipping would silently convert an expired GRANT into an active DENIAL,
    // which is a different and much worse outcome than returning to the plan.
    const fn = executable.slice(executable.indexOf("FUNCTION public.expire_organization_features"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toMatch(/DELETE FROM public\.organization_features/);
    expect(body).not.toMatch(/SET\s+enabled\s*=\s*false/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 — DEPENDENCIES
// ════════════════════════════════════════════════════════════════════════════

describe("Dependencies are enforced in the direction that matters", () => {
  const allOn = new Set(MODULE_IDS as string[]);

  it("refuses to disable a module that other modules read from", () => {
    const block = checkDisable("staff_user", allOn);
    expect(block).not.toBeNull();
    // staff_user is core, so the refusal is the essential one.
    expect(block!.kind).toBe("essential");
  });

  it("refuses to disable a non-core module with live dependants", () => {
    // A synthetic graph would prove nothing about the real product; assert on
    // whichever real module actually has dependants.
    const withDependants = PLATFORM_MODULES.find((m) => !m.essential && m.requiredBy.length > 0);
    if (!withDependants) return; // no such module today — nothing to assert
    const block = checkDisable(withDependants.id, allOn);
    expect(block?.kind).toBe("has_dependants");
    expect(block!.modules.length).toBeGreaterThan(0);
  });

  it("allows disabling a module nothing depends on", () => {
    expect(checkDisable("certificate", allOn)).toBeNull();
  });

  it("WARNS rather than refuses when enabling with a dependency missing", () => {
    // Refusing outright would make "grant Payroll" fail for a customer who
    // simply has not been given Staff yet — a support ticket, not a safeguard.
    const only = new Set<string>(["fee"]);
    const block = checkEnable("payroll", only);
    expect(block?.kind).toBe("missing_dependencies");
    expect(block!.modules).toContain("staff_user");
  });

  it("is silent when the dependencies are already on", () => {
    expect(checkEnable("payroll", allOn)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 — THE READ PATH ACTUALLY EXISTS
//
// The failure this whole phase was written to fix.
// ════════════════════════════════════════════════════════════════════════════

describe("Entitlements are ENFORCED, not merely stored", () => {
  const base = {
    role: "teacher",
    rolePermissions: [],
    userOverrides: [],
    roleActions: [],
    userActionOverrides: [],
  };

  it("hides a module the organization is not entitled to", () => {
    const r = resolveAccess({ ...base, moduleEntitlements: { payroll: false } });
    expect(r.modules.payroll.allowed).toBe(false);
    expect(r.modules.payroll.source).toBe("entitlement");
  });

  it("hides it from MANAGEMENT too — a tenant super-role cannot buy a module", () => {
    // The ordering that makes entitlement a commercial boundary rather than a
    // suggestion. If super_role won here, every customer's own admin could
    // restore anything the platform withdrew.
    const r = resolveAccess({ ...base, role: "management", moduleEntitlements: { payroll: false } });
    expect(r.isSuper).toBe(true);
    expect(r.modules.payroll.allowed).toBe(false);
    expect(r.modules.payroll.source).toBe("entitlement");
    // …and everything else still works exactly as before.
    expect(r.modules.student.allowed).toBe(true);
  });

  it("hides the module's submodules and actions, not just its menu entry", () => {
    // Hiding the sidebar link while leaving the routes and actions reachable
    // is security theatre — the URL is still typeable.
    const r = resolveAccess({ ...base, role: "management", moduleEntitlements: { payroll: false } });
    const subs = MODULE_CATALOG.find((m) => m.id === "payroll")!.submodules;
    for (const s of subs) expect(r.submodules[s.id].allowed).toBe(false);
  });

  it("a per-USER override cannot resurrect an unentitled module", () => {
    const r = resolveAccess({
      ...base,
      userOverrides: [{ moduleId: "payroll", canView: true } as never],
      moduleEntitlements: { payroll: false },
    });
    expect(r.modules.payroll.allowed).toBe(false);
  });

  it("FAILS OPEN when entitlements are unknown", () => {
    // One failed RPC must not black out a paying school's portal. The data is
    // protected by RLS regardless; entitlement gates the UI, never the rows.
    const r = resolveAccess({ ...base, role: "management" });
    expect(r.modules.payroll.allowed).toBe(true);
    const partial = resolveAccess({ ...base, role: "management", moduleEntitlements: {} });
    expect(partial.modules.payroll.allowed).toBe(true);
  });

  it("wires the tenant hook into the resolver input", () => {
    // Guards against the exact regression this phase fixed: a resolver that
    // ACCEPTS entitlements while no caller ever passes them.
    const hook = read("src/features/rbac/hooks/useEffectiveAccess.ts");
    expect(hook).toMatch(/useModuleEntitlements/);
    expect(hook).toMatch(/moduleEntitlements:\s*entitlements\.data\?\.flags/);
    expect(RESOLVER).toMatch(/input\.moduleEntitlements/);
  });

  it("resolves via an argument-free RPC, so a tenant cannot ask about another org", () => {
    const hook = read("src/features/rbac/hooks/useModuleEntitlements.ts");
    expect(hook).toMatch(/my_module_entitlements/);
    // No organization id is passed. There is nothing to tamper with.
    expect(hook).not.toMatch(/my_module_entitlements[^)]*_org/);
    expect(executable).toMatch(/FUNCTION public\.my_module_entitlements\(\)/);
    expect(executable).toMatch(/_org\s*:=\s*public\.current_org_id\(\)/);
  });

  it("uses ONE resolution algorithm for tenant and console alike", () => {
    // Two implementations of one precedence rule drift, and the symptom is a
    // customer seeing a module the platform believes they do not have.
    const hook = read("src/features/rbac/hooks/useModuleEntitlements.ts");
    const panel = read("src/features/platform/components/ModuleEntitlementsPanel.tsx");
    expect(hook).toMatch(/resolveEntitlements/);
    expect(panel).toMatch(/resolveEntitlements/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 — REVOKING NEVER DESTROYS
// ════════════════════════════════════════════════════════════════════════════

describe("Disabling a module never removes tenant data", () => {
  it("the entitlement function touches no tenant table", () => {
    const fn = executable.slice(
      executable.indexOf("FUNCTION public.platform_set_module_entitlement"),
    );
    const body = fn.slice(0, fn.indexOf("$$;"));
    // The ONLY tables it writes are the two entitlement tables.
    expect(body).not.toMatch(/DELETE\s+FROM\s+public\.(students|student_fees|payroll|exam)/i);
    expect(body).toMatch(/INSERT INTO public\.organization_features/);
    expect(body).toMatch(/INSERT INTO public\.feature_flag_assignments/);
  });

  it("no migration statement deletes from a tenant business table", () => {
    const forbidden =
      /\b(DELETE\s+FROM|TRUNCATE)\s+(public\.)?(students|student_fees|fee_installments|payroll_runs|payslips|exam_results|teacher_attendance|student_attendance|profiles|leads)\b/i;
    expect(executable).not.toMatch(forbidden);
  });

  it("does not UPDATE any ARK row — protection is a row in a NEW table", () => {
    // The seeding block reads organizations and writes organization_protections.
    // An UPDATE against organizations here would be a change to live production
    // data made by a migration nobody reviewed for that.
    const seed = executable.slice(executable.indexOf("slug = 'ark'") - 400);
    const block = seed.slice(0, seed.indexOf("END $$;") + 7);
    expect(block).toMatch(/INSERT INTO public\.organization_protections/);
    expect(block).not.toMatch(/UPDATE\s+public\.organizations/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6 — ARK PROTECTION
// ════════════════════════════════════════════════════════════════════════════

describe("The production reference tenant is protected at the database level", () => {
  it("guards lifecycle changes with a trigger, not just with UI copy", () => {
    // UI-only protection is protection a direct service-role call walks past —
    // and every platform mutation in this system IS a service-role call.
    expect(executable).toMatch(/CREATE TRIGGER trg_guard_protected_org_update/);
    expect(executable).toMatch(/BEFORE UPDATE ON public\.organizations/);
    expect(executable).toMatch(/CREATE TRIGGER trg_guard_protected_org_delete/);
  });

  it("blocks suspend / hold / archive / cancel without an acknowledgement", () => {
    const fn = executable.slice(executable.indexOf("FUNCTION public.guard_protected_organization"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    for (const s of ["suspended", "hold", "archived", "cancelled"]) {
      expect(body, `guard does not cover ${s}`).toContain(s);
    }
    expect(body).toMatch(/RAISE EXCEPTION/);
  });

  it("scopes the acknowledgement to the TRANSACTION", () => {
    // set_config(..., true) is transaction-local. Without the `true`, an
    // acknowledgement would leak onto the next statement on a pooled
    // connection and the guard would be worthless in production.
    expect(executable).toMatch(/set_config\('app\.protected_org_ack',\s*_org::text,\s*true\)/);
  });

  it("identifies ARK by its stable slug ONCE, then by uuid forever after", () => {
    expect(executable).toMatch(/WHERE slug = 'ark'/);
    // Protection is keyed on the uuid, so a later rename cannot unprotect it.
    expect(executable).toMatch(/organization_id uuid PRIMARY KEY/);
  });

  it("excludes protected organizations from every bulk operation", () => {
    const bulk = EDGE.slice(EDGE.indexOf('action === "bulk_modules"'));
    expect(bulk).toMatch(/organization_protections/);
    expect(bulk).toMatch(/block_bulk/);
    expect(bulk).toMatch(/skipped: "protected organization"/);
  });

  it("refuses a delete request for a protected organization", () => {
    const fn = executable.slice(
      executable.indexOf("FUNCTION public.platform_request_organization_delete"),
    );
    expect(fn.slice(0, fn.indexOf("$$;"))).toMatch(/is_protected_organization/);
  });

  it("gives protection NO write policy for authenticated users", () => {
    // Protection that the protected party — or a compromised platform account —
    // can switch off from the browser is decoration.
    const policies = executable.match(/CREATE POLICY \w+ ON public\.organization_protections[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) expect(p).toMatch(/FOR SELECT/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7 — IDEMPOTENCY & CONCURRENCY
// ════════════════════════════════════════════════════════════════════════════

describe("Every action is safe to repeat", () => {
  it("grants upsert on the natural key, so a second grant cannot duplicate", () => {
    expect(executable).toMatch(/ON CONFLICT \(organization_id, feature_key\) DO UPDATE/);
  });

  it("re-applying the same status is a no-op rather than a second audit row", () => {
    const fn = executable.slice(executable.indexOf("FUNCTION public.platform_set_organization_status"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toMatch(/IF _before = _status THEN/);
    expect(body).toMatch(/'changed',\s*false/);
    expect(EDGE).toMatch(/if \(result\?\.changed\)/);
  });

  it("clearing an absent override succeeds instead of erroring", () => {
    const fn = executable.slice(executable.indexOf("FUNCTION public.platform_clear_module_override"));
    expect(fn.slice(0, fn.indexOf("$$;"))).toMatch(/'removed',\s*_had IS NOT NULL/);
  });

  it("a duplicate delete request returns the open one", () => {
    const fn = executable.slice(
      executable.indexOf("FUNCTION public.platform_request_organization_delete"),
    );
    expect(fn.slice(0, fn.indexOf("$$;"))).toMatch(/'created',\s*false/);
    expect(executable).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS org_delete_requests_open_idx/);
  });

  it("refuses a stale write rather than silently overwriting a colleague", () => {
    const fn = executable.slice(
      executable.indexOf("FUNCTION public.platform_update_organization_profile"),
    );
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toMatch(/_expected_updated_at/);
    expect(body).toMatch(/stale_write/);
    // …and the UI turns that into a sentence an operator can act on.
    expect(EDGE).toMatch(/changed by someone else/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8 — DELETION IS HONEST
// ════════════════════════════════════════════════════════════════════════════

describe("Deletion is a reviewed request, never a button that erases", () => {
  // Erasure became real in 20261010_organization_purge.sql. What must stay
  // true of PHASE 9A is that the request/review path is not itself a delete:
  // opening a request and approving it move a status column and nothing else.
  // The erasure is a separate, owner-only action standing behind these gates —
  // see src/test/security/organizationPurge.test.ts.
  it("the request/review path still deletes nothing", () => {
    expect(executable).not.toMatch(/DELETE\s+FROM\s+public\.organizations\b/i);
    expect(EDGE).not.toMatch(/\.from\("organizations"\)[\s\S]{0,80}\.delete\(\)/);
    // Approving a request may only move its own status column.
    const review = executable.slice(
      executable.indexOf("FUNCTION public.platform_review_delete_request"),
    );
    const body = review.slice(0, review.indexOf("$$;"));
    expect(body).not.toMatch(/DELETE\s+FROM/i);
  });

  it("requires a two-person review with a cooling-off period", () => {
    const fn = executable.slice(executable.indexOf("FUNCTION public.platform_review_delete_request"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    // Without the two-person rule, "request then approve" is a two-click
    // delete button wearing a costume.
    expect(body).toMatch(/_r\.requested_by = _actor/);
    expect(body).toMatch(/now\(\) < _r\.eligible_at/);
  });

  it("verifies the typed slug confirmation SERVER-side", () => {
    const req = EDGE.slice(EDGE.indexOf('action === "request_delete"'));
    expect(req).toMatch(/confirmSlug !== org\.slug/);
  });

  it("tells the operator plainly what erasure does now", () => {
    // This asserted the OPPOSITE until erasure was built — "does not support
    // one-click tenant erasure" — and that was the honest copy at the time.
    // The screen has to describe the product it is attached to, so the gate
    // moved with the behaviour instead of being deleted.
    const page = read("src/features/platform/pages/OrganizationDetailPage.tsx");
    expect(page).toMatch(/irreversible/i);
    expect(page).toMatch(/cooling-off/i);
    expect(page).toMatch(/only an\s+owner/i);
    // Archive is still the recommendation, and now also the prerequisite.
    expect(page).toMatch(/Archive first/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9 — CAPABILITIES & AUDIT
// ════════════════════════════════════════════════════════════════════════════

describe("Capabilities are separated, not lumped together", () => {
  const CAPS = [
    "organizations.hold", "organizations.archive", "organizations.delete_request",
    "modules.grant", "modules.revoke", "modules.bulk", "modules.govern",
  ];

  it("registers every new capability in the role table", () => {
    for (const c of CAPS) expect(executable, `${c} missing`).toContain(`'${c}'`);
  });

  it("declares them in the TypeScript capability union too", () => {
    // A capability the edge function checks but the UI type does not know is a
    // button that can never be rendered.
    const ctx = read("src/features/platform/context/PlatformAuthContext.tsx");
    for (const c of CAPS) expect(ctx, `${c} not in PlatformCapability`).toContain(`"${c}"`);
  });

  it("does NOT give auditor or support any mutating capability", () => {
    // auditor is read-only by definition; support reads and impersonates.
    const grants = executable.slice(
      executable.indexOf("INSERT INTO public.platform_role_capabilities (role, capability) VALUES"),
    );
    const block = grants.slice(0, grants.indexOf("ON CONFLICT"));
    for (const c of ["modules.grant", "modules.bulk", "organizations.archive"]) {
      expect(block).not.toMatch(new RegExp(`\\('auditor','${c.replace(".", "\\.")}'\\)`));
      expect(block).not.toMatch(new RegExp(`\\('support','${c.replace(".", "\\.")}'\\)`));
    }
  });

  it("keeps bulk away from customer_success", () => {
    // A CS operator should never be able to change 40 customers at once.
    const grants = executable.slice(
      executable.indexOf("INSERT INTO public.platform_role_capabilities (role, capability) VALUES"),
    );
    const block = grants.slice(0, grants.indexOf("ON CONFLICT"));
    expect(block).not.toMatch(/\('customer_success','modules\.bulk'\)/);
  });

  it("gates each edge action on its own capability", () => {
    for (const [action, cap] of [
      ["bulk_modules", "modules.bulk"],
      ["set_module_governance", "modules.govern"],
      ["request_delete", "organizations.delete_request"],
      ["review_delete", "organizations.review_delete"],
    ] as const) {
      const seg = EDGE.slice(EDGE.indexOf(`action === "${action}"`));
      expect(seg.slice(0, 400), `${action} is not capability-gated`).toContain(cap);
    }
  });
});

describe("Every administrative action is audited", () => {
  it("writes an audit row for each mutating action", () => {
    for (const marker of [
      "organization.profile_update", "module.granted", "module.revoked",
      "module.bulk", "module.globally_withdrawn", "organization.delete_requested",
    ]) {
      expect(EDGE, `${marker} is never audited`).toContain(marker);
    }
  });

  it("audits each organization in a bulk change individually", () => {
    // "We changed 23 schools" is not an auditable record of anything.
    const bulk = EDGE.slice(EDGE.indexOf('action === "bulk_modules"'));
    const body = bulk.slice(0, bulk.indexOf('action === "set_module_governance"'));
    expect(body).toMatch(/for \(const orgId of organizationIds\)/);
    expect(body).toMatch(/organization_id: orgId/);
    expect(body).toMatch(/batchId/);
  });

  it("requires a reason for every destructive action", () => {
    expect(EDGE).toMatch(/A reason is required to suspend, hold, archive or cancel/);
    expect(EDGE).toMatch(/A reason note is required for bulk entitlement changes/);
    expect(EDGE).toMatch(/Withdrawing a module platform-wide requires a note/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10 — THE MUTATION GATE
//
// The invariant Phase 2A was built around, restated so that Phase 9A cannot
// quietly undo it.
// ════════════════════════════════════════════════════════════════════════════

describe("The control plane still has NO tenant RLS bypass", () => {
  const MIGRATION_DIR = join(ROOT, "supabase", "migrations");

  /** Tenant business tables — the ones impersonation exists to gate. */
  const TENANT_TABLES = [
    "students", "student_fees", "fee_installments", "payroll_runs", "payslips",
    "exam_results", "teacher_attendance", "student_attendance", "profiles",
    "leads", "message_queue", "tasks", "leave_requests",
  ];

  it("no migration grants a platform admin blanket access to a tenant table", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(MIGRATION_DIR).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(MIGRATION_DIR, file), "utf8")
        .replace(/^\s*--.*$/gm, "");
      for (const policy of sql.match(/CREATE POLICY[\s\S]*?;/g) ?? []) {
        const table = policy.match(/ON public\.(\w+)/)?.[1];
        if (!table || !TENANT_TABLES.includes(table)) continue;
        if (/is_platform_admin\s*\(/.test(policy)) offenders.push(`${file}: ${table}`);
      }
    }
    // If this ever fails, the fix is to DELETE the policy — not to add the
    // table to an allow-list here. One compromised support account would
    // otherwise equal a simultaneous breach of every customer's data.
    expect(offenders, `platform RLS bypass introduced:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the phase 9A migration verifies this itself, at deploy time", () => {
    // A test that runs in CI protects the repository. The DO block protects the
    // database even when someone applies SQL by hand.
    expect(executable).toMatch(/is_platform_admin/);
    expect(executable).toMatch(/tenant policies reference is_platform_admin/);
  });

  it("the platform service reads no tenant table", () => {
    // Comments are stripped first. The file's own header explains the rule by
    // quoting `.from("students")` as the thing that must never appear, and a
    // gate that fails on its own documentation teaches people to delete the
    // documentation.
    const code = SERVICE
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const t of TENANT_TABLES) {
      expect(code, `platform service reads ${t}`).not.toContain(`.from("${t}"`);
    }
  });

  it("privileged mutations are revoked from authenticated and granted to service_role", () => {
    // The capability check lives in the edge function, where the caller's
    // platform identity is resolvable. Leaving these callable by
    // `authenticated` would make that check optional.
    expect(executable).toMatch(/REVOKE ALL ON FUNCTION public\.%s FROM public, anon, authenticated/);
    expect(executable).toMatch(/GRANT EXECUTE ON FUNCTION public\.%s TO service_role/);
    for (const f of [
      "platform_set_organization_status", "platform_set_module_entitlement",
      "platform_request_organization_delete", "platform_review_delete_request",
    ]) {
      expect(executable, `${f} not revoked`).toContain(f);
    }
  });

  it("the raw layer function is not directly callable by a client", () => {
    // entitlement_layers() performs no authorization; both wrappers supply
    // their own. Exposing it would let any authenticated user read any org.
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION public\.entitlement_layers\(uuid\) FROM public, anon, authenticated/,
    );
  });

  it("the platform matrix returns entitlement state only", () => {
    const fn = executable.slice(executable.indexOf("FUNCTION public.platform_module_matrix"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    for (const leak of ["students", "storage_bytes", "contact_email", "profiles"]) {
      expect(body, `matrix exposes ${leak}`).not.toContain(leak);
    }
    expect(body).toMatch(/platform_can\('organizations\.read'\)/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11 — MIGRATION SAFETY
// ════════════════════════════════════════════════════════════════════════════

describe("The migration is additive, idempotent and reversible", () => {
  it("creates every table and index conditionally", () => {
    for (const stmt of executable.match(/CREATE TABLE[^(]*/g) ?? []) {
      expect(stmt, `not idempotent: ${stmt.trim()}`).toMatch(/IF NOT EXISTS/);
    }
    for (const stmt of executable.match(/CREATE (UNIQUE )?INDEX[^(]*/g) ?? []) {
      expect(stmt, `not idempotent: ${stmt.trim()}`).toMatch(/IF NOT EXISTS/);
    }
  });

  it("adds columns conditionally and drops none", () => {
    expect(executable).not.toMatch(/DROP COLUMN/i);
    for (const stmt of executable.match(/ADD COLUMN[^,;]*/g) ?? []) {
      expect(stmt, `not idempotent: ${stmt.trim()}`).toMatch(/IF NOT EXISTS/);
    }
  });

  it("only WIDENS the status constraint", () => {
    // Widening cannot invalidate an existing row; every value satisfying the
    // old predicate satisfies the new one, so no row is re-validated.
    const check = executable.match(/ADD CONSTRAINT organizations_status_check[\s\S]*?;/)?.[0] ?? "";
    for (const s of ["trialing", "active", "past_due", "suspended", "cancelled"]) {
      expect(check, `widening dropped ${s}`).toContain(s);
    }
    expect(check).toContain("hold");
    expect(check).toContain("archived");
  });

  it("ships a paired rollback that does not destroy captured history", () => {
    const rollback = read(
      "supabase/rollback/20261001_phase9a_platform_control_center_rollback.sql",
    ).replace(/^\s*--.*$/gm, "");
    expect(rollback).toMatch(/DROP TRIGGER IF EXISTS trg_guard_protected_org_update/);
    // Dropping status_reason / held_at would destroy the only record of WHY a
    // customer was paused. "Roll back the feature" must not mean "lose the
    // operational history the feature captured".
    expect(rollback).not.toMatch(/DROP COLUMN/i);
    expect(rollback).not.toMatch(/DROP TABLE IF EXISTS public\.organizations\b/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12 — UI HONESTY
// ════════════════════════════════════════════════════════════════════════════

describe("The console does not invent data or overstate what it can do", () => {
  it("renders an em dash for an uncomputed metric rather than a fabricated zero", () => {
    const page = read("src/features/platform/pages/OrganizationDetailPage.tsx");
    expect(page).toMatch(/Data unavailable/);
    expect(page).toMatch(/it is not a zero/i);
  });

  it("reports a no-op grant as a no-op", () => {
    const hooks = read("src/features/platform/hooks/usePlatform.ts");
    expect(hooks).toMatch(/was already .* — no change/);
  });

  it("shows the SOURCE of every entitlement, not just the boolean", () => {
    // "Payroll ✓ Enabled" ends no support ticket. "Enabled — Super Admin
    // override, expires 30 Sep" does.
    const panel = read("src/features/platform/components/ModuleEntitlementsPanel.tsx");
    expect(panel).toMatch(/SOURCE_LABEL/);
    expect(panel).toMatch(/e\.explain/);
    expect(panel).toMatch(/Overrides plan/);
  });

  it("previews bulk impact BEFORE the confirm button", () => {
    const page = read("src/features/platform/pages/ModulesPage.tsx");
    expect(page).toMatch(/eligible/);
    expect(page).toMatch(/blocked \(protected\)/);
  });

  it("states plainly that revoking a module keeps the data", () => {
    const panel = read("src/features/platform/components/ModuleEntitlementsPanel.tsx");
    expect(panel).toMatch(/stays exactly where it is/);
  });
});

describe("entitlementFlags exposes booleans only", () => {
  it("strips the commercial explanation before it reaches the tenant bundle", () => {
    // "Not included in your plan" is platform-facing copy. Passing it into the
    // tenant's permission layer would leak commercial detail into a place that
    // only asked whether to render a link.
    const flags = entitlementFlags(
      resolveEntitlements(layers({ plan: { payroll: { enabled: false, limit: null } } })),
    );
    expect(flags.payroll).toBe(false);
    expect(Object.values(flags).every((v) => typeof v === "boolean")).toBe(true);
  });
});
