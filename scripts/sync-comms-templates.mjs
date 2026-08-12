#!/usr/bin/env node
/**
 * Export the canonical WhatsApp template bodies for the Deno edge functions.
 *
 * src/features/communication/utils/whatsappTemplates.ts is the ONE place a body
 * is authored. The comms-scheduler edge function cannot import it (Deno, no
 * bundler, different module graph), so this writes the same data to
 * supabase/functions/_shared/commsTemplates.json.
 *
 *   node scripts/sync-comms-templates.mjs           # write
 *   node scripts/sync-comms-templates.mjs --check   # exit 1 if out of date
 *
 * `--check` is what src/test/security/commsTemplateMirror.test.ts effectively
 * asserts: the two sides may never drift.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "supabase", "functions", "_shared", "commsTemplates.json");
const CHECK = process.argv.includes("--check");

const raw = execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vitest", "run", "--silent=false", "--reporter=basic", "src/test/commsTemplateExport.gen.test.ts"],
  {
    cwd: ROOT, encoding: "utf8", shell: process.platform === "win32",
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, EMIT_TEMPLATE_EXPORT: "1" },
  },
);

const match = raw.match(/<<TEMPLATES>>([\s\S]*?)<<\/TEMPLATES>>/);
if (!match) {
  console.error("FATAL: the export bridge produced nothing.");
  process.exit(2);
}

const next = JSON.stringify(JSON.parse(match[1]), null, 2) + "\n";

if (CHECK) {
  if (!existsSync(OUT)) {
    console.error(`OUT OF DATE: ${OUT} does not exist. Run: node scripts/sync-comms-templates.mjs`);
    process.exit(1);
  }
  if (readFileSync(OUT, "utf8") !== next) {
    console.error(
      "OUT OF DATE: the Deno template mirror no longer matches whatsappTemplates.ts.\n" +
        "Run: node scripts/sync-comms-templates.mjs",
    );
    process.exit(1);
  }
  console.log("PASS — Deno template mirror matches the canonical source.");
  process.exit(0);
}

writeFileSync(OUT, next);
const parsed = JSON.parse(next);
console.log(`comms template mirror → ${OUT}`);
console.log(`  templates ${Object.keys(parsed.templates).length}`);
console.log(`  events    ${Object.keys(parsed.eventTemplateKeys).length}`);
