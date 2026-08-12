#!/usr/bin/env node
/**
 * ARK EFFECTIVE MODULE SNAPSHOT — the production regression reference.
 *
 * Reads ARK's live entitlement layers, resolves them through the SHIPPED
 * resolver, and writes docs/ARK_MODULE_SNAPSHOT.json.
 *
 * ── WHY A SNAPSHOT AND NOT A TEST FIXTURE ──────────────────────────────────
 * A hand-written expectation would encode what someone BELIEVED ARK had. This
 * records what ARK actually resolves to, so a later deployment that silently
 * changes one module is caught by diff rather than by a customer.
 *
 * Read-only against the database. Writes one JSON file.
 *
 *   node scripts/ark-module-snapshot.mjs             # capture
 *   node scripts/ark-module-snapshot.mjs --compare   # diff, exit 1 on change
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "ARK_MODULE_SNAPSHOT.json");
const COMPARE = process.argv.includes("--compare");

const SUPABASE = process.platform === "win32" ? "supabase.cmd" : "supabase";
const TMP = join(tmpdir(), `ark-snapshot-${process.pid}.sql`);

const sql = (q) => {
  writeFileSync(TMP, q, "utf8");
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

// The resolver is TypeScript. Rather than duplicate its 6-layer precedence in
// JavaScript here — the exact drift this architecture exists to prevent — the
// layers are written to disk and resolved by a vitest run that imports the real
// module. This script only fetches and diffs.
const rows = sql(
  `select public.entitlement_layers(
     (select id from public.organizations where slug='ark')) as layers`,
);
const layers = rows[0]?.layers;
if (!layers) {
  console.error("FATAL: could not read ARK entitlement layers.");
  process.exit(2);
}

writeFileSync(
  join(ROOT, "docs", "generated", "ARK_ENTITLEMENT_LAYERS.json"),
  JSON.stringify(layers, null, 2),
);

// Resolve via the shipped resolver, executed by vitest so the TS is compiled by
// the same toolchain the app uses.
const resolved = JSON.parse(
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vitest", "run", "--silent=false", "--reporter=basic", "src/test/arkSnapshot.gen.test.ts"],
    { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", maxBuffer: 16 * 1024 * 1024 },
  ).match(/<<SNAPSHOT>>([\s\S]*?)<<\/SNAPSHOT>>/)?.[1] ?? "null",
);

const snapshot = {
  capturedAt: new Date().toISOString(),
  organization: { slug: "ark", plan: layers.plan_code, status: layers.status },
  overrides: layers.overrides,
  modules: resolved,
};

if (COMPARE) {
  if (!existsSync(OUT)) {
    console.error(`FATAL: no snapshot at ${OUT}.`);
    process.exit(2);
  }
  const before = JSON.parse(readFileSync(OUT, "utf8"));
  const diffs = [];
  for (const [id, v] of Object.entries(before.modules)) {
    const now = snapshot.modules[id];
    if (!now) diffs.push(`${id}: DISAPPEARED from the catalog`);
    else if (now.enabled !== v.enabled)
      diffs.push(`${id}: ${v.enabled ? "ON" : "OFF"} → ${now.enabled ? "ON" : "OFF"}  (${now.source})`);
  }
  for (const id of Object.keys(snapshot.modules)) {
    if (!(id in before.modules)) diffs.push(`${id}: NEW module appeared`);
  }
  if (diffs.length) {
    console.error("ARK MODULE SET CHANGED:");
    for (const d of diffs) console.error("  " + d);
    process.exit(1);
  }
  const on = Object.values(snapshot.modules).filter((m) => m.enabled).length;
  console.log(`PASS — ARK module set unchanged (${on}/${Object.keys(snapshot.modules).length} enabled).`);
  process.exit(0);
}

writeFileSync(OUT, JSON.stringify(snapshot, null, 2));
const on = Object.entries(snapshot.modules).filter(([, m]) => m.enabled);
const off = Object.entries(snapshot.modules).filter(([, m]) => !m.enabled);
console.log(`ARK module snapshot → ${OUT}`);
console.log(`  plan ${layers.plan_code} · status ${layers.status}`);
console.log(`  ENABLED  ${on.length}: ${on.map(([id]) => id).join(", ")}`);
console.log(`  DISABLED ${off.length}: ${off.length ? off.map(([id]) => id).join(", ") : "none"}`);
