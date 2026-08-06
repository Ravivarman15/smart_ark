import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1 TENANT-ISOLATION GATES
//
// WHAT THESE CAN AND CANNOT PROVE — read this before trusting a green run.
//
// CAN prove (statically, in CI, with no database):
//   • the migrations scope every table and every policy by construction
//   • no code path trusts a client-supplied organization_id
//   • storage paths are tenant-partitioned
//   • the second-organization guard exists and cannot be bypassed by omission
//   • every migration has a rollback
//
// CANNOT prove: that the LIVE database matches. Several PARTs are wrapped in
// `EXCEPTION WHEN insufficient_privilege` because a hosted Supabase migration
// runner may not own storage.objects, so a partial apply is a real outcome.
// scripts/tenant-isolation-audit.sql is the runtime half and is a mandatory
// deployment step, not an optional one.
//
// The genuine cross-tenant proof — seed org B, authenticate as B, assert zero
// rows of A across all 167 tables — needs two real tenants. It cannot run until
// the second-organization guard is lifted, and it is specified in
// docs/PHASE1_MULTI_TENANT_FOUNDATION.md §10 as the gate for Phase 2.
// ══════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
/** Rollback scripts live OUTSIDE supabase/migrations: `supabase db push` applies
 *  every .sql file in that directory in name order, so a co-located
 *  `*_rollback.sql` would run immediately after the migration it undoes. */
const ROLLBACKS = join(ROOT, "supabase", "rollback");
const FUNCTIONS = join(ROOT, "supabase", "functions");
const SRC = join(ROOT, "src");

const read = (p: string) => readFileSync(p, "utf8");
const migration = (n: string) => read(join(MIGRATIONS, n));

const P1A = "20260806_phase1a_tenant_foundation.sql";
const P1B = "20260806_phase1b_organization_id.sql";
const P1C = "20260806_phase1c_tenant_rls.sql";
const P1D = "20260806_phase1d_provisioning_engine.sql";

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Memoised source-file listing.
 *
 * Several gates walk the whole src/ tree. Re-walking it per test pushed the
 * full-suite run past vitest's 5s default and made these gates FLAKE under
 * parallel load — and a gate that fails intermittently is a gate someone
 * eventually disables. One traversal, cached.
 */
