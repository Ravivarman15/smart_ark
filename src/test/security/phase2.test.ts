import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2 GATES — PLATFORM CONTROL PLANE
//
// The defining property of Phase 2 is a NEGATIVE one: platform administrators
// get no RLS bypass, and the control plane never reads a tenant row. Negative
// properties are exactly what erodes silently — one convenient `.from("students")`
// in a service, one `OR is_platform_admin()` appended to a tenant policy, and
// the whole design is gone with nothing failing.
//
// So most of what follows asserts that something is ABSENT.
// ══════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
/** Rollback scripts live OUTSIDE supabase/migrations: `supabase db push` applies
 *  every .sql file in that directory in name order, so a co-located
 *  `*_rollback.sql` would run immediately after the migration it undoes. */
const ROLLBACKS = join(ROOT, "supabase", "rollback");
const PLATFORM = join(ROOT, "src", "features", "platform");
const FUNCTIONS = join(ROOT, "supabase", "functions");

const read = (p: string) => readFileSync(p, "utf8");
const migration = (n: string) => read(join(MIGRATIONS, n));

const P2A = "20260810_phase2a_platform_identity.sql";
const P2B = "20260810_phase2b_platform_aggregates.sql";
const P2C = "20260810_phase2c_plans_and_commerce.sql";

const stripSqlComments = (s: string) => s.replace(/^\s*--.*$/gm, "");

/**
 * Strip dynamic-SQL string literals before scanning statements.
 *
 * These migrations build DDL with `format('ALTER TABLE public.%I …', t)` inside
 * DO blocks. A naive `ALTER TABLE (public\.)?(\w+)` then captures the literal
 * `public` as if it were a table name — a false positive that would make these
 * gates cry wolf on correct code, which is how a gate gets disabled.
 *
 * The tables those dynamic statements target are enumerated in explicit
 * ARRAY[...] lists and are covered by the "creates %s" assertions instead.
 */
const stripDynamicSql = (s: string) => s.replace(/'[^']*%[IL][^']*'/g, "''");

/**
 * Table names that are platform-owned rather than tenant data.
 *
 * DERIVED from `is_tenant_scoped_table()` in the migrations — the same function
 * migration 1B uses to decide what gets an organization_id — rather than
 * maintained here by hand. A hardcoded copy drifts the moment a phase adds a
 * platform table, and the symptom is this gate crying wolf on correct code,
 * which is how a security gate ends up disabled.
 *
 * The LAST definition wins, matching how Postgres resolves CREATE OR REPLACE.
 */
