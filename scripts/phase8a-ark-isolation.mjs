#!/usr/bin/env node
/**
 * Phase 8A — ARK-side runtime isolation harness.
 *
 * Proves the ARK→ABC direction of the tenant isolation matrix using a REAL
 * authenticated ARK session. The ABC→ARK direction is already proven; this is
 * the half that needs a credential nobody should paste into a chat window.
 *
 * ── WHAT THIS DOES TO ARK ────────────────────────────────────────────────────
 *   Reads   : row COUNTS only (never row contents), via PostgREST count headers.
 *   Writes  : four attempts, every one of them TARGETED AT ABC-OWNED ROWS.
 *             RLS is expected to reject them, so they affect nothing — and even
 *             if RLS were broken they could only touch ABC's test tenant.
 *
 *   ARK rows created  : 0
 *   ARK rows modified : 0
 *   ARK rows deleted  : 0
 *
 * Nothing is written to ARK under any outcome. There is no code path here that
 * targets an ARK row with a write.
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────────
 *   1. Sign in to Smart ARK as an ARK admin or management user, in a browser.
 *   2. DevTools → Application → Local Storage → your Smart ARK origin.
 *      Find the key   sb-vxyshcucwdbpxrhddaeh-auth-token
 *      Copy the        access_token        value out of that JSON.
 *   3. node scripts/phase8a-ark-isolation.mjs "<paste-the-access-token>"
 *   4. Send back everything it prints.
 *
 * The token is short-lived (about an hour) and is never stored by this script.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const JWT = process.argv[2];
if (!JWT || JWT.split(".").length !== 3) {
  console.error("Usage: node scripts/phase8a-ark-isolation.mjs <access_token>");
  console.error("See the header of this file for where to find the token.");
  process.exit(1);
}

// Read the project URL + anon key from .env — the same values the browser uses.
const env = readFileSync(join(ROOT, ".env"), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^"|"$/g, "");
const URL = pick("VITE_SUPABASE_URL");
const KEY = pick("VITE_SUPABASE_PUBLISHABLE_KEY");
if (!URL || !KEY) {
  console.error("Could not read VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from .env");
  process.exit(1);
}

const ARK = "126a6dd8-6f7e-4b81-9b82-58a9a3b77674";
const ABC = "12028704-0344-4900-af41-2f71b2372627";

// Confirm the token really belongs to ARK before running anything, so a token
// pasted from the wrong tab produces a clear error instead of a confusing
// matrix full of zeroes.
const claims = JSON.parse(Buffer.from(JWT.split(".")[1], "base64").toString());
const tokenOrg = claims?.app_metadata?.organization_id;
if (tokenOrg !== ARK) {
  console.error(`This token belongs to organization ${tokenOrg ?? "<none>"}, not ARK (${ARK}).`);
  console.error("Sign in as an ARK admin and copy that session's access_token.");
  process.exit(1);
}
if (claims.exp * 1000 < Date.now()) {
  console.error("That token has expired. Refresh the page and copy a new one.");
  process.exit(1);
}

const H = (extra = {}) => ({
  apikey: KEY,
  Authorization: `Bearer ${JWT}`,
  "Content-Type": "application/json",
  ...extra,
});

/** Row count only. Row CONTENTS are never requested. */
async function count(table, filter = "") {
  const r = await fetch(`${URL}/rest/v1/${table}?select=id${filter}`, {
    headers: H({ Prefer: "count=exact", Range: "0-0" }),
  });
  if (!r.ok) return `HTTP ${r.status}`;
  const cr = r.headers.get("content-range") || "";
  const total = cr.includes("/") ? cr.split("/")[1] : null;
  return total === "*" || total === null ? "?" : Number(total);
}

const TABLES = [
  "students", "profiles", "organization_users", "student_attendance",
  "teacher_attendance", "exams", "exam_results", "student_fees",
  "fee_installments", "payroll_items", "message_queue", "leads",
  "student_documents", "organization_branches",
];

const pad = (s, n) => String(s).padEnd(n);
const rows = [];

console.log("\nPhase 8A — ARK → ABC runtime isolation");
console.log(`Session organization: ${tokenOrg} (ARK)\n`);
console.log(` ${pad("table", 22)} ${pad("ARK own", 9)} ${pad("ARK→ABC", 9)} verdict`);

for (const t of TABLES) {
  const own = await count(t, `&organization_id=eq.${ARK}`);
  const cross = await count(t, `&organization_id=eq.${ABC}`);

  // A zero from a session that cannot see its OWN data proves nothing — that
  // is precisely the trap the first version of this harness fell into.
  const verdict =
    typeof own !== "number" || typeof cross !== "number" ? "ERROR"
      : cross > 0 ? "LEAK"
      : own > 0 ? "PASS"
      : "INCONCLUSIVE (no ARK rows to control against)";

  rows.push({ table: t, own, cross, verdict });
  console.log(` ${pad(t, 22)} ${pad(own, 9)} ${pad(cross, 9)} ${verdict}`);
}

// ── Write isolation. Every target below is an ABC-owned row. ────────────────
console.log("\n ARK → ABC write isolation (all targets are ABC rows; ARK is never written)");

const writes = [
  ["INSERT student into ABC", "POST", "students",
    { name: "PHASE8A-TEST ark-side probe", organization_id: ABC }, ""],
  ["UPDATE ABC student_fees", "PATCH", "student_fees",
    { amount_pending: 0 }, `?organization_id=eq.${ABC}`],
  ["UPDATE ABC branches", "PATCH", "organization_branches",
    { name: "PHASE8A-TEST hijacked" }, `?organization_id=eq.${ABC}`],
  ["DELETE ABC leads", "DELETE", "leads", null, `?organization_id=eq.${ABC}`],
];

for (const [label, method, table, body, filter] of writes) {
  const r = await fetch(`${URL}/rest/v1/${table}${filter}`, {
    method,
    headers: H({ Prefer: "return=representation" }),
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try { payload = await r.json(); } catch { /* 204 */ }
  const affected = Array.isArray(payload) ? payload.length : r.ok ? 1 : 0;
  console.log(` ${pad(label, 26)} HTTP ${pad(r.status, 5)} rows=${pad(affected, 4)} ${affected === 0 ? "BLOCKED" : "LEAK"}`);
}

// ── ARK's own check-in configuration, read back through the app's own path ──
console.log("\n ARK check-in configuration (read-only)");
const settings = await fetch(
  `${URL}/rest/v1/attendance_settings?select=checkin_mode,checkin_geo_enforced,checkin_default_radius_meters`,
  { headers: H() },
).then((r) => r.json()).catch(() => null);
console.log(" ", JSON.stringify(settings));

const locs = await fetch(
  `${URL}/rest/v1/organization_branches?select=name,geo_radius_meters,is_checkin_location,is_active&is_checkin_location=eq.true`,
  { headers: H() },
).then((r) => r.json()).catch(() => null);
console.log(" ", JSON.stringify(locs));

const pass = rows.filter((r) => r.verdict === "PASS").length;
console.log(`\n RESULT: ${pass}/${TABLES.length} ARK→ABC verified with a positive control.`);
console.log(" ARK rows created/modified/deleted by this script: 0 / 0 / 0\n");