let _srcFiles: string[] | null = null;
const allSourceFiles = (): string[] => (_srcFiles ??= walk(SRC));

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
describe("Foundation — the tenant spine", () => {
  const sql = migration(P1A);

  it.each([
    "organizations",
    "organization_users",
    "organization_branches",
    "organization_settings",
    "organization_domains",
    "organization_branding",
    "organization_subscriptions",
    "organization_audit",
  ])("creates %s", (t) => {
    expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}\\b`));
  });

  it("registers ARK as organization #1 idempotently", () => {
    expect(sql).toMatch(/slug = 'ark'/);
    expect(sql).toMatch(/'ARK Learning Arena'/);
    // Re-running must not create a duplicate.
    expect(sql).toMatch(/IF ark IS NULL THEN/);
  });

  it("enrols every EXISTING principal as a member of ARK", () => {
    // Without this, current users get no claim once the hook is registered and
    // would lose access the moment a second organization exists.
    expect(sql).toMatch(/FROM public\.profiles/);
    expect(sql).toMatch(/FROM public\.parent_auth_accounts/);
    expect(sql).toMatch(/FROM public\.student_auth_accounts/);
    expect(sql).toMatch(/ON CONFLICT \(organization_id, user_id, principal_kind\) DO NOTHING/);
  });

  it("touches NO existing business table", () => {
    // 1A must be pure addition — the property that lets it ship alone and be
    // rolled back with a DROP.
    const forbidden = /ALTER TABLE public\.(students|profiles|student_attendance|student_fees|payroll_items|leads|exams)\b/;
    expect(forbidden.test(sql)).toBe(false);
    expect(/\bDROP TABLE\b/i.test(sql)).toBe(false);
    expect(/\bTRUNCATE\b/i.test(sql)).toBe(false);
    expect(/\bDELETE FROM\b/i.test(sql)).toBe(false);
  });
});

describe("Tenant resolution", () => {
  const sql = migration(P1A);

  it("current_org_id reads the JWT, never a table on the hot path", () => {
    const fn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.jwt_org_id"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.fallback_org_id"),
    );
    expect(fn).toMatch(/current_setting\('request\.jwt\.claims'/);
    // A SELECT ... FROM here would turn one comparison into a subquery per
    // policy across 167 tables.
    expect(/\bFROM\s+public\./i.test(fn)).toBe(false);
  });

  it("reads app_metadata, never user_metadata", () => {
    // user_metadata is user-writable: a tenant could forge its own org claim.
    expect(sql).toMatch(/'app_metadata'/);
    expect(sql).not.toMatch(/user_metadata\s*->/);
  });

  it("the transition fallback is SELF-DISABLING", () => {
    // The property that makes shipping a fallback acceptable: it returns NULL
    // as soon as a second organization exists, so it fails closed.
    const fn = sql.slice(sql.indexOf("FUNCTION public.fallback_org_id"));
    expect(fn.slice(0, 700)).toMatch(
      /count\(\*\)\s*FROM public\.organizations WHERE deleted_at IS NULL\)\s*=\s*1/,
    );
  });

  it("the access-token hook denies by default when there is no membership", () => {
    expect(sql).toMatch(/IF org IS NOT NULL THEN/);
  });

  it("the hook cannot lock everyone out if it throws", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.custom_access_token_hook"));
    expect(fn).toMatch(/EXCEPTION WHEN others THEN/);
    expect(fn).toMatch(/RETURN event/);
  });
});

describe("organization_id on every table", () => {
  const sql = migration(P1B);

  it("enumerates tables from pg_catalog, not a hardcoded list", () => {
    // A hardcoded list fails on the first unapplied migration and rots as new
    // modules ship.
    expect(sql).toMatch(/FROM pg_class c/);
    expect(sql).toMatch(/is_tenant_scoped_table/);
  });

  it("DEFAULTs to current_org_id — the reason 1,243 call sites need no change", () => {
    expect(sql).toMatch(/SET DEFAULT public\.current_org_id\(\)/);
  });

  it("sets NOT NULL — an unstamped row is an unisolated row", () => {
    expect(sql).toMatch(/SET NOT NULL/);
  });

  it("uses ON DELETE RESTRICT so an org with data cannot be hard-deleted", () => {
    expect(sql).toMatch(/REFERENCES public\.organizations\(id\)\s*\n?\s*ON DELETE RESTRICT/);
    expect(sql).not.toMatch(/organizations\(id\)\s*ON DELETE CASCADE/);
  });

  it("backfills in batches rather than one locking UPDATE", () => {
    expect(sql).toMatch(/LIMIT 10000/);
    expect(sql).toMatch(/EXIT WHEN batch = 0/);
  });

  it("indexes organization_id as the LEADING column", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS %I ON public\.%I \(organization_id\)/);
  });

  it("never deletes, truncates or drops production data", () => {
    const body = stripComments(sql);
    expect(/\bTRUNCATE\b/i.test(body)).toBe(false);
    expect(/\bDROP TABLE\b/i.test(body)).toBe(false);
    expect(/\bDELETE FROM\b/i.test(body)).toBe(false);
    expect(/DROP COLUMN/i.test(body)).toBe(false);
  });
});

describe("The second-organization guard", () => {
  const sql = migration(P1B);

  it("blocks org #2 until every readiness flag is green", () => {
    // Phase 1 ships row isolation but NOT composite unique keys, because
    // changing them would break 25 onConflict call sites. Rather than trust a
    // checklist, the database refuses to enter the unsafe state.
    expect(sql).toMatch(/FUNCTION public\.assert_multi_tenant_ready/);
    expect(sql).toMatch(/BEFORE INSERT ON public\.organizations/);
    expect(sql).toMatch(/Refusing to create a second organization/);
  });

  it("still allows the very first organization", () => {
    expect(sql).toMatch(/IF existing = 0 THEN\s*\n\s*RETURN NEW;/);
  });

  it("records composite_unique_keys as NOT ready, with the reason", () => {
    expect(sql).toMatch(/'composite_unique_keys',\s*false/);
    expect(sql).toMatch(/onConflict/);
  });
});

describe("RLS cutover", () => {
  const sql = migration(P1C);

  it("backs up every policy expression BEFORE wrapping it", () => {
    // The rollback restores from this table. The alternative — regexing a
    // wrapper off 362 live predicates — silently corrupts authorization rules.
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.tenancy_policy_backup/);
    // Compare EXECUTABLE positions: `ALTER POLICY` also appears in the header
    // comment that explains the technique, which would make a raw indexOf
    // comparison test the documentation rather than the migration.
    const code = sql.replace(/^\s*--.*$/gm, "");
    expect(code.indexOf("INSERT INTO public.tenancy_policy_backup")).toBeGreaterThan(-1);
    expect(code.indexOf("INSERT INTO public.tenancy_policy_backup"))
      .toBeLessThan(code.indexOf("ALTER POLICY"));
  });

  it("captures the PRE-wrap value on re-run (DO NOTHING, not DO UPDATE)", () => {
    const ins = sql.slice(sql.indexOf("INSERT INTO public.tenancy_policy_backup"));
    expect(ins.slice(0, 800)).toMatch(/ON CONFLICT[\s\S]*?DO NOTHING/);
  });

  it("WRAPS existing policies instead of rewriting them", () => {
    // Hand-rewriting 362 policies is the single most likely way to break ARK.
    expect(sql).toMatch(/organization_id = public\.current_org_id\(\) AND \(%s\)/);
    expect(sql).toMatch(/ALTER POLICY %I ON public\.%I/);
  });

  it("is idempotent — an already-scoped policy is skipped, not double-wrapped", () => {
    expect(sql).toMatch(/LIKE '%current_org_id%'/);
    expect(sql).toMatch(/CONTINUE;/);
  });

  it("applies FORCE ROW LEVEL SECURITY (the owner must not bypass RLS)", () => {
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
  });

  it("scopes the SECURITY DEFINER aggregate that bypasses RLS", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.get_financial_summary"));
    expect(fn).toMatch(/WHERE organization_id = org/);
  });

  it("makes the identity helpers tenant-aware", () => {
    for (const fn of [
      "current_profile_id",
      "is_staff",
      "has_any_role",
      "get_user_role",
      "current_parent_account_id",
      "parent_child_ids",
    ]) {
      const body = sql.slice(sql.indexOf(`FUNCTION public.${fn}`));
      expect(body.slice(0, 600), `${fn} is not tenant-scoped`).toMatch(/current_org_id\(\)/);
    }
  });
});

describe("Storage isolation", () => {
  const sql = migration(P1C);

  it("accepts legacy un-prefixed paths ONLY while one organization exists", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.storage_path_org_ok"));
    expect(fn.slice(0, 900)).toMatch(/count\(\*\) FROM public\.organizations WHERE deleted_at IS NULL\) = 1/);
    expect(fn.slice(0, 900)).toMatch(/ELSE false/);
  });

  it("fixes the segment shift that would break parent document access", () => {
    // Prefixing with {org}/ moves the entity id from segment 1 to segment 2.
    // Left alone, parents silently lose access to their own children's files.
    expect(sql).toMatch(/FUNCTION public\.storage_entity_segment/);
    expect(sql).toMatch(/is_parent_of\(public\.storage_entity_segment\(name\)::uuid\)/);
    expect(sql).toMatch(/storage_entity_segment\(name\) = public\.current_profile_id\(\)::text/);
  });

  it("every upload site partitions its path by organization", () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles()) {
      const src = stripComments(read(file));
      if (!/\.storage\s*\n?\s*\.from\(|storage\.from\(/.test(src)) continue;
      if (!/\.upload\(/.test(src)) continue;
      if (!/orgPath\(/.test(src)) offenders.push(file.replace(ROOT, ""));
    }
    expect(offenders, `upload sites without orgPath(): ${offenders.join(", ")}`).toEqual([]);
  }, 20_000);

  it("orgPath throws rather than writing an unattributable object", () => {
    const src = read(join(SRC, "lib", "orgStorage.ts"));
    expect(src).toMatch(/requireOrganization\(\)/);
  });
});

describe("Edge functions never trust a client-supplied organization", () => {
  const auth = read(join(FUNCTIONS, "_shared", "auth.ts"));

  it("resolves the organization from membership, server-side", () => {
    expect(auth).toMatch(/from\("organization_users"\)/);
    expect(auth).toMatch(/\.eq\("user_id", userId\)/);
  });

  it("scoped() refuses to run an unscoped service-role query", () => {
    expect(auth).toMatch(/export function scoped/);
    expect(auth).toMatch(/refusing to run an unscoped/i);
  });

  it("no function reads organization_id out of the request body", () => {
    const offenders: string[] = [];
    for (const d of readdirSync(FUNCTIONS, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === "_shared") continue;
      const f = join(FUNCTIONS, d.name, "index.ts");
      if (!existsSync(f)) continue;
      const src = stripComments(read(f));
      if (/body[?.]*\.?\[?["']?organization_id|body\.organizationId/.test(src)) {
        offenders.push(d.name);
      }
    }
    expect(offenders, `functions trusting a body-supplied org: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the highest-risk BOLA site is scoped", () => {
    const src = read(join(FUNCTIONS, "student-parent-accounts", "index.ts"));
    expect(src).toMatch(/scoped\(\s*\n?\s*supabase\.from\("students"\)/);
  });
});