function platformOwnedTables(): Set<string> {
  let latest = "";
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    const body = read(join(MIGRATIONS, f));
    if (body.includes("FUNCTION public.is_tenant_scoped_table")) latest = body;
  }
  const start = latest.indexOf("FUNCTION public.is_tenant_scoped_table");
  const block = latest.slice(start, latest.indexOf("$$", latest.indexOf("SELECT _table NOT IN")));
  return new Set([...stripSqlComments(block).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
}

const PLATFORM_OWNED = platformOwnedTables();

const isPlatformOwned = (t: string) =>
  t.startsWith("platform_") || t.startsWith("organization_") || PLATFORM_OWNED.has(t);
const stripTsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
describe("THE CORE INVARIANT — no RLS bypass for platform staff", () => {
  const allMigrations = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));

  it("no policy on any tenant table references is_platform_admin()", () => {
    // The tempting one-line "fix" this gate exists to prevent:
    //   ALTER POLICY x ON students USING (... OR is_platform_admin())
    // One compromised support account would then equal a total breach of every
    // customer's data, simultaneously and un-auditably.
    const offenders: string[] = [];
    for (const f of allMigrations) {
      const body = stripDynamicSql(stripSqlComments(migration(f)));
      // Find CREATE/ALTER POLICY statements naming a NON-platform table.
      const re = /(?:CREATE|ALTER)\s+POLICY\s+[\s\S]{0,400}?ON\s+public\."?([a-z_]+)"?([\s\S]{0,900}?);/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body))) {
        const [, table, stmt] = m;
        if (isPlatformOwned(table)) continue;
        if (/is_platform_admin|platform_can/.test(stmt)) {
          offenders.push(`${f} → ${table}`);
        }
      }
    }
    expect(offenders, `tenant policies granting platform bypass:\n  ${offenders.join("\n  ")}`)
      .toEqual([]);
  });

  it("the platform service never queries a tenant table", () => {
    // Every read must go through an aggregate RPC or a platform_* table.
    const src = stripTsComments(read(join(PLATFORM, "services", "platform.service.ts")));
    const tenantTables = [
      "students", "profiles", "student_attendance", "student_fees", "fee_transactions",
      "payroll_items", "leads", "exam_results", "message_queue", "parent_auth_accounts",
      "student_auth_accounts", "campuses", "batches", "attendance",
    ];
    const found = tenantTables.filter((t) => src.includes(`from("${t}"`));
    expect(found, `platform service reads tenant tables: ${found.join(", ")}`).toEqual([]);
  });

  it("no platform page queries supabase directly", () => {
    // Pages go through the service, which is the file the gate above polices.
    // A direct import would route around that check entirely.
    //
    // NARROW EXEMPTION: a page that cannot exist in a production build. The
    // diagnostics page deliberately queries as the CURRENT user so it can show
    // what this session can actually see — the opposite of a bypass, but still
    // a direct read, so it is only allowed while it is provably compiled out.
    // The exemption is not granted by filename; it is EARNED by proving both
    // halves of the dev-only guard below, so a page cannot claim it by being
    // named "debug".
    const routes = stripTsComments(read(join(PLATFORM, "routes.tsx")));

    const isProvablyDevOnly = (file: string, src: string): boolean => {
      const base = file.split(/[\\/]/).pop()!.replace(/\.tsx?$/, "");
      // 1. The module itself collapses to a no-op outside a dev build, so an
      //    accidental import elsewhere still renders nothing.
      const selfGuarded = /import\.meta\.env\.DEV\s*\?[\s\S]{0,80}?:\s*\(\)\s*=>\s*null/.test(src);
      // 2. The route is registered only inside an import.meta.env.DEV branch,
      //    so Vite strips the path and the element from the production bundle.
      const devRouteBlock = /import\.meta\.env\.DEV\s*\?\s*\[[\s\S]*?\]\s*:\s*\[\]/.exec(routes);
      const routedDevOnly = !!devRouteBlock && devRouteBlock[0].includes(`<${base} />`);
      // 3. And it must not ALSO be mounted anywhere outside that branch.
      const outsideDevBranch = routes
        .replace(devRouteBlock?.[0] ?? "", "")
        .includes(`<${base} />`);
      return selfGuarded && routedDevOnly && !outsideDevBranch;
    };

    const offenders: string[] = [];
    for (const f of walk(join(PLATFORM, "pages"))) {
      const src = stripTsComments(read(f));
      if (!/from "@\/integrations\/supabase\/client"/.test(src)) continue;
      if (isProvablyDevOnly(f, src)) continue;
      offenders.push(f.replace(ROOT, ""));
    }
    expect(offenders, `platform pages importing supabase directly: ${offenders.join(", ")}`)
      .toEqual([]);
  });

  it("every aggregate function checks a capability BEFORE returning data", () => {
    // A SECURITY DEFINER function without its own authorization check is an RLS
    // bypass with extra steps.
    const sql = migration(P2B);
    for (const fn of [
      "platform_organization_overview",
      "platform_summary",
      "platform_system_health",
      "platform_organization_detail",
    ]) {
      const start = sql.indexOf(`FUNCTION public.${fn}`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const body = sql.slice(start, start + 1400);
      expect(body, `${fn} does not gate on platform_can`).toMatch(/platform_can\(/);
      expect(body, `${fn} does not raise on denial`).toMatch(/RAISE EXCEPTION 'Access denied/);
    }
  });

  it("the organization detail returns member COUNTS, never a member list", () => {
    // Listing a customer's staff names and emails on a platform screen is
    // exactly the exposure impersonation exists to gate.
    const sql = migration(P2B);
    const detail = sql.slice(sql.indexOf("FUNCTION public.platform_organization_detail"));
    expect(detail).toMatch(/jsonb_object_agg\(principal_kind, c\)/);
    expect(detail).not.toMatch(/select[\s\S]{0,120}name[\s\S]{0,60}from public\.profiles/i);
  });
});

describe("Platform identity", () => {
  const sql = migration(P2A);

  it("platform users are a separate principal from ERP staff", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.platform_users/);
    // Must NOT be modelled as a profiles row — that would make is_staff() true
    // for a Smart ARK employee inside a customer tenant.
    const create = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS public.platform_users"));
    expect(create.slice(0, 1200)).not.toMatch(/REFERENCES public\.profiles/);
  });

  it("defines all seven platform roles", () => {
    for (const r of ["owner","admin","finance","support","sales","customer_success","auditor"]) {
      expect(sql, `role ${r} missing`).toMatch(new RegExp(`'${r}'`));
    }
  });

  it("auditor is read-only — it cannot impersonate", () => {
    const caps = sql.slice(sql.indexOf("-- auditor"), sql.indexOf("ON CONFLICT DO NOTHING"));
    expect(caps).not.toMatch(/'auditor','impersonate'/);
    expect(caps).not.toMatch(/'auditor','organizations\.manage'/);
  });

  it("support can impersonate but cannot touch money or plans", () => {
    const caps = sql.slice(sql.indexOf("-- support:"), sql.indexOf("-- sales"));
    expect(caps).toMatch(/'support','impersonate'/);
    expect(caps).not.toMatch(/'support','billing\.manage'/);
    expect(caps).not.toMatch(/'support','plans\.manage'/);
  });

  it("only owner may administer platform users", () => {
    const manage = [...sql.matchAll(/\('(\w+)','platform\.users\.manage'\)/g)].map((m) => m[1]);
    expect(manage).toEqual(["owner"]);
  });

  it("MFA is a precondition for the platform claim, not a warning", () => {
    const hook = sql.slice(sql.indexOf("FUNCTION public.custom_access_token_hook"));
    expect(hook).toMatch(/IF prole IS NOT NULL AND pmfa THEN/);
  });

  it("the tenant claim behaviour is preserved by the extended hook", () => {
    const hook = sql.slice(sql.indexOf("FUNCTION public.custom_access_token_hook"));
    expect(hook).toMatch(/FROM public\.organization_users ou/);
    expect(hook).toMatch(/'organization_id', org::text/);
  });
});

