import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 4 GATES — PROVISIONING ENGINE & WHITE LABEL
//
// Three properties carry all the risk here, and none of them is visible on a
// screen:
//
//   1. Every step handler is IDEMPOTENT. Retry re-runs a step that may have
//      failed halfway, so a bare INSERT would double-seed a tenant.
//   2. No handler reads current_org_id(). The worker runs with no tenant
//      context; a handler that fell back to the session's organization would
//      provision into the WRONG TENANT — the worst bug this phase could ship.
//   3. Rollback refuses once real data exists. Otherwise "recovery" is data
//      loss with a friendly button.
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
const P4A = "20260820_phase4a_provisioning_engine.sql";
const P4B = "20260820_phase4b_provisioning_steps.sql";
const a = read(join(MIGRATIONS, P4A));
const b = read(join(MIGRATIONS, P4B));

const stripSqlComments = (s: string) => s.replace(/^\s*--.*$/gm, "");
const stripDynamicSql = (s: string) => s.replace(/'[^']*%[IL][^']*'/g, "''");

/** Every provision_step_* function body in 4B. */
function stepHandlers(): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  // Handler bodies end `END $$;` — not on a line of their own, so the
  // terminator must not be anchored to a newline.
  const re = /CREATE OR REPLACE FUNCTION public\.(provision_step_\w+)\([\s\S]*?\$\$;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(b))) out.push({ name: m[1], body: m[0] });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("THE CORE INVARIANTS", () => {
  const handlers = stepHandlers();

  it("finds the handlers (guards against a vacuous pass)", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(18);
  });

  it("NO handler reads current_org_id()", () => {
    // The worker runs with no tenant context. A handler falling back to the
    // session's organization would provision into whichever tenant happened to
    // be resolved — silently, and into a stranger's data.
    const offenders = handlers
      .filter((h) => /current_org_id\(\)/.test(stripSqlComments(h.body)))
      .map((h) => h.name);
    expect(offenders, `handlers reading current_org_id: ${offenders.join(", ")}`).toEqual([]);
  });

  it("every handler takes the organization explicitly", () => {
    for (const h of handlers) {
      expect(h.body, `${h.name} does not take _org uuid`).toMatch(/\(_org uuid\)/);
    }
  });

  it("every handler is idempotent — no unguarded INSERT", () => {
    // Retry re-runs a step that may have failed after doing half its work, so
    // a bare INSERT would double-seed a tenant.
    //
    // The guard is looked for in a WINDOW around each INSERT rather than by
    // delimiting the statement, because a statement cannot be delimited by
    // regex here: `provision_step_storage` contains a semicolon INSIDE a
    // string literal, and several handlers are guarded by an ENCLOSING
    // `IF ... IS NULL THEN` that sits before the INSERT entirely. Cutting at
    // the first semicolon flagged three correctly-guarded handlers.
    const GUARD = /ON CONFLICT|WHERE NOT EXISTS|IF NOT EXISTS|IS NULL THEN/i;
    const offenders: string[] = [];

    for (const h of handlers) {
      const body = stripSqlComments(h.body);
      const starts = [...body.matchAll(/INSERT INTO public\.\w+/g)].map((m) => m.index ?? 0);

      starts.forEach((at, i) => {
        // Window runs from shortly BEFORE this INSERT (to catch an enclosing
        // IF) to the NEXT INSERT or the end of the handler. Bounding on the
        // next statement rather than a fixed character count is what makes
        // this correct for handlers whose jsonb literal runs to 1,100 chars
        // before reaching its ON CONFLICT.
        const end = starts[i + 1] ?? body.length;
        const window = body.slice(Math.max(0, at - 400), end);
        if (!GUARD.test(window)) {
          offenders.push(`${h.name}: ${body.slice(at, at + 60).replace(/\s+/g, " ")}`);
        }
      });
    }
    expect(offenders, `unguarded INSERTs:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("rollback refuses once the organization has real data", () => {
    const fn = a.slice(a.indexOf("FUNCTION public.rollback_provisioning_job"));
    expect(fn).toMatch(/n_students > 0 OR n_staff > 1/);
    expect(fn).toMatch(/Refusing to roll back/);
    expect(fn).toMatch(/deprovision_organization/);
  });

  it("rollback only deletes provisioning artefacts, never tenant records", () => {
    const fn = a.slice(
      a.indexOf("FUNCTION public.rollback_provisioning_job"),
      a.indexOf("PART 4"),
    );
    const deletes = [...stripSqlComments(fn).matchAll(/DELETE FROM public\.(\w+)/g)].map((m) => m[1]);
    const allowed = new Set([
      "comms_templates", "comms_automation_settings", "report_presets", "sections",
      "organization_settings", "organization_features", "organization_onboarding",
    ]);
    const bad = deletes.filter((t) => !allowed.has(t));
    expect(bad, `rollback deletes tenant data: ${bad.join(", ")}`).toEqual([]);
    // And every delete must be scoped to the one organization.
    for (const d of [...fn.matchAll(/DELETE FROM public\.\w+[^;]*/g)]) {
      expect(d[0], `unscoped delete: ${d[0]}`).toMatch(/organization_id = org/);
    }
  });
});

describe("Queue mechanics", () => {
  it("claims with FOR UPDATE SKIP LOCKED", () => {
    // Without SKIP LOCKED every worker blocks on the same row and effective
    // concurrency is 1 — "100 organizations concurrently" would be fiction.
    expect(a).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it("leases jobs so a dead worker's job is reclaimed", () => {
    expect(a).toMatch(/lease_until/);
    expect(a).toMatch(/status = 'running' AND lease_until < now\(\)/);
    expect(a).toMatch(/FUNCTION public\.heartbeat_provisioning_job/);
  });

  it("allows only one live job per organization", () => {
    expect(a).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS provisioning_jobs_one_live[\s\S]{0,200}?WHERE status IN \('queued','running'\)/);
  });

  it("enqueue is idempotent", () => {
    const fn = a.slice(a.indexOf("FUNCTION public.enqueue_provisioning"));
    expect(fn.slice(0, 900)).toMatch(/IF job IS NOT NULL THEN RETURN job/);
  });

  it("resume semantics: a completed step is never re-run", () => {
    const fn = a.slice(a.indexOf("FUNCTION public.run_provisioning_step"));
    expect(fn).toMatch(/IF st\.status = 'completed' THEN/);
  });

  it("retry resets ONLY failed steps", () => {
    const fn = a.slice(a.indexOf("FUNCTION public.retry_provisioning_job"));
    expect(fn).toMatch(/WHERE job_id = _job AND status = 'failed'/);
  });

  it("critical steps abort the job; optional ones do not", () => {
    const fn = a.slice(a.indexOf("FUNCTION public.run_provisioning_step"));
    expect(fn).toMatch(/IF cat\.is_critical THEN/);
    expect(fn).toMatch(/RAISE EXCEPTION 'Critical provisioning step/);
  });

  it("the step handler name comes from the catalogue, never a caller", () => {
    // Dynamic EXECUTE with a caller-supplied function name would be RCE.
    const fn = a.slice(a.indexOf("FUNCTION public.run_provisioning_step"));
    expect(fn).toMatch(/SELECT \* INTO cat FROM public\.provisioning_step_catalog/);
    expect(fn).toMatch(/format\('SELECT public\.%I\(\$1\)', cat\.handler\)/);
  });

  it("retry and rollback require a platform capability", () => {
    for (const name of ["retry_provisioning_job", "rollback_provisioning_job"]) {
      const fn = a.slice(a.indexOf(`FUNCTION public.${name}`));
      expect(fn.slice(0, 600), `${name} is not capability-gated`)
        .toMatch(/platform_can\('organizations\.manage'\)/);
    }
  });
});

describe("Registration is never blocked", () => {
  const onboarding = read(join(FUNCTIONS, "public-onboarding", "index.ts"));

  it("enqueues rather than running enrichment inline", () => {
    expect(onboarding).toMatch(/rpc\("enqueue_provisioning"/);
  });

  it("a failed enqueue never fails the signup", () => {
    // The organization is already usable; an un-enqueued job is recoverable
    // from the control plane, and losing the signup over it would not be.
    const block = onboarding.slice(onboarding.indexOf("enqueue_provisioning") - 800);
    expect(block).toMatch(/catch \(e\)/);
    expect(block).toMatch(/Never fail the signup over the queue/);
  });

  it("signups jump the queue", () => {
    expect(onboarding).toMatch(/_priority: 10/);
  });

  it("the essential half stays synchronous", () => {
    // If this became async the customer would sign in to an empty ERP.
    expect(onboarding).toMatch(/rpc\("provision_organization"/);
    expect(onboarding).toMatch(/rpc\("provision_organization_admin"/);
  });
});

describe("Worker", () => {
  const w = read(join(FUNCTIONS, "provisioning-worker", "index.ts"));

  it("is not an open endpoint", () => {
    expect(w).toMatch(/CRON_SECRET/);
    expect(w).toMatch(/platform_users/);
    expect(w).toMatch(/Platform access required/);
  });

  it("respects a runtime budget and resumes rather than failing", () => {
    expect(w).toMatch(/MAX_RUNTIME_MS/);
    expect(w).toMatch(/budget exhausted/);
    expect(w).toMatch(/resumed: true/);
  });

  it("heartbeats so long jobs are not reclaimed mid-flight", () => {
    expect(w).toMatch(/heartbeat_provisioning_job/);
  });

  it("does the HTTP-only work the database cannot", () => {
    expect(w).toMatch(/createStorageFolders/);
    expect(w).toMatch(/sendWelcomeEmail/);
  });

  it("a failed welcome email does not fail the job", () => {
    expect(w).toMatch(/must never mark[\s\S]{0,80}as failed/);
  });
});

describe("Provisioning defaults are safe", () => {
  it("every communication automation is seeded DISABLED", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.provision_step_comms_automation"));
    expect(fn).toMatch(/'whatsapp', 'immediate', false, _org/);
    expect(fn).toMatch(/enabled = FALSE, always/);
  });

  it("fee receipt and absence delivery default OFF", () => {
    expect(b).toMatch(/'auto_receipt_delivery', false/);
    expect(b).toMatch(/'auto_notify_absent', false/);
  });

  it("does not invent tables for features that do not exist", () => {
    // The certificates module is a 94-line stub; templates are stored as a
    // setting rather than fabricating a table for a feature nobody built.
    const fn = b.slice(b.indexOf("FUNCTION public.provision_step_certificates"));
    expect(fn).toMatch(/organization_settings/);
    expect(fn).toMatch(/certificates module not yet built/);
  });
});

describe("Onboarding checklist is derived", () => {
  it("ticks items from real data, not self-reporting", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.refresh_onboarding_checklist"));
    for (const probe of ["public.students", "public.student_attendance", "public.fee_structures"]) {
      expect(fn, `checklist does not probe ${probe}`).toContain(probe);
    }
  });

  it("each probe is guarded so one missing table does not break the checklist", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.refresh_onboarding_checklist"));
    const probes = (fn.match(/BEGIN SELECT/g) ?? []).length;
    const guards = (fn.match(/EXCEPTION WHEN others THEN chk := false/g) ?? []).length;
    expect(guards).toBe(probes);
  });

  it("the component states that items are derived", () => {
    const c = read(join(SRC, "features", "onboarding", "OnboardingChecklist.tsx"));
    expect(c).toMatch(/not something you mark off/);
  });
});

describe("White label & theme engine", () => {
  it("colours are validated in the database before storage", () => {
    expect(b).toMatch(/FUNCTION public\.validate_branding/);
    expect(b).toMatch(/\^#\[0-9a-fA-F\]\{6\}\$/);
    expect(b).toMatch(/BEFORE INSERT OR UPDATE ON public\.organization_branding/);
  });

  it("fonts and theme modes are allow-listed, not free text", () => {
    expect(b).toMatch(/NOT IN \('system','inter','roboto','poppins','lora','sans','serif'\)/);
    expect(b).toMatch(/NOT IN \('system','light','dark'\)/);
  });

  it("the theme engine validates again before writing CSS", () => {
    // These values land inside a style declaration; one check in the database
    // is not enough if a row predates the trigger.
    const t = read(join(SRC, "core", "theme", "OrganizationThemeProvider.tsx"));
    expect(t).toMatch(/const HEX = \/\^#\[0-9a-fA-F\]\{6\}\$\//);
    expect(t).toMatch(/if \(!HEX\.test\(hex\)\) return null/);
  });

  it("restores base theme variables on unmount / organization switch", () => {
    // Otherwise switching organizations leaves the previous brand behind.
    const t = read(join(SRC, "core", "theme", "OrganizationThemeProvider.tsx"));
    expect(t).toMatch(/root\.style\.removeProperty\(name\)/);
  });

  it("HTML branding fields are stored raw and NOT rendered anywhere yet", () => {
    // They need an allowlist sanitiser, which Phase 6 owns. Rendering them now
    // would be stored XSS reaching parents.
    expect(b).toMatch(/stored raw and must be sanitised at/);
    const t = read(join(SRC, "core", "theme", "OrganizationThemeProvider.tsx"));
    expect(t).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("custom domains are infrastructure only — no DNS automation", () => {
    expect(b).toMatch(/ssl_status/);
    expect(b).toMatch(/no DNS automation in this phase/);
  });
});

describe("ERP and platform are untouched", () => {
  it("Phase 4 alters no tenant table", () => {
    for (const [name, sql] of [[P4A, a], [P4B, b]] as const) {
      const body = stripDynamicSql(stripSqlComments(sql));
      const alters = [...body.matchAll(/ALTER TABLE public\.(\w+)/gi)].map((m) => m[1]);
      const bad = alters.filter(
        (t) => !t.startsWith("provisioning_") && !t.startsWith("organization_"),
      );
      expect(bad, `${name} alters tenant tables: ${bad.join(", ")}`).toEqual([]);
    }
  });

  it("Phase 4 truncates nothing and drops no column", () => {
    for (const [name, sql] of [[P4A, a], [P4B, b]] as const) {
      const body = stripSqlComments(sql);
      expect(/\bTRUNCATE\b/i.test(body), `${name} truncates`).toBe(false);
      expect(/DROP COLUMN/i.test(body), `${name} drops a column`).toBe(false);
      expect(/DROP TABLE/i.test(body), `${name} drops a table`).toBe(false);
    }
  });

  it("new platform tables are excluded from tenant scoping", () => {
    const excl = a.slice(a.indexOf("SELECT _table NOT IN"));
    for (const t of ["provisioning_jobs", "provisioning_steps",
                     "provisioning_step_catalog", "organization_onboarding"]) {
      expect(excl, `${t} missing from is_tenant_scoped_table`).toContain(`'${t}'`);
    }
  });

  it("a tenant can read its own job but never write one", () => {
    const pols = [...a.matchAll(/CREATE POLICY (\w+) ON public\.provisioning_jobs\s+FOR (\w+)/g)]
      .map((m) => m[2].toUpperCase());
    expect(pols).toContain("SELECT");
    expect(pols).not.toContain("INSERT");
    expect(pols).not.toContain("ALL");
  });

  it("earlier phase gates still exist", () => {
    for (const f of ["phase0.test.ts", "phase1.test.ts", "phase1e.test.ts",
                     "phase2.test.ts", "phase3.test.ts"]) {
      expect(existsSync(join(__dirname, f)), `${f} was removed`).toBe(true);
    }
  });
});

describe("Rollbacks", () => {
  it.each([P4A, P4B])("%s has a paired rollback", (m) => {
    expect(existsSync(join(ROLLBACKS, m.replace(".sql", "_rollback.sql")))).toBe(true);
  });

  it("the 4A rollback refuses while jobs are in flight", () => {
    const rb = read(join(ROLLBACKS, P4A.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/Refusing to drop the provisioning engine/);
  });

  it("the 4B rollback keeps customer branding columns", () => {
    // Dropping them destroys a logo and colours the customer chose, to undo a
    // migration. Not a trade worth making.
    const rb = read(join(ROLLBACKS, P4B.replace(".sql", "_rollback.sql")));
    expect(rb).not.toMatch(/DROP COLUMN/);
    expect(rb).toMatch(/Columns intentionally retained/);
  });

  it("the 4A rollback keeps the tenant's onboarding progress", () => {
    const rb = read(join(ROLLBACKS, P4A.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/organization_onboarding is KEPT/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 4C GATES — step handlers must match the LIVE schema
//
// Property 4, learned the hard way: a step handler that names a column which
// does not exist creates cleanly and fails only when a real tenant is
// provisioned. PL/pgSQL resolves column names at execution, so neither CREATE
// nor any test that merely reads the migration text catches it — and because
// academic_year is a critical step, the failure aborted the entire job for the
// first customer who ever signed up.
// ══════════════════════════════════════════════════════════════════════════════

const P4C = "20260910_phase4c_provisioning_step_column_fix.sql";

describe("Phase 4C — the academic-year step targets real columns", () => {
  it("the fix exists and is registered with the deploy runner", () => {
    expect(existsSync(join(MIGRATIONS, P4C)), `${P4C} is missing`).toBe(true);
    const runner = read(join(ROOT, "scripts", "deploy-migrations.mjs"));
    expect(runner).toContain(P4C);
  });

  it("runs AFTER the 4B step definitions it replaces", () => {
    const runner = read(join(ROOT, "scripts", "deploy-migrations.mjs"));
    expect(runner.indexOf("20260820_phase4b_provisioning_steps.sql"))
      .toBeLessThan(runner.indexOf(P4C));
  });

  it("writes academic_years.name, never year_label", () => {
    const body = read(join(MIGRATIONS, P4C));
    const fn = body.slice(body.indexOf("CREATE OR REPLACE FUNCTION"));
    const insert = fn.slice(fn.indexOf("INSERT INTO public.academic_years"));
    expect(insert.slice(0, 120)).toContain("name");
    // `year_label` may appear in the explanatory comment above, never in SQL.
    expect(/year_label/.test(insert.split(";")[0])).toBe(false);
  });

  it("stays idempotent and organization-scoped", () => {
    const body = read(join(MIGRATIONS, P4C));
    expect(body).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM public\.academic_years/);
    expect(body).toMatch(/WHERE organization_id = _org/);
    // The whole point of the phase: no handler may infer the tenant from the
    // session, or it provisions into whichever organization happens to be
    // current.
    expect(body).not.toContain("current_org_id()");
  });
});
