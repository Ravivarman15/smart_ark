#!/usr/bin/env node
/**
 * ARK PRODUCTION BASELINE — read-only.
 *
 * Captures row counts and entitlement state for the production reference tenant
 * so a deployment can be PROVEN not to have changed anything, rather than
 * assumed not to have.
 *
 * ── WHY COUNTS AND NOT A DUMP ──────────────────────────────────────────────
 * A dump of a live school's records onto disk is a data-protection incident
 * waiting for a laptop to be lost. Counts answer the only question a
 * deployment needs — "did anything disappear?" — and carry no student name,
 * phone number or mark.
 *
 * ── WHY IT NEVER WRITES ────────────────────────────────────────────────────
 * Every statement below is a SELECT. There is no INSERT, UPDATE, DELETE or DDL
 * in this file, and `--verify` mode re-reads and compares rather than
 * correcting anything: a baseline tool that could "fix" a mismatch would be
 * able to cause one.
 *
 * Usage:
 *   node scripts/ark-baseline.mjs                 # capture → docs/generated/
 *   node scripts/ark-baseline.mjs --compare       # re-read and diff vs saved
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "generated");
const OUT = join(OUT_DIR, "ARK_BASELINE.json");

const COMPARE = process.argv.includes("--compare");

/** Tables verified present on the live database (2026-08-12). */
const COUNTED = [
  "students", "profiles", "organization_users",
  "student_attendance", "teacher_attendance",
  "exam_results", "student_fees", "fee_installments",
  "payroll_runs", "leads", "message_queue", "comms_audit",
  "invoices", "payments", "organization_features",
];

// Same invocation as scripts/deploy-migrations.mjs, for the same reason: npm
// installs the CLI as a .cmd shim on Windows, and since Node 22 execFile
// refuses to spawn one without a shell. Going through a shell would then mean
// re-quoting every SQL argument, so the query goes to a temp file instead and
// nothing is ever interpolated into a command line.
const SUPABASE = process.platform === "win32" ? "supabase.cmd" : "supabase";
const TMP = join(tmpdir(), `ark-baseline-${process.pid}.sql`);

const sql = (query) => {
  writeFileSync(TMP, query, "utf8");
  let raw;
  try {
    raw = execFileSync(
      SUPABASE,
      ["db", "query", "--linked", "-o", "json", "--file", TMP],
      {
        cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
      },
    );
  } catch (e) {
    throw new Error(`${e.stdout ?? ""}${e.stderr ?? ""}`.trim() || e.message);
  }
  // The CLI's stdout is chatty; take the first JSON object and nothing else.
  const i = raw.indexOf("{");
  if (i < 0) return [];
  return JSON.parse(raw.slice(i, raw.lastIndexOf("}") + 1)).rows ?? [];
};

const one = (rows) => rows[0] ?? {};

// ── Capture ─────────────────────────────────────────────────────────────────

const org = one(
  sql(`select id, slug, display_name, legal_name, status, country, timezone,
              currency, institution_type, created_at, provisioned_at, deleted_at
         from public.organizations where slug = 'ark'`),
);
if (!org.id) {
  console.error("FATAL: no organization with slug 'ark'. Refusing to continue.");
  process.exit(2);
}

// One UNION per table rather than 15 round trips.
const countsQuery = COUNTED.map(
  (t) => `select '${t}' as t, count(*)::bigint as n from public.${t} where organization_id = '${org.id}'`,
).join(" union all ");

const counts = {};
for (const r of sql(countsQuery)) counts[r.t] = Number(r.n);

const subscription = one(
  sql(`select plan_code, status, trial_ends_at, current_period_end,
              seats_limit, students_limit, storage_mb_limit
         from public.organization_subscriptions where organization_id = '${org.id}'`),
);

const billingSub = one(
  sql(`select s.status, s.interval, s.amount, p.code as plan_code
         from public.subscriptions s
         left join public.plans p on p.id = s.plan_id
        where s.organization_id = '${org.id}'
        order by s.created_at desc limit 1`),
);

const overrides = sql(
  `select feature_key, enabled, reason, expires_at
     from public.organization_features
    where organization_id = '${org.id}' order by feature_key`,
);

const planFeatures = subscription.plan_code
  ? sql(`select pf.feature_key, pf.enabled
           from public.plan_features pf
           join public.plans p on p.id = pf.plan_id
          where p.code = '${subscription.plan_code}' order by pf.feature_key`)
  : [];

const roles = sql(
  `select role, count(*)::bigint as n from public.profiles
    where organization_id = '${org.id}' group by role order by role`,
);

const snapshot = {
  capturedAt: new Date().toISOString(),
  organization: org,
  counts,
  rolesBreakdown: Object.fromEntries(roles.map((r) => [r.role, Number(r.n)])),
  subscription,
  billingSubscription: billingSub,
  featureOverrides: overrides,
  planFeatures,
};

// ── Compare, or write ───────────────────────────────────────────────────────

if (COMPARE) {
  if (!existsSync(OUT)) {
    console.error(`FATAL: no baseline at ${OUT}. Capture one before comparing.`);
    process.exit(2);
  }
  const before = JSON.parse(readFileSync(OUT, "utf8"));
  const problems = [];
  const notes = [];

  for (const [k, v] of Object.entries(before.organization)) {
    if (String(snapshot.organization[k] ?? "") !== String(v ?? "")) {
      problems.push(`organization.${k}: "${v}" → "${snapshot.organization[k]}"`);
    }
  }

  for (const [t, n] of Object.entries(before.counts)) {
    const now = snapshot.counts[t];
    if (now === undefined) problems.push(`${t}: table missing after deployment`);
    // A DECREASE is the failure. An increase is ordinary user activity during
    // the deployment window and is reported, not failed.
    else if (now < n) problems.push(`${t}: ${n} → ${now}  (LOST ${n - now} rows)`);
    else if (now > n) notes.push(`${t}: ${n} → ${now}  (+${now - n}, normal activity)`);
  }

  const beforeOv = JSON.stringify(before.featureOverrides);
  if (beforeOv !== JSON.stringify(snapshot.featureOverrides)) {
    problems.push("featureOverrides changed — ARK's entitlement overrides were modified");
  }
  if (before.subscription?.plan_code !== snapshot.subscription?.plan_code) {
    problems.push(
      `subscription.plan_code: ${before.subscription?.plan_code} → ${snapshot.subscription?.plan_code}`,
    );
  }

  writeFileSync(
    join(OUT_DIR, "ARK_BASELINE_AFTER.json"),
    JSON.stringify(snapshot, null, 2),
  );

  console.log(`Baseline captured ${before.capturedAt}`);
  console.log(`Compared        ${snapshot.capturedAt}\n`);
  if (notes.length) {
    console.log("Changes that are expected (rows added by real users):");
    for (const n of notes) console.log("  " + n);
    console.log();
  }
  if (problems.length) {
    console.error("REGRESSIONS:");
    for (const p of problems) console.error("  " + p);
    process.exit(1);
  }
  console.log("PASS — no ARK row was lost, and no ARK entitlement or plan changed.");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot, null, 2));

console.log(`ARK baseline → ${OUT}\n`);
console.log(`  organization  ${org.display_name}  (${org.id})`);
console.log(`  status        ${org.status}`);
console.log(`  plan          ${subscription.plan_code ?? "—"} / ${subscription.status ?? "—"}`);
console.log(`  overrides     ${overrides.length}`);
console.log(`  plan_features ${planFeatures.length}`);
for (const [t, n] of Object.entries(counts)) {
  console.log(`  ${t.padEnd(20)} ${String(n).padStart(7)}`);
}