describe("Audit is append-only", () => {
  const sql = migration(P2A);

  it("UPDATE and DELETE are blocked by a trigger, not by convention", () => {
    // Without this, the role whose misuse the log exists to record could
    // quietly erase the evidence.
    expect(sql).toMatch(/FUNCTION public\.platform_audit_immutable/);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.platform_audit_log/);
    expect(sql).toMatch(/append-only/);
  });

  it("has no UPDATE or DELETE policy either", () => {
    const policies = [...sql.matchAll(/CREATE POLICY \w+ ON public\.platform_audit_log\s+FOR (\w+)/g)]
      .map((m) => m[1].toUpperCase());
    expect(policies).not.toContain("UPDATE");
    expect(policies).not.toContain("DELETE");
    expect(policies).not.toContain("ALL");
  });
});

describe("Secure impersonation", () => {
  const sql = migration(P2A);
  const fn = read(join(FUNCTIONS, "platform-admin", "index.ts"));

  it("targets a concrete user — never 'the whole organization'", () => {
    // A grant with no concrete principal would be an RLS bypass wearing a
    // different hat.
    const create = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS public.platform_impersonation_grants"));
    expect(create.slice(0, 1500)).toMatch(/target_user_id\s+uuid NOT NULL/);
  });

  it("requires a reason and caps the window at 60 minutes", () => {
    expect(sql).toMatch(/may not exceed 60 minutes/);
    expect(sql).toMatch(/Impersonation requires a reason/);
  });

  it("has NO insert policy for authenticated users", () => {
    // A self-service INSERT would let any platform user grant themselves
    // access to any tenant. Grants are created only by the edge function.
    const grantPolicies = [...sql.matchAll(
      /CREATE POLICY \w+ ON public\.platform_impersonation_grants\s+FOR (\w+)/g)]
      .map((m) => m[1].toUpperCase());
    expect(grantPolicies).not.toContain("INSERT");
    expect(grantPolicies).not.toContain("ALL");
  });

  it("the edge function verifies membership of the named organization", () => {
    // Without this a platform user could name any auth user at all and assume
    // their identity in whichever tenant they claimed.
    expect(fn).toMatch(/from\("organization_users"\)[\s\S]{0,300}?\.eq\("organization_id", organizationId\)/);
    expect(fn).toMatch(/not an active member of that organization/);
  });

  it("refuses to impersonate another platform user", () => {
    // Otherwise a support account could escalate to owner.
    expect(fn).toMatch(/Refusing to impersonate a platform user/);
  });

  it("requires the impersonate capability AND MFA", () => {
    expect(fn).toMatch(/need\("impersonate"\)/);
    expect(fn).toMatch(/if \(!pu\.mfa_enrolled\) return null/);
  });

  it("writes the grant BEFORE minting the session", () => {
    // If the token were minted first and the audit write then failed, access
    // would exist with no record of it.
    const grantIdx = fn.indexOf("platform_impersonation_grants");
    const mintIdx = fn.indexOf("generateLink");
    expect(grantIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeLessThan(mintIdx);
  });

  it("the landing page exchanges the token in a separate tab", () => {
    const dialog = read(join(PLATFORM, "components", "ImpersonationDialog.tsx"));
    expect(dialog).toMatch(/window\.open\(/);
    // verifyOtp in the platform tab would replace the platform session and
    // leave no identity with which to end the grant.
    expect(stripTsComments(dialog)).not.toMatch(/verifyOtp/);
    const landing = read(join(ROOT, "src", "pages", "ImpersonateLanding.tsx"));
    expect(landing).toMatch(/verifyOtp/);
  });
});

describe("Commerce & reserved entities", () => {
  const sql = migration(P2C);

  it.each([
    "plans", "plan_prices", "plan_features", "subscriptions", "subscription_usage",
    "coupons", "coupon_redemptions", "organization_features", "feature_flag_assignments",
    "invoices", "invoice_lines", "organization_invitations", "organization_activity",
    "platform_notifications", "platform_announcements", "platform_settings",
  ])("creates %s", (t) => {
    expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}\\b`));
  });

  it("every new table has RLS enabled AND forced", () => {
    // An unused table with RLS disabled is fully readable over PostgREST the
    // moment someone inserts into it.
    const block = sql.slice(sql.indexOf("PART 6"));
    expect(block).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(block).toMatch(/FORCE ROW LEVEL SECURITY/);
  });

  it("money is numeric, never float", () => {
    expect(sql).toMatch(/amount\s+numeric\(14,2\)/);
    expect(sql).not.toMatch(/amount\s+(float|double precision|real)/i);
  });

  it("coupon limits are enforced by a database trigger", () => {
    expect(sql).toMatch(/FUNCTION public\.coupon_enforce_limits/);
    expect(sql).toMatch(/BEFORE INSERT ON public\.coupon_redemptions/);
    expect(sql).toMatch(/reached its redemption limit/);
  });

  it("a tenant can read but NEVER write its own feature flags", () => {
    // A tenant that can flip its own flags has bought nothing.
    const manage = sql.slice(sql.indexOf("CREATE POLICY org_features_manage"));
    expect(manage.slice(0, 300)).toMatch(/platform_can\('feature_flags\.manage'\)/);
    expect(manage.slice(0, 300)).not.toMatch(/current_org_id/);
  });

  it("a tenant cannot enumerate coupon codes", () => {
    const read_ = sql.slice(sql.indexOf("CREATE POLICY coupons_read"));
    expect(read_.slice(0, 250)).not.toMatch(/current_org_id/);
  });

  it("unbuilt modules are seeded FALSE on every tier including enterprise", () => {
    // certificates is 94 lines, there is no CMS and no AI. Selling them would
    // be a refund event.
    const seed = sql.slice(sql.indexOf("INSERT INTO public.plan_features"));
    for (const key of ["certificate", "website", "ai"]) {
      expect(seed, `${key} is not hard-disabled`).toMatch(
        new RegExp(`\\('${key}',\\s*false\\)`),
      );
    }
  });

  it("feature_key uses the RBAC ModuleId vocabulary", () => {
    expect(sql).toMatch(/feature_key IS the RBAC ModuleId/);
  });

  it("platform_settings warns that secrets do not belong there", () => {
    expect(sql).toMatch(/Secrets live in edge-function env vars/);
  });
});

describe("Routing & guards", () => {
  const routes = read(join(PLATFORM, "routes.tsx"));
  const shell = read(join(PLATFORM, "components", "PlatformShell.tsx"));

  it("platform routes are NOT mounted through sharedRoutes", () => {
    // sharedRoutes mounts pages into the four TENANT layouts; a control-plane
    // page appearing there would be a cross-boundary leak.
    const shared = read(join(ROOT, "src", "core", "routing", "sharedRoutes.tsx"));
    expect(shared).not.toMatch(/platform/i);
  });

  it("declares the routes the brief specifies", () => {
    for (const p of [
      "dashboard", "organizations", "organization/:id", "subscriptions", "plans",
      "pricing", "coupons", "invoices", "revenue", "usage", "storage", "support",
      "audit", "security", "system-health", "platform-settings", "logs",
      "feature-flags", "backups",
    ]) {
      expect(routes, `route ${p} missing`).toContain(`"${p}"`);
    }
  });

  it("every route carries a capability except the dashboard", () => {
    const entries = [...routes.matchAll(/\{ path: "([^"]+)", element: <[^>]+>(, capability: "([^"]+)")? \}/g)];
    expect(entries.length).toBeGreaterThan(15);
    for (const e of entries) {
      if (e[1] === "dashboard") continue;
      expect(e[3], `route ${e[1]} has no capability`).toBeTruthy();
    }
  });

  it("the guard fails closed and does not confirm the control plane exists", () => {
    expect(shell).toMatch(/if \(!isPlatformUser\) return <Navigate to="\/" replace \/>/);
  });

  it("blocks a platform user who has not enrolled MFA", () => {
    expect(shell).toMatch(/Multi-factor authentication required/);
  });

  it("pages are lazy-loaded so tenants never download the control plane", () => {
    expect(routes).toMatch(/lazyWithRetry as lazy/);
  });
});

describe("Rollbacks", () => {
  it.each([P2A, P2B, P2C])("%s has a paired rollback", (m) => {
    expect(existsSync(join(ROLLBACKS, m.replace(".sql", "_rollback.sql")))).toBe(true);
  });

  it("the 2A rollback restores the Phase 1A token hook first", () => {
    // Dropping platform_users while GoTrue still calls a hook that selects
    // from it would fail every token issuance — nobody could log in.
    const rb = read(join(ROLLBACKS, P2A.replace(".sql", "_rollback.sql")));
    expect(rb.indexOf("custom_access_token_hook")).toBeLessThan(rb.indexOf("DROP TABLE"));
    expect(rb).toMatch(/nobody, tenant or platform, could log in/);
  });

  it("the 2C rollback refuses to drop paying subscriptions", () => {
    const rb = read(join(ROLLBACKS, P2C.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/Refusing to drop commerce tables/);
  });
});

describe("ERP is untouched", () => {
  it("Phase 2 migrations add no column to any tenant table", () => {
    for (const m of [P2A, P2B, P2C]) {
      const body = stripDynamicSql(stripSqlComments(migration(m)));
      const alters = [...body.matchAll(/ALTER TABLE public\."?([a-z_]+)"?/gi)].map((x) => x[1]);
      const tenant = alters.filter((t) => !isPlatformOwned(t));
      expect(tenant, `${m} alters tenant tables: ${tenant.join(", ")}`).toEqual([]);
    }
  });

  it("Phase 2 deletes nothing", () => {
    for (const m of [P2A, P2B, P2C]) {
      const body = stripSqlComments(migration(m));
      expect(/\bTRUNCATE\b/i.test(body), `${m} truncates`).toBe(false);
      expect(/\bDELETE FROM\b/i.test(body), `${m} deletes`).toBe(false);
      expect(/DROP COLUMN/i.test(body), `${m} drops a column`).toBe(false);
    }
  });

  it("Phase 0 and Phase 1 gates still exist", () => {
    for (const f of ["phase0.test.ts", "phase1.test.ts", "phase1e.test.ts"]) {
      expect(existsSync(join(__dirname, f)), `${f} was removed`).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2D GATES — LIVE COMMERCE EDITING
//
// The catalogue became writable from the UI. Two failure modes matter and
// neither announces itself at runtime:
//
//   1. A write that RLS filtered to zero rows. PostgREST answers with 204 and
//      error === null, so the UI shows "Saved" over a database that did not
//      change. Every write must ask for the row back and check it came.
//   2. The realtime channel quietly reaching a tenant table. The provider
//      enumerates table names as strings, so adding "students" there would be
//      one edit — and would stream a customer's row changes into the control
//      plane, defeating the aggregate-only boundary that all of Phase 2 rests on.
// ══════════════════════════════════════════════════════════════════════════════

const P2D = "20260908_phase2d_commerce_realtime_and_audit.sql";

describe("Phase 2D — commerce writes cannot fail silently", () => {
  const svc = read(join(PLATFORM, "services", "platform.service.ts"));

  it("every mutating statement asks for its rows back", () => {
    // Statement-ish chunks. A chunk that both targets a table and mutates it
    // must carry at least as many .select() calls as write verbs — the count
    // rather than a boolean, so a ternary with one verified branch and one
    // unverified branch cannot pass.
    const offenders: string[] = [];
    for (const chunk of stripTsComments(svc).split(";")) {
      if (!chunk.includes(".from(")) continue;
      const writes = chunk.match(/\.(upsert|update|insert|delete)\(/g)?.length ?? 0;
      if (writes === 0) continue;
      const selects = chunk.match(/\.select\(/g)?.length ?? 0;
      if (selects < writes) offenders.push(chunk.trim().slice(0, 120));
    }
    expect(
      offenders,
      "these writes cannot distinguish success from an RLS-filtered no-op:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("a zero-row write is reported as an error, not a success", () => {
    // Asking for the rows back is worthless if nobody looks at them.
    const guards = svc.match(/if \(!data\?\.length\)/g)?.length ?? 0;
    const writes =
      stripTsComments(svc).match(/\.(upsert|update|insert|delete)\(/g)?.length ?? 0;
    // saveSubscription's ternary is two write verbs guarded once, after the
    // branches converge — hence >= writes - 1 rather than >= writes.
    expect(guards).toBeGreaterThanOrEqual(writes - 1);
  });
});

describe("Phase 2D — realtime never reaches tenant data", () => {
  const provider = read(join(PLATFORM, "providers", "PlatformRealtimeProvider.tsx"));

  it("subscribes only to platform-owned tables", () => {
    // The keys of AFFECTS are the subscribed tables.
    const block = provider.slice(
      provider.indexOf("const AFFECTS"),
      provider.indexOf("const TABLES"),
    );
    const tables = [...block.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]);
    expect(tables.length, "AFFECTS parsed as empty — gate is not testing anything")
      .toBeGreaterThan(4);

    const tenant = tables.filter((t) => !isPlatformOwned(t));
    expect(
      tenant,
      `PlatformRealtimeProvider subscribes to tenant table(s): ${tenant.join(", ")}`,
    ).toEqual([]);
  });

  it("opens no channel for a non-platform session", () => {
    expect(provider).toMatch(/if \(!isPlatformUser\) return;/);
    // …and the guard must come BEFORE the channel is created, not after.
    expect(provider.indexOf("if (!isPlatformUser) return;"))
      .toBeLessThan(provider.indexOf("supabase.channel("));
  });

  it("is mounted inside the platform route guard", () => {
    const routes = read(join(PLATFORM, "routes.tsx"));
    expect(routes.indexOf("<PlatformProtectedRoute>"))
      .toBeLessThan(routes.indexOf("<PlatformRealtimeProvider>"));
  });
});

describe("Phase 2D — migration is additive and audits every catalogue edit", () => {
  const body = migration(P2D);
  const stripped = stripSqlComments(body);

  it("publishes the commerce tables for realtime", () => {
    for (const t of ["plans", "plan_prices", "plan_features", "subscriptions",
                     "coupons", "platform_settings"]) {
      expect(stripped, `${t} is not published`).toContain(`'${t}'`);
    }
  });

  it("installs a change-audit trigger on every editable catalogue table", () => {
    for (const t of ["plans", "plan_prices", "coupons", "platform_settings"]) {
      expect(stripped).toContain(`ARRAY['${t}'`);
    }
    expect(stripped).toContain("AFTER INSERT OR UPDATE OR DELETE");
  });

  it("destroys nothing", () => {
    expect(/\bTRUNCATE\b/i.test(stripped), "truncates").toBe(false);
    expect(/\bDELETE FROM\b/i.test(stripped), "deletes").toBe(false);
    expect(/DROP COLUMN/i.test(stripped), "drops a column").toBe(false);
    expect(/DROP TABLE/i.test(stripped), "drops a table").toBe(false);
    // DROP POLICY would silently remove an access control written in 2C.
    expect(/DROP POLICY/i.test(stripped), "drops a policy").toBe(false);
  });

  it("touches no tenant table", () => {
    const alters = [...stripDynamicSql(stripped).matchAll(/ALTER TABLE public\."?([a-z_]+)"?/gi)]
      .map((x) => x[1]);
    expect(alters.filter((t) => !isPlatformOwned(t))).toEqual([]);
  });
});

describe("Phase 2D — every write surface is capability-gated", () => {
  const commerce = read(join(PLATFORM, "pages", "CommercePages.tsx"));
  const ops = read(join(PLATFORM, "pages", "OperationsPages.tsx"));

  it("plan and price editing requires plans.manage", () => {
    expect(commerce).toMatch(/can\("plans\.manage"\)/);
  });

  it("subscription editing requires billing.manage", () => {
    expect(commerce).toMatch(/can\("billing\.manage"\)/);
  });

  it("coupon editing requires coupons.manage", () => {
    expect(commerce).toMatch(/can\("coupons\.manage"\)/);
  });

  it("settings editing requires settings.manage", () => {
    expect(ops).toMatch(/can\("settings\.manage"\)/);
  });

  it("a plan's code is immutable once created", () => {
    // `code` is the join key for subscriptions and provisioning. Renaming it
    // in place would orphan them, so the input is disabled when editing.
    expect(commerce).toMatch(/id="pcode"[\s\S]{0,120}disabled=\{!!plan\}/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2E GATES — two defects that returned HTTP 200 while doing nothing
// ══════════════════════════════════════════════════════════════════════════════

const P2E = "20260909_phase2e_provisioning_claim_and_metrics_cron.sql";

describe("Phase 2E — the provisioning queue actually dispatches", () => {
  const body = stripSqlComments(migration(P2E));
  const fn = body.slice(
    body.indexOf("FUNCTION public.claim_provisioning_job"),
    body.indexOf("COMMENT ON FUNCTION public.claim_provisioning_job"),
  );

  it("every column in the claim query is table-qualified", () => {
    // The OUT parameters job_id / organization_id / attempt shadow columns of
    // the same name. An unqualified reference raises 42702 at RUNTIME — the
    // function still creates cleanly, so only a gate on the text catches it.
    const where = fn.slice(fn.indexOf("WHERE"), fn.indexOf("ORDER BY"));
    for (const col of ["status", "attempt", "max_attempts", "lease_until"]) {
      // String.raw, because in a plain template literal `\w` degrades to `w`
      // and `\b` becomes a backspace character — a regex that matches nothing,
      // which would make this gate pass no matter what the migration says.
      const bare = new RegExp(String.raw`(?<![.\w])${col}\b`);
      expect(bare.test(where), `${col} is unqualified in the claim WHERE clause`).toBe(false);
    }
  });

  it("assigns the OUT parameters rather than RETURN QUERY over shadowed names", () => {
    expect(fn).toMatch(/job_id\s*:=/);
    expect(fn).toMatch(/RETURN NEXT/);
  });
});

describe("Phase 2E — the metrics rollup is scheduled", () => {
  const body = stripSqlComments(migration(P2E));

  it("schedules refresh_organization_metrics", () => {
    expect(body).toContain("organization-metrics-rollup");
    expect(body).toContain("refresh_organization_metrics");
  });

  it("runs before the billing sweep that reads the same rollup", () => {
    // billing-lifecycle is scheduled at 02:15; the rollup must precede it or
    // the sweep bills against yesterday's numbers.
    const m = body.match(/'organization-metrics-rollup',\s*'(\d+) (\d+) /);
    expect(m, "schedule not parseable").toBeTruthy();
    const [, minute, hour] = m!;
    expect(Number(hour) * 60 + Number(minute)).toBeLessThan(2 * 60 + 15);
  });

  it("destroys nothing", () => {
    for (const pat of [/\bTRUNCATE\b/i, /\bDELETE FROM\b/i, /DROP TABLE/i, /DROP POLICY/i]) {
      expect(pat.test(body), `${pat} present`).toBe(false);
    }
  });
});
