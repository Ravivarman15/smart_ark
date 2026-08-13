#!/usr/bin/env node
/**
 * AISENSY TEMPLATE PROBE — is this campaign actually approved and sendable?
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `providerTemplates.ts` tracks a template's approval state as a string we
 * maintain by hand. That string is a BELIEF about what Meta did. Flipping it to
 * ACTIVE on a wrong belief is the expensive mistake: `resolveCampaign()` starts
 * returning a campaign AiSensy does not have, every send is rejected, and a
 * school's parents silently stop receiving attendance messages altogether —
 * which is worse than receiving one with the wrong sign-off.
 *
 * This asks the provider instead of trusting the string.
 *
 * ── IT SENDS A REAL MESSAGE ────────────────────────────────────────────────
 * There is no read-only "does this campaign exist" endpoint. AiSensy's API only
 * accepts a send, so:
 *   · if the campaign is APPROVED  → one real WhatsApp arrives at --to
 *   · if it is not                 → AiSensy errors and nothing is sent
 *
 * So `--to` must be YOUR OWN number. The script refuses to run without an
 * explicit destination and never reads one from the database.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… node scripts/aisensy-template-probe.mjs \
 *     --campaign=smartark_attendance_absent --to=9XXXXXXXXX
 *
 *   # probe every multi-tenant campaign at once
 *   … --all --to=9XXXXXXXXX
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error(
    "FATAL: SUPABASE_SERVICE_ROLE_KEY is not set.\n" +
      "  Supabase → Project Settings → API. Pass it in the environment for this\n" +
      "  one command; do not put it in .env.",
  );
  process.exit(2);
}

const to = arg("to");
if (!to) {
  console.error(
    "FATAL: --to=<your own mobile> is required.\n\n" +
      "  If the campaign IS approved this sends a real WhatsApp message, so the\n" +
      "  destination must be a number you control. It is never taken from the\n" +
      "  database, and there is no default.",
  );
  process.exit(2);
}

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);
const FN = `${env.VITE_SUPABASE_URL}/functions/v1/send-aisensy`;

// Sample values, one per declared parameter. Deliberately obvious placeholders:
// if one of these reaches a real customer through a mistake, it reads as a test
// rather than as a wrong fact about their child.
const SAMPLE = {
  parent_name: "Test Parent", student_name: "Test Student", staff_name: "Test Staff",
  class: "Test Class", section: "A", attendance_date: "01 Jan 2026",
  role: "Test Role", login_email: "test@example.com", password: "TEST-ONLY",
  login_url: "https://example.com/login", receipt_no: "TEST-0000",
  amount_paid: "1", pending_balance: "0", org_name: "Test Institute",
};

// Read the declared parameter order straight from the source of truth, so the
// probe cannot pass with a parameter count the application would never send.
const src = readFileSync(
  join(ROOT, "src", "features", "communication", "constants", "providerTemplates.ts"), "utf8",
);
const templates = [...src.matchAll(
  /campaign: "([a-z0-9_]+)",[\s\S]*?params: \[([^\]]*)\][\s\S]*?status: "([A-Z_]+)"/g,
)].map((m) => ({
  campaign: m[1],
  params: m[2].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean),
  status: m[3],
}));

const wanted = process.argv.includes("--all")
  ? templates
  : templates.filter((t) => t.campaign === arg("campaign"));

if (wanted.length === 0) {
  console.error(
    `FATAL: no template named "${arg("campaign")}".\n  Known: ${templates.map((t) => t.campaign).join(", ")}`,
  );
  process.exit(2);
}

console.log(`\nAISENSY TEMPLATE PROBE → ${to}`);
console.log(`  A real message arrives ONLY if the campaign is approved.\n`);

let approved = 0;
let rejected = 0;

for (const t of wanted) {
  const templateParams = t.params.map((p) => SAMPLE[p] ?? "TEST");
  const res = await fetch(FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      debug: {
        campaignName: t.campaign,
        destination: to,
        templateParams,
        userName: "Template Probe",
        source: "Smart ARK template probe",
      },
    }),
  });

  let out;
  try { out = JSON.parse(await res.text()); } catch { out = { responseStatus: res.status }; }
  const body = String(out.responseBody ?? "");
  // AiSensy answers 200 with a success body only when the campaign exists and
  // is approved. Anything else — 4xx, or a 200 carrying an error — means it is
  // not sendable, whatever our status string claims.
  const ok = out.responseStatus === 200 && !/error|not found|invalid|fail/i.test(body);

  console.log(`  ${ok ? "APPROVED " : "NOT USABLE"}  ${t.campaign}`);
  console.log(`      declared status : ${t.status}`);
  console.log(`      params sent     : ${templateParams.length} (${t.params.join(", ")})`);
  console.log(`      provider        : HTTP ${out.responseStatus} ${body.slice(0, 220)}`);
  if (ok && t.status !== "ACTIVE") {
    console.log(`      → Meta accepts it. Safe to set status: "ACTIVE" in providerTemplates.ts.`);
  }
  if (!ok && t.status === "ACTIVE") {
    console.log(`      → MARKED ACTIVE BUT NOT SENDABLE. Every send is failing. Revert it.`);
  }
  console.log();
  ok ? (approved += 1) : (rejected += 1);
}

console.log(`  ${approved} approved · ${rejected} not usable\n`);
process.exit(rejected > 0 ? 1 : 0);
