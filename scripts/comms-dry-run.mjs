#!/usr/bin/env node
/**
 * COMMUNICATION DRY RUN — resolve, render, report. Write nothing, send nothing.
 *
 * ── WHY A SCRIPT AND NOT A CURL LINE ───────────────────────────────────────
 * The whole point of a dry run is that an operator can tell, BEFORE any
 * message leaves the building, exactly who would be contacted and why the
 * rest would not. A raw curl returns 40KB of JSON in which "wouldQueue: 0"
 * and "missingVariableSkipped: 126" are two lines nobody reads. This prints
 * the breakdown as a decision table.
 *
 * It calls the deployed function with { dryRun: true }, which the function
 * enforces: `events` (forcing resolution of automations the tenant has NOT
 * enabled) is rejected outright unless dryRun is set, and no INSERT is
 * reached on a dry-run path.
 *
 *   node scripts/comms-dry-run.mjs                          # every org, enabled events
 *   node scripts/comms-dry-run.mjs --org=ark-learning-arena
 *   node scripts/comms-dry-run.mjs --org=<slug> --events=fee_due,birthday_student
 *   node scripts/comms-dry-run.mjs --date=2026-08-20        # run as if it were that date
 *   node scripts/comms-dry-run.mjs --json                   # raw response
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const RAW_JSON = process.argv.includes("--json");

// ── credentials ────────────────────────────────────────────────────────────
//
// The service role key is required and is read from the ENVIRONMENT only —
// never from .env, never a default, never printed. The anon key used to work
// here; it no longer does, because comms-scheduler now refuses it: that key
// ships inside the frontend bundle, and a dry run returns real parents' names.
//
//   Windows:  $env:SUPABASE_SERVICE_ROLE_KEY="..."; node scripts/comms-dry-run.mjs
//   POSIX:    SUPABASE_SERVICE_ROLE_KEY=... node scripts/comms-dry-run.mjs
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error(
    "FATAL: SUPABASE_SERVICE_ROLE_KEY is not set.\n" +
      "  Find it in Supabase → Project Settings → API, and pass it in the environment\n" +
      "  for this one command. Do not add it to .env — .env is read by the frontend build.",
  );
  process.exit(2);
}

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const URL_BASE = env.VITE_SUPABASE_URL;
if (!URL_BASE) {
  console.error("FATAL: VITE_SUPABASE_URL missing from .env");
  process.exit(2);
}

// ── slug → id, read-only ───────────────────────────────────────────────────
const SUPABASE = process.platform === "win32" ? "supabase.cmd" : "supabase";
function orgIdForSlug(slug) {
  const tmp = join(tmpdir(), `dryrun-org-${process.pid}.sql`);
  writeFileSync(tmp, `select id, slug, timezone from public.organizations where slug = '${slug}'`, "utf8");
  const raw = execFileSync(SUPABASE, ["db", "query", "--linked", "-o", "json", "--file", tmp], {
    cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  const i = raw.indexOf("{");
  const rows = i < 0 ? [] : JSON.parse(raw.slice(i, raw.lastIndexOf("}") + 1)).rows ?? [];
  if (!rows.length) {
    console.error(`FATAL: no organization with slug "${slug}"`);
    process.exit(2);
  }
  return rows[0];
}

const slug = arg("org");
const org = slug ? orgIdForSlug(slug) : null;

const payload = { dryRun: true };
if (org) payload.organizationId = org.id;
if (arg("events")) payload.events = arg("events").split(",").map((s) => s.trim()).filter(Boolean);
if (arg("date")) payload.date = arg("date");

const res = await fetch(`${URL_BASE}/functions/v1/comms-scheduler`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  body: JSON.stringify(payload),
});
const text = await res.text();
let out;
try {
  out = JSON.parse(text);
} catch {
  console.error(`HTTP ${res.status}\n${text.slice(0, 2000)}`);
  process.exit(1);
}

if (RAW_JSON) {
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok === false ? 1 : 0);
}

// ── report ─────────────────────────────────────────────────────────────────
const dash = (n) => (n === null || n === undefined ? "—" : String(n));
const pad = (s, n) => String(s).padEnd(n);

console.log(`\nDRY RUN — nothing written, nothing sent`);
console.log(`  ${URL_BASE}/functions/v1/comms-scheduler   HTTP ${res.status}`);
if (payload.date) console.log(`  as if the date were ${payload.date}`);
console.log(
  `  ok ${out.ok}   organizations ${dash(out.organizations)}` +
    `   failed ${dash(out.organizationsFailed)}   eventErrors ${dash(out.eventErrors)}\n`,
);

for (const o of out.results ?? []) {
  console.log(`━━ ${o.organization}  ·  timezone ${o.timezone ?? "—"}  ·  local date ${o.date ?? "—"}`);
  if (o.error) console.log(`   ORG FAILED [${o.failureKind ?? "UNCLASSIFIED"}] ${o.error}`);

  for (const [eventKey, e] of Object.entries(o.events ?? {})) {
    console.log(
      `   ${pad(eventKey, 24)} ` +
        `${pad(e.templateStatus ?? "—", 9)} ` +
        `candidates ${pad(dash(e.candidates), 5)} ` +
        `eligible ${pad(dash(e.eligible), 5)} ` +
        `${e.dryRun ? "wouldQueue" : "queued"} ${dash(e.wouldQueue ?? e.queued)}`,
    );

    if (e.error) {
      console.log(`       ERROR [${e.failureKind ?? "UNCLASSIFIED"}] ${e.error}`);
      continue;
    }

    const skips = [
      ["preference", e.preferenceSkipped],
      ["no phone", e.missingPhone],
      ["duplicate", e.duplicates],
      ["missing variable", e.missingVariableSkipped],
      ["quiet-hours deferred", e.quietHoursDeferred],
    ].filter(([, n]) => n);
    if (skips.length) console.log(`       skipped: ${skips.map(([k, n]) => `${k} ${n}`).join(" · ")}`);

    // The actionable half: WHICH variable, not "some data was missing".
    for (const [code, n] of Object.entries(e.missingDataReasons ?? {})) {
      console.log(`       ${pad(code, 28)} × ${n}`);
    }
    if (e.missingVariableExamples?.length) {
      console.log(`       e.g. ${e.missingVariableExamples.slice(0, 2).map((x) => x.contextId).join(", ")}`);
    }
    if (e.sampleMessage) {
      console.log(`       ┌ sample message (rendered, not sent)`);
      for (const line of String(e.sampleMessage).split("\n")) console.log(`       │ ${line}`);
      console.log(`       └`);
    }
  }
  if (o.notes?.length) for (const n of o.notes) console.log(`   note: ${n}`);
  console.log();
}

// A dry run that reports ok:false has found a real fault — surface it as a
// non-zero exit so CI and the operator see the same verdict.
process.exit(out.ok === false ? 1 : 0);