describe("Frontend tenant context", () => {
  it("clears the cache on organization change, not merely invalidates", () => {
    // invalidateQueries keeps the data and marks it stale, so components
    // re-render the PREVIOUS tenant's rows while the refetch is in flight.
    const src = read(join(SRC, "core", "tenant", "OrganizationProvider.tsx"));
    expect(src).toMatch(/qc\.clear\(\)/);
    expect(src).not.toMatch(/qc\.invalidateQueries\(\)/);
  });

  it("treats the hostname as a hint and the token as authoritative", () => {
    const src = read(join(SRC, "core", "tenant", "tenant.ts"));
    expect(src).toMatch(/hostMatchesOrg/);
    expect(src).toMatch(/ROUTING HINT/i);
  });

  it("exposes the helper set the phase brief specifies", () => {
    const src = read(join(SRC, "core", "tenant", "tenant.ts"));
    for (const fn of [
      "currentOrganization",
      "currentOrganizationId",
      "requireOrganization",
      "isOrganizationMember",
      "resolveOrganizationByHost",
    ]) {
      expect(src, `${fn} missing`).toMatch(new RegExp(`export (async )?function ${fn}\\b`));
    }
  });
});

describe("Provisioning engine", () => {
  const sql = migration(P1D);

  it("seeds every communication automation DISABLED", () => {
    // Auto-messaging a new customer's parents on day one is the fastest way to
    // lose them.
    expect(sql).toMatch(/comms_automation_settings[\s\S]{0,200}?false, org/);
  });

  it("is idempotent by slug", () => {
    expect(sql).toMatch(/SELECT id INTO org FROM public\.organizations WHERE slug = _slug/);
    expect(sql).toMatch(/RETURN org;/);
  });

  it("rejects reserved and malformed slugs", () => {
    expect(sql).toMatch(/is reserved/);
    expect(sql).toMatch(/\^\[a-z0-9\]\[a-z0-9-\]/);
  });

  it("deprovision is a SOFT delete — never destroys a customer's data", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.deprovision_organization"));
    expect(fn).toMatch(/deleted_at = now\(\)/);
    expect(/\bDELETE FROM\b/i.test(fn)).toBe(false);
  });

  it("creates per-org copies of the system roles, not shared ones", () => {
    expect(sql).toMatch(/INSERT INTO public\.rbac_roles[\s\S]{0,200}?organization_id/);
  });
});

