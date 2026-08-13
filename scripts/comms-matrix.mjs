#!/usr/bin/env node
/**
 * COMMUNICATION AUTOMATION MATRIX — generated, never hand-written.
 *
 * ── WHY GENERATED ──────────────────────────────────────────────────────────
 * The previous matrix was written by hand and was wrong within a day: it
 * listed four events as working that nothing in the application dispatches.
 * A hand-maintained status table is a snapshot of what someone believed on
 * the day they wrote it. This one is derived from the same registry and the
 * same diagnose function the UI and the CI gate use, so the three cannot
 * disagree, and it carries per-tenant configuration read live from the
 * database.
 *
 *   node scripts/comms-matrix.mjs           # regenerate the doc
 *   node scripts/comms-matrix.mjs --check   # fail if the doc is stale
 *
 * The registry lives in TypeScript, so the data is exported through the same
 * vitest bridge used elsewhere in this repo rather than duplicated here.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "COMMUNICATION_AUTOMATION_FINAL_MATRIX.md");
const CHECK = process.argv.includes("--check");

// ── pull the diagnosis out of TypeScript ───────────────────────────────────
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const raw = execFileSync(
  npx,
  ["vitest", "run", "src/test/commsMatrixExport.gen.test.ts", "--reporter=basic"],
  {
    cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, EMIT_MATRIX_EXPORT: "1" },
    shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
  },
);
const m = raw.match(/<<MATRIX>>([\s\S]*?)<<\/MATRIX>>/);
if (!m) {
  console.error("FATAL: the export bridge produced no payload.\n" + raw.slice(-3000));
  process.exit(2);
}
const { events, diagnoses } = JSON.parse(m[1]);

// ── live per-tenant configuration, if a baseline exists ────────────────────
const baselinePath = join(ROOT, "docs", "generated", "COMMS_BASELINE.json");
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, "utf8"))
  : null;
const tenants = baseline ? Object.keys(baseline.organizations) : [];
const enabledIn = (slug, key) =>
  baseline?.organizations[slug]?.settings?.find((s) => s.event_key === key)?.enabled ?? null;

// ── render ─────────────────────────────────────────────────────────────────
const byKey = Object.fromEntries(diagnoses.map((d) => [d.eventKey, d]));
const categories = [...new Set(events.map((e) => e.category))];
const tick = (v) => (v === null ? "—" : v ? "yes" : "no");

const STATE_NOTE = {
  ACTIVE: "enabled and able to send",
  READY: "dispatchable; whether it is switched on is per tenant — see the tenant columns",
  PROVIDER_PENDING: "dispatchable, but sending via the LEGACY provider campaign — the organization-neutral template awaits Meta approval",
  MISSING_TRIGGER: "registered, but nothing in the application dispatches it",
  MISSING_TEMPLATE: "no template body resolves — dispatch is a silent no-op",
  MISSING_RESOLVER: "nothing derives the audience",
  BLOCKED: "structurally impossible until the named source exists",
};

const counts = {};
for (const d of diagnoses) counts[d.state] = (counts[d.state] ?? 0) + 1;

let out = `# Communication Automation — Final Matrix

<!-- GENERATED FILE — do not edit by hand.
     Regenerate: node scripts/comms-matrix.mjs
     Verified in CI:  node scripts/comms-matrix.mjs --check
     Source of truth: src/features/communication/constants/automationEvents.ts
                      src/features/communication/utils/automationState.ts -->

Generated **${new Date().toISOString().slice(0, 10)}** from the registry, not from memory.

All **${events.length}** registered events appear below. There is one registry and one
state model; this table, the Communication Center and the CI gate
(\`src/test/security/automationRegistryAudit.test.ts\`) all read them, so a status
here cannot drift from what the system actually does.

## Summary

| State | Count | Meaning |
|---|---|---|
${Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .map(([s, n]) => `| **${s}** | ${n} | ${STATE_NOTE[s] ?? ""} |`)
  .join("\n")}

> **Reading this table.** \`State\` is CAPABILITY — what the system can do at
> all — evaluated against the REGISTRY DEFAULTS, not against any one tenant's
> switches. \`ACTIVE\`, \`READY\` and \`PROVIDER_PENDING\` are all dispatchable;
> the rest are not. Whether a given school has an event switched on is the
> per-tenant column at the right, read live from \`comms_automation_settings\`.
>
> The two are deliberately separate. An event can be switched ON and still be
> \`MISSING_TRIGGER\` — that combination is the defect this work exists to
> surface, and the Communication Center renders it in red rather than as a
> green toggle.

`;

for (const cat of categories) {
  out += `\n## ${cat}\n\n`;
  out += `| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing |`;
  for (const t of tenants) out += ` ${t} |`;
  out += `\n|---|---|---|---|---|---|---|---|${tenants.map(() => "---|").join("")}\n`;

  for (const e of events.filter((x) => x.category === cat)) {
    const d = byKey[e.key];
    out += `| \`${e.key}\` | **${d.state}** | ${tick(d.triggerReady)} | ${tick(d.resolverReady)} | `;
    out += `${d.templateReady ? `\`${d.templateKey}\`` : "**none**"} | ${d.providerStatus} | `;
    out += `${d.channel} | ${d.timing} |`;
    for (const t of tenants) {
      const en = enabledIn(t, e.key);
      out += ` ${en === null ? "—" : en ? "on" : "off"} |`;
    }
    out += "\n";
  }
}

// ── the honest tail: why each non-working event does not work ──────────────
const broken = diagnoses.filter((d) => !d.dispatchable);
out += `\n## Why the ${broken.length} non-dispatchable events cannot send\n\n`;
out += `Each row names the missing thing. "Not ready" without a cause is a shrug,\n`;
out += `and a shrug is what let ten switches sit green for months.\n\n`;
out += `| Event | State | Reason |\n|---|---|---|\n`;
for (const d of broken) {
  out += `| \`${d.eventKey}\` | ${d.state} | ${d.reason.replace(/\|/g, "\\|")} |\n`;
}

const misleading = diagnoses.filter((d) => d.misleading);
out += `\n## Switches that read ON but cannot send\n\n`;
if (misleading.length === 0) {
  out += `None, by registry default.\n`;
} else {
  out += misleading.map((d) => `- \`${d.eventKey}\` — ${d.reason}`).join("\n") + "\n";
}
out += `\nPer-tenant, this is computed live: the Communication Center counts them at\n`;
out += `the top of the page, and \`automationRegistryAudit.test.ts\` fails the build\n`;
out += `if any of them is a CODE defect (a missing template or resolver) rather than\n`;
out += `a documented configuration one.\n`;

if (CHECK) {
  if (!existsSync(OUT)) {
    console.error(`FATAL: ${OUT} does not exist. Run without --check.`);
    process.exit(1);
  }
  // The generated date line changes daily and is not a drift signal.
  const strip = (s) => s.replace(/^Generated \*\*.*$/m, "");
  if (strip(readFileSync(OUT, "utf8")) !== strip(out)) {
    console.error(
      "FATAL: COMMUNICATION_AUTOMATION_FINAL_MATRIX.md is stale.\n" +
        "  The registry or the state model changed without the matrix being regenerated.\n" +
        "  Run: node scripts/comms-matrix.mjs",
    );
    process.exit(1);
  }
  console.log("PASS — the matrix matches the registry.");
  process.exit(0);
}

writeFileSync(OUT, out);
console.log(`Matrix → ${OUT}`);
console.log(`  ${events.length} events · ${Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(" · ")}`);
