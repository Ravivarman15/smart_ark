#!/usr/bin/env node
/**
 * Ordered migration runner for the Phase 0 → Phase 6 SaaS stack.
 *
 * ── WHY THIS EXISTS INSTEAD OF `supabase db push` ──────────────────────────
 * Supabase keys a migration by the leading digits of its filename. This repo
 * has many files sharing one prefix — the four Phase-1 migrations are all
 * `20260806`, and the pre-SaaS history collides the same way (20260519 ×3,
 * 20260521 ×4, 20260810 ×3, …). Two files cannot both be recorded under one
 * version, so a push either skips work or replays it on every run.
 *
 * On top of that the remote migration history stops at 20260421 while the
 * schema is applied through 20260730, so a push would try to replay ~70
 * already-applied migrations.
 *
 * This runner therefore applies an EXPLICIT, dependency-ordered list and
 * records each file under a unique synthetic version, so re-running is a
 * no-op. Every migration in ORDER is additive and idempotent by construction;
 * the runner verifies that claim by being safe to run twice.
 *
 * Usage:
 *   node scripts/deploy-migrations.mjs --dry-run   # print the plan, touch nothing
 *   node scripts/deploy-migrations.mjs             # apply, stopping at first error
 *   node scripts/deploy-migrations.mjs --verify    # post-deploy assertions only
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

/**
 * Dependency-ordered. Each entry is [file, why it must run here].
 * `version` is the synthetic key written to supabase_migrations.schema_migrations
 * — unique per file, unlike the colliding filename prefixes.
 */
const ORDER = [
  // ── Prerequisite: a pre-SaaS migration that was never applied ────────────
  // Verified missing on the live DB (public.student_import_audit absent).
  // Phase 1B iterates pg_catalog, so it would simply skip this table and the
  // gap would survive the whole deployment.
  ["20260629_student_import_enterprise.sql", "creates student_import_audit — confirmed absent on live DB"],

  // ── Phase 0: security hardening. No tenant dependency. ──────────────────
  ["20260805_phase0_security_hardening.sql", "closes signup-privilege + public-bucket findings before anything else"],

  // ── Phase 1: tenant foundation. Strict internal order. ──────────────────
  ["20260806_phase1a_tenant_foundation.sql", "organizations table + current_org_id() — everything below reads it"],
  ["20260806_phase1b_organization_id.sql", "adds organization_id to every business table; needs 1A's organizations row"],
  ["20260806_phase1c_tenant_rls.sql", "rewrites policies to filter on organization_id; needs 1B's column"],
  ["20260806_phase1d_provisioning_engine.sql", "second-org guard; needs 1C's policies in place"],
  ["20260807_phase1e_composite_unique_keys.sql", "converts global uniques to (organization_id, …); needs 1B + 1D"],

  // ── Phase 2: platform control plane. Needs the tenant spine. ────────────
  ["20260810_phase2a_platform_identity.sql", "platform_users + impersonation; extends 1A's access-token hook"],
  ["20260810_phase2b_platform_aggregates.sql", "cross-tenant read models; needs 2A's platform identity"],
  ["20260810_phase2c_plans_and_commerce.sql", "subscription_plans + org subscriptions; needs 2A"],

  // ── Phase 3: public website + self-serve onboarding. Needs plans. ───────
  ["20260815_phase3a_marketing_and_onboarding.sql", "signup funnel writes against 2C's plans"],

  // ── Phase 4: provisioning engine. Needs onboarding + plans. ─────────────
  ["20260820_phase4a_provisioning_engine.sql", "job queue; consumes 3A signups"],
  ["20260820_phase4b_provisioning_steps.sql", "step implementations; needs 4A's queue"],

  // ── Phase 5: billing. Needs subscriptions from 2C. ─────────────────────
  ["20260825_phase5a_billing_core.sql", "invoices/payments keyed to 2C subscriptions"],
  ["20260825_phase5b_billing_lifecycle.sql", "trial/grace/suspension sweep; needs 5A's invoice functions"],

  // ── Phase 6: white label. Needs provisioning (4B writes defaults). ──────
  ["20260901_phase6a_white_label_core.sql", "domains/themes/integrations/secrets"],
  ["20260901_phase6b_marketplace_and_defaults.sql", "marketplace + platform-default seed; needs 6A's tables"],

  // ── Phase 2D: live commerce editing. Deliberately LAST despite the phase
  // number — it publishes and audits 2C's tables, so it must run after 2C, and
  // its audit triggers reference platform_audit() from 2A. Ordering follows
  // the dependency graph, not the filename.
  ["20260908_phase2d_commerce_realtime_and_audit.sql", "realtime + change auditing for the 2C catalogue"],
  ["20260909_phase2e_provisioning_claim_and_metrics_cron.sql", "fixes 42702 in 4A's claim function; schedules 2B's rollup"],
  ["20260910_phase4c_provisioning_step_column_fix.sql", "academic_year step wrote to a non-existent column; must follow 4B"],
  ["20260911_phase5c_usage_status_null_fix.sql", "usage_status emitted null used, crashing the Settings module; must follow 5A"],
  ["20260912_phase7a_document_branding.sql", "document branding columns + ARK identity seed; must follow 6A, which added the last organization_branding columns"],
  ["20260913_phase7b_public_tenant_context.sql", "public tenant resolution + submit_public_lead; must follow 7A, whose receipt_* columns it returns"],
  ["20260914_phase8a_checkin_locations.sql", "multi-tenant check-in locations + ARK geofence moved from source into its own rows; must follow 4B, which created organization_branches"],
  ["20260916_phase8c_branches_org_default.sql", "organization_branches.organization_id had no default, so no tenant could create a check-in location; must follow 8A"],
  ["20260917_phase8d_branding_bucket.sql", "public branding bucket + org-prefixed write policies; logos could not be stored or rendered before this"],
  ["20260915_phase8b_checkin_address_required.sql", "address + radius required on a verified location; NOT VALID so ARK's 8A-seeded rows are grandfathered"],
  ["20261001_phase9a_platform_control_center.sql", "organization lifecycle (hold/archived), ARK protection trigger, module governance and the entitlement layers the tenant sidebar reads; must follow 2C, which created organization_features and plan_features, and 5A, which created subscriptions"],
];

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const VERIFY_ONLY = args.includes("--verify");

