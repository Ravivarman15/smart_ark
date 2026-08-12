#!/usr/bin/env node
/**
 * ENTITLEMENT PROBE — read one organization's live layers and resolve them.
 *
 * The same two steps scripts/ark-module-snapshot.mjs performs, for any tenant:
 * fetch `entitlement_layers(org)` from the database, then hand the JSON to the
 * SHIPPED TypeScript resolver via the vitest bridge. Nothing about the
 * six-layer precedence is reimplemented here — that drift is the whole reason
 * resolution lives in one file.
 *
 * Read-only. Writes one scratch JSON so vitest can pick the layers up.
 *
 *   node scripts/entitlement-probe.mjs abc
 *   node scripts/entitlement-probe.mjs abc certificate exam
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// --at=<ISO> resolves against a hypothetical clock, which is how a temporary
// override is shown to lapse without backdating a live row.
const args = process.argv.slice(2);
const atArg = args.find((a) => a.startsWith("--at="));
const [slug, ...only] = args.filter((a) => !a.startsWith("--"));
if (!slug) {
  console.error("usage: node scripts/entitlement-probe.mjs <org-slug> [module ...]");
  process.exit(2);
}

const SUPABASE = process.platform === "win32" ? "supabase.cmd" : "supabase";
const TMP_SQL = join(tmpdir(), `entitlement-probe-${process.pid}.sql`);

writeFileSync(
  TMP_SQL,
  `select public.entitlement_layers((select id from public.organizations where slug='${slug.replace(/'/g, "''")}')) as layers`,
  "utf8",
);

let raw;
try {
  raw = execFileSync(SUPABASE, ["db", "query", "--linked", "-o", "json", "--file", TMP_SQL], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
  });
} catch (e) {
  console.error(`${e.stdout ?? ""}${e.stderr ?? ""}`.trim() || e.message);
  process.exit(2);
}

const i = raw.indexOf("{");
const layers = i < 0 ? null : JSON.parse(raw.slice(i, raw.lastIndexOf("}") + 1)).rows?.[0]?.layers;
if (!layers) {
  console.error(`FATAL: no entitlement layers for organization '${slug}'.`);
  process.exit(2);
}

const OUT_DIR = join(ROOT, "docs", "generated");
mkdirSync(OUT_DIR, { recursive: true });
const layersFile = join(OUT_DIR, `PROBE_${slug.toUpperCase()}_LAYERS.json`);
writeFileSync(layersFile, JSON.stringify(layers, null, 2));

const resolved = JSON.parse(
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vitest", "run", "--silent=false", "--reporter=basic", "src/test/arkSnapshot.gen.test.ts"],
    {
      cwd: ROOT, encoding: "utf8", shell: process.platform === "win32",
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        ENTITLEMENT_LAYERS_FILE: layersFile,
        ...(atArg ? { ENTITLEMENT_NOW: atArg.slice(5) } : {}),
      },
    },
  ).match(/<<SNAPSHOT>>([\s\S]*?)<<\/SNAPSHOT>>/)?.[1] ?? "null",
);

if (!resolved) {
  console.error("FATAL: the resolver bridge produced no snapshot.");
  process.exit(2);
}

console.log(
  `${slug} · plan ${layers.plan_code} · status ${layers.status}` +
    (atArg ? ` · resolved as at ${atArg.slice(5)}` : ""),
);
const keys = only.length ? only : Object.keys(resolved);
for (const k of keys) {
  const m = resolved[k];
  if (!m) { console.log(`  ${k.padEnd(16)} — not in catalog`); continue; }
  console.log(`  ${k.padEnd(16)} ${m.enabled ? "ON " : "OFF"}  ${m.source.padEnd(12)} ${m.explain}`);
}
if (!only.length) {
  const on = Object.values(resolved).filter((m) => m.enabled).length;
  console.log(`  → ${on}/${Object.keys(resolved).length} enabled`);
}