describe("Every Phase 1 migration ships a rollback", () => {
  it.each([P1A, P1B, P1C, P1D])("%s has a paired rollback", (m) => {
    expect(existsSync(join(ROLLBACKS, m.replace(".sql", "_rollback.sql")))).toBe(true);
  });

  it("the RLS rollback restores from the backup table, not a regex", () => {
    const rb = read(join(ROLLBACKS, P1C.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/FROM public\.tenancy_policy_backup/);
    expect(rb).not.toMatch(/regexp_replace/);
  });

  it("rollbacks REFUSE to disarm isolation on a multi-tenant database", () => {
    for (const m of [P1B, P1C]) {
      const rb = read(join(ROLLBACKS, m.replace(".sql", "_rollback.sql")));
      expect(rb, `${m} rollback has no multi-tenant guard`).toMatch(/Refusing to roll back/);
    }
  });

  it("the destructive column drop is opt-in only", () => {
    const rb = read(join(ROLLBACKS, P1B.replace(".sql", "_rollback.sql")));
    // The only irreversible statement in Phase 1 must not be reachable by
    // pasting the file in a hurry.
    const dropLine = rb.split("\n").find((l) => /DROP COLUMN organization_id/.test(l));
    expect(dropLine?.trimStart().startsWith("--")).toBe(true);
  });
});