// npm installs the CLI as a .cmd shim on Windows, and since Node 22 execFile
// refuses to spawn one without a shell (CVE-2024-27980). Running through a
// shell would then require re-quoting every SQL argument, so instead ALL SQL —
// including the one-line bookkeeping queries — goes to a temp file and is
// passed as `--file`. Nothing is ever interpolated into a command line.
const SUPABASE = process.platform === "win32" ? "supabase.cmd" : "supabase";
const TMP = join(tmpdir(), `smartark-deploy-${process.pid}.sql`);

/** Runs SQL against the linked project. Throws with the server's message. */
function sql(statement, { file } = {}) {
  let target = file;
  if (!target) {
    writeFileSync(TMP, statement, "utf8");
    target = TMP;
  }
  try {
    return execFileSync(SUPABASE, ["db", "query", "--linked", "-o", "json", "--file", target], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    throw new Error(out || e.message);
  }
}

/** Parses the first JSON object out of the CLI's chatty stdout. */
function rows(out) {
  const i = out.indexOf("{");
  const j = out.lastIndexOf("}");
  if (i < 0) return [];
  return JSON.parse(out.slice(i, j + 1)).rows ?? [];
}

function alreadyApplied() {
  const out = sql(
    "select version from supabase_migrations.schema_migrations order by version;",
  );
  return new Set(rows(out).map((r) => r.version));
}

function record(version, name) {
  // statements[] mirrors what the CLI's own push writes, so a later
  // `supabase migration list` renders these as normal applied rows.
  sql(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ('${version}', '${name.replace(/'/g, "''")}', array[]::text[])
     on conflict (version) do nothing;`,
  );
}

/** Synthetic unique version: filename prefix + a two-digit ordinal. */
const versionFor = (file, i) => `${/^(\d+)/.exec(file)[1]}${String(i).padStart(2, "0")}`;

// ── Post-deploy assertions. These check the DATABASE, not the files. ──────
const CHECKS = [
  ["current_org_id() exists",
   "select count(*) n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname='current_org_id'",
   (r) => Number(r.n) === 1],
  ["ARK is organization #1",
   "select count(*) n from public.organizations",
   (r) => Number(r.n) >= 1],
  ["every tenant table carries organization_id",
   `select count(*) n from information_schema.tables t
     where t.table_schema='public' and t.table_type='BASE TABLE'
       and public.is_tenant_scoped_table(t.table_name)
       and not exists (select 1 from information_schema.columns c
                       where c.table_schema='public' and c.table_name=t.table_name
                         and c.column_name='organization_id')`,
   (r) => Number(r.n) === 0],
  ["no ARK row lost its tenant",
   "select count(*) n from public.students where organization_id is null",
   (r) => Number(r.n) === 0],
  ["organization_secrets has RLS forced and zero policies",
   `select (select count(*) from pg_policies where schemaname='public' and tablename='organization_secrets') pol,
           (select relforcerowsecurity::int from pg_class where relname='organization_secrets') forced`,
   (r) => Number(r.pol) === 0 && Number(r.forced) === 1],
  ["salary/finance/support buckets are private",
   "select count(*) n from storage.buckets where public and id in ('payslips','finance-attachments','support-attachments')",
   (r) => Number(r.n) === 0],
  ["platform_users exists and is not world-readable",
   `select (select count(*) from information_schema.tables where table_schema='public' and table_name='platform_users') tbl,
           (select count(*) from pg_policies where schemaname='public' and tablename='platform_users' and qual='true') open`,
   (r) => Number(r.tbl) === 1 && Number(r.open) === 0],
  ["billing invoice sequence is installed",
   "select count(*) n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname='issue_invoice'",
   (r) => Number(r.n) >= 1],
  // Phase 1E's per-table EXCEPTION handler turns a hard error into a silent
  // "skip", so the migration can report success having converted NOTHING —
  // which is exactly what it did on first deployment (a `name[] = text[]` type
  // error). Never trust the migration's own exit status for this; ask the
  // catalog. Both detectors must be zero, not just the constraint one.
  ["no unique constraint collides across tenants",
   "select count(*) n from public.unsafe_unique_constraints()",
   (r) => Number(r.n) === 0],
  ["no unique INDEX collides across tenants",
   "select count(*) n from public.unsafe_unique_indexes()",
   (r) => Number(r.n) === 0],
  ["every tenancy readiness flag is set",
   "select count(*) n from public.tenancy_readiness where not ready",
   (r) => Number(r.n) === 0],
  // The app already sends onConflict:"organization_id,…" for these tables. If
  // the composite keys are missing, every such upsert fails at runtime with
  // 42P10 — settings saves, attendance locks and RBAC grants all break.
  ["composite (organization_id, …) keys exist for the upsert call sites",
   "select count(*) n from pg_constraint where conname like '%_org_uq' and connamespace='public'::regnamespace",
   (r) => Number(r.n) >= 14],
  ["email-template upsert has a usable ON CONFLICT arbiter",
   `select count(*) n from pg_indexes where schemaname='public'
      and tablename='organization_email_templates' and indexdef ilike '%unique%'
      and indexdef ilike '%organization_id, template_key, language%'
      and indexdef not ilike '%where%'`,
   (r) => Number(r.n) === 1],
];

function runChecks() {
  let failed = 0;
  for (const [label, q, ok] of CHECKS) {
    let verdict, detail = "";
    try {
      const r = rows(sql(q))[0] ?? {};
      verdict = ok(r);
      detail = JSON.stringify(r);
    } catch (e) {
      verdict = false;
      detail = e.message.split("\n").slice(-1)[0];
    }
    if (!verdict) failed++;
    console.log(`  ${verdict ? "PASS" : "FAIL"}  ${label}${verdict ? "" : `  ← ${detail}`}`);
  }
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll post-deploy checks PASSED");
  return failed;
}

// ── main ─────────────────────────────────────────────────────────────────
if (VERIFY_ONLY) {
  console.log("Post-deploy verification\n");
  process.exit(runChecks() ? 1 : 0);
}

const missing = ORDER.filter(([f]) => !existsSync(join(MIGRATIONS, f)));
if (missing.length) {
  console.error("Missing migration files:\n" + missing.map(([f]) => "  " + f).join("\n"));
  process.exit(1);
}

console.log(`${DRY ? "PLAN (dry run)" : "APPLYING"} — ${ORDER.length} migrations\n`);
const applied = DRY ? new Set() : alreadyApplied();

let n = 0;
for (const [file, why] of ORDER) {
  n++;
  const version = versionFor(file, n);
  const lines = readFileSync(join(MIGRATIONS, file), "utf8").split("\n").length;
  const skip = applied.has(version);
  console.log(`${String(n).padStart(2)}. ${file}`);
  console.log(`    ${lines} lines — ${why}`);
  if (skip) { console.log("    SKIP (already recorded)\n"); continue; }
  if (DRY) { console.log(`    would apply as version ${version}\n`); continue; }

  const t0 = Date.now();
  try {
    sql(null, { file: join(MIGRATIONS, file) });
  } catch (e) {
    console.error(`\n    FAILED after ${Date.now() - t0}ms:\n${e.message}\n`);
    console.error(`Stopped at migration ${n}/${ORDER.length}. Nothing after this ran.`);
    process.exit(1);
  }
  record(version, file);
  console.log(`    applied in ${Date.now() - t0}ms (version ${version})\n`);
}

if (DRY) { console.log("Dry run complete — no changes made."); process.exit(0); }
console.log("All migrations applied.\n\nPost-deploy verification\n");
process.exit(runChecks() ? 1 : 0);
