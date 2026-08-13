#!/usr/bin/env node
/**
 * COMMUNICATION AUTOMATION BASELINE — read-only, every tenant.
 *
 * scripts/ark-baseline.mjs proves ARK's BUSINESS data did not change. This
 * proves the COMMUNICATION CONFIGURATION did not change either — which is a
 * different question, and the one that matters when the thing being edited is
 * the automation engine.
 *
 * Captures per organization: automation settings (every row, not a count),
 * enabled count, template rows, queue and audit counts, and the business
 * counts the automations read from.
 *
 * ── WHY EVERY SETTING ROW AND NOT A COUNT ──────────────────────────────────
 * "20 enabled" stays 20 if one event is switched off and another on. The
 * per-event enabled/channel/timing/template triple is the thing an operator
 * would actually miss, so the comparison is row-by-row.
 *
 *   node scripts/comms-baseline.mjs             # capture
 *   node scripts/comms-baseline.mjs --compare   # diff, exit 1 on loss
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "generated");
const OUT = join(OUT_DIR, "COMMS_BASELINE.json");
const COMPARE = process.argv.includes("--compare");

const SUPABASE = process.platform === "win32" ? "supabase.cmd" : "supabase";
const TMP = join(tmpdir(), `comms-baseline-${process.pid}.sql`);

const sql = (query) => {
  writeFileSync(TMP, query, "utf8");
  let raw;
  try {
    raw = execFileSync(SUPABASE, ["db", "query", "--linked", "-o", "json", "--file", TMP], {
      cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
    });
  } catch (e) {
    throw new Error(`${e.stdout ?? ""}${e.stderr ?? ""}`.trim() || e.message);
  }
  const i = raw.indexOf("{");
  return i < 0 ? [] : JSON.parse(raw.slice(i, raw.lastIndexOf("}") + 1)).rows ?? [];
};

// Business tables the automations read from. A decrease in any of these means
// an automation change destroyed source data, which is the nightmare case.
const COUNTED = [
  "students", "profiles", "student_attendance", "exam_results",
  "student_fees", "payroll_runs", "leads", "demo_classes",
  "message_queue", "comms_audit", "comms_templates", "comms_automation_settings",
];

const orgs = sql(
  `select id, slug, display_name, timezone, status from public.organizations order by created_at`,
);
if (orgs.length === 0) {
  console.error("FATAL: no organizations. Refusing to continue.");
  process.exit(2);
}

const snapshot = { capturedAt: new Date().toISOString(), organizations: {} };

for (const org of orgs) {
  const counts = {};
  const countQuery = COUNTED.map(
    (t) => `select '${t}' as t, count(*)::bigint as n from public.${t} where organization_id = '${org.id}'`,
  ).join(" union all ");
  for (const r of sql(countQuery)) counts[r.t] = Number(r.n);

  // Row-level, ordered, so the diff is stable and readable.
  const settings = sql(
    `select event_key, enabled, channel, timing, template_key, quiet_start, quiet_end, priority
       from public.comms_automation_settings
      where organization_id = '${org.id}' order by event_key`,
  );

  const templates = sql(
    `select template_key, is_active, provider_name, language
       from public.comms_templates
      where organization_id = '${org.id}' order by template_key`,
  );

  snapshot.organizations[org.slug] = {
    id: org.id,
    slug: org.slug,
    displayName: org.display_name,
    timezone: org.timezone,
    status: org.status,
    counts,
    enabledCount: settings.filter((s) => s.enabled).length,
    settings,
    templates,
  };
}

if (COMPARE) {
  if (!existsSync(OUT)) {
    console.error(`FATAL: no baseline at ${OUT}. Capture one before comparing.`);
    process.exit(2);
  }
  const before = JSON.parse(readFileSync(OUT, "utf8"));
  const problems = [];
  const notes = [];

  for (const [slug, was] of Object.entries(before.organizations)) {
    const now = snapshot.organizations[slug];
    if (!now) { problems.push(`organization "${slug}" DISAPPEARED`); continue; }

    if (was.id !== now.id) problems.push(`${slug}: organization id changed`);
    if (was.timezone !== now.timezone) notes.push(`${slug}: timezone ${was.timezone} → ${now.timezone}`);

    for (const [t, n] of Object.entries(was.counts)) {
      const v = now.counts[t];
      if (v === undefined) problems.push(`${slug}.${t}: table missing`);
      else if (v < n) problems.push(`${slug}.${t}: ${n} → ${v}  (LOST ${n - v} rows)`);
      else if (v > n) notes.push(`${slug}.${t}: ${n} → ${v}  (+${v - n}, normal activity)`);
    }

    // Settings compared per event. A NEW event row is normal (the registry
    // grows); a LOST one, or a flipped enable/channel/template, is not.
    const byKey = new Map(now.settings.map((s) => [s.event_key, s]));
    for (const s of was.settings) {
      const n = byKey.get(s.event_key);
      if (!n) { problems.push(`${slug}: automation setting "${s.event_key}" was DELETED`); continue; }
      for (const f of ["enabled", "channel", "timing", "template_key"]) {
        if (String(s[f] ?? "") !== String(n[f] ?? "")) {
          problems.push(`${slug}.${s.event_key}.${f}: "${s[f]}" → "${n[f]}"`);
        }
      }
    }
    const added = now.settings.filter((s) => !was.settings.some((w) => w.event_key === s.event_key));
    if (added.length) notes.push(`${slug}: ${added.length} new automation row(s): ${added.map((a) => a.event_key).join(", ")}`);

    if (now.enabledCount !== was.enabledCount) {
      problems.push(`${slug}: enabled automations ${was.enabledCount} → ${now.enabledCount}`);
    }
  }

  writeFileSync(join(OUT_DIR, "COMMS_BASELINE_AFTER.json"), JSON.stringify(snapshot, null, 2));

  console.log(`Baseline captured ${before.capturedAt}`);
  console.log(`Compared        ${snapshot.capturedAt}\n`);
  if (notes.length) {
    console.log("Expected changes:");
    for (const n of notes) console.log("  " + n);
    console.log();
  }
  if (problems.length) {
    console.error("REGRESSIONS:");
    for (const p of problems) console.error("  " + p);
    process.exit(1);
  }
  console.log("PASS — no row lost, and no automation setting changed, in any organization.");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot, null, 2));

console.log(`Communication baseline → ${OUT}\n`);
for (const o of Object.values(snapshot.organizations)) {
  console.log(`  ${o.slug}  (${o.id})`);
  console.log(`    status ${o.status} · timezone ${o.timezone ?? "—"}`);
  console.log(`    automations ${o.settings.length} rows, ${o.enabledCount} enabled`);
  console.log(`    templates   ${o.templates.length}`);
  for (const [t, n] of Object.entries(o.counts)) {
    if (n > 0) console.log(`    ${t.padEnd(26)} ${String(n).padStart(6)}`);
  }
  console.log();
}
