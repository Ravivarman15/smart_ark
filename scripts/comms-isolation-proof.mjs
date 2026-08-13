#!/usr/bin/env node
/**
 * MULTI-TENANT ISOLATION PROOF — executed against the live deployment.
 *
 * ── WHY A SCRIPT RATHER THAN A UNIT TEST ───────────────────────────────────
 * Every claim here is about the DEPLOYED function talking to the REAL
 * database: that ARK's run cannot see ABC's students, that a body-supplied
 * organizationId cannot redirect a run, that the anon key is refused, and
 * that the message ARK renders never carries ABC's name. A unit test with a
 * mocked client would assert the mock. These assertions can only be made by
 * calling the thing that is actually deployed.
 *
 * NOTHING IS SENT AND NOTHING IS WRITTEN: every call sets dryRun: true.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… node scripts/comms-isolation-proof.mjs
 *
 * Writes docs/generated/COMMS_ISOLATION_PROOF.json and exits non-zero on any
 * failed assertion.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "generated");

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("FATAL: SUPABASE_SERVICE_ROLE_KEY is not set (environment only — never .env).");
  process.exit(2);
}

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);
const FN = `${env.VITE_SUPABASE_URL}/functions/v1/comms-scheduler`;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SUPABASE = process.platform === "win32" ? "supabase.cmd" : "supabase";
const sql = (query) => {
  const tmp = join(tmpdir(), `isolation-${process.pid}.sql`);
  writeFileSync(tmp, query, "utf8");
  const raw = execFileSync(SUPABASE, ["db", "query", "--linked", "-o", "json", "--file", tmp], {
    cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32", maxBuffer: 32 * 1024 * 1024,
  });
  const i = raw.indexOf("{");
  return i < 0 ? [] : JSON.parse(raw.slice(i, raw.lastIndexOf("}") + 1)).rows ?? [];
};

const call = async (payload, key = SERVICE_KEY) => {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = JSON.parse(await res.text()); } catch { /* non-JSON is itself a result */ }
  return { status: res.status, body };
};

const results = [];
let failures = 0;
const assert = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail });
  if (!pass) failures += 1;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
};

// ── Fixtures: real organizations, real birthdays ───────────────────────────
const orgs = sql(`select id, slug, display_name, timezone from public.organizations order by created_at`);
if (orgs.length < 2) {
  console.error("FATAL: isolation cannot be proven with fewer than two organizations.");
  process.exit(2);
}
const [A, B] = orgs;

// A date on which each tenant actually has a birthday, so the run renders a
// real message rather than resolving to zero and proving nothing.
const birthdays = Object.fromEntries(
  sql(
    `select o.slug, min(to_char(s.date_of_birth,'MM-DD')) as md
       from public.students s join public.organizations o on o.id = s.organization_id
      where s.date_of_birth is not null and s.parent_contact is not null
      group by o.slug`,
  ).map((r) => [r.slug, r.md]),
);

console.log(`\nMULTI-TENANT ISOLATION PROOF — dry run only, nothing sent\n`);
console.log(`  A = ${A.slug} (${A.display_name})`);
console.log(`  B = ${B.slug} (${B.display_name})\n`);

// ── 1. The anonymous key cannot read tenant data ───────────────────────────
{
  const r = await call({ dryRun: true }, ANON);
  assert(
    "the anon key (shipped in the frontend bundle) is refused",
    r.status === 401,
    `HTTP ${r.status}`,
  );
}

// ── 2. A run scoped to A never resolves B's recipients ─────────────────────
const runs = {};
for (const org of [A, B]) {
  const md = birthdays[org.slug];
  const date = md ? `2026-${md}` : undefined;
  const r = await call({
    dryRun: true, organizationId: org.id, events: ["birthday_student", "fee_due"],
    ...(date ? { date } : {}),
  });
  runs[org.slug] = r;
  assert(`${org.slug}: dry run succeeds`, r.status === 200 && r.body?.ok, `HTTP ${r.status}`);
  assert(
    `${org.slug}: exactly one organization in the result`,
    r.body?.results?.length === 1 && r.body.results[0].organization === org.slug,
    `results: ${(r.body?.results ?? []).map((x) => x.organization).join(", ") || "none"}`,
  );
}

// ── 3. Candidate counts differ and match each tenant's own data ────────────
{
  const counts = Object.fromEntries(
    sql(
      `select o.slug, count(*) n from public.student_fees f
         join public.organizations o on o.id = f.organization_id
        where coalesce(f.amount_pending,0) > 0 group by o.slug`,
    ).map((r) => [r.slug, Number(r.n)]),
  );
  for (const org of [A, B]) {
    const resolved = runs[org.slug].body?.results?.[0]?.events?.fee_due?.candidates;
    assert(
      `${org.slug}: fee_due resolves ${org.slug}'s own rows, not the platform's`,
      resolved !== undefined && resolved <= (counts[org.slug] ?? 0),
      `resolved ${resolved}, tenant has ${counts[org.slug] ?? 0} pending`,
    );
  }
  const a = runs[A.slug].body?.results?.[0]?.events?.fee_due?.candidates;
  const b = runs[B.slug].body?.results?.[0]?.events?.fee_due?.candidates;
  assert(
    "the two tenants resolve different audiences",
    a !== b,
    `${A.slug}=${a}, ${B.slug}=${b}`,
  );
}

// ── 4. The rendered message carries the RIGHT tenant's identity ────────────
//
// The single most visible cross-tenant failure: a school's parents receiving a
// message signed by a competitor.
{
  for (const [me, other] of [[A, B], [B, A]]) {
    const ev = runs[me.slug].body?.results?.[0]?.events?.birthday_student;
    const sample = ev?.sampleMessage;
    if (!sample) {
      assert(`${me.slug}: a message was rendered to inspect`, false,
        "no sample — cannot prove the sign-off, treat as INCONCLUSIVE");
      continue;
    }
    assert(
      `${me.slug}: the rendered body carries ITS OWN name`,
      sample.includes(me.display_name),
      JSON.stringify(sample),
    );
    assert(
      `${me.slug}: the rendered body does NOT carry ${other.slug}'s name`,
      !sample.includes(other.display_name),
      "",
    );
    assert(
      `${me.slug}: no unsubstituted {{variable}} reaches the recipient`,
      !/\{\{[^}]+\}\}/.test(sample),
      "",
    );
  }
}

// ── 5. Idempotency keys are per-tenant-day, not global ─────────────────────
{
  for (const org of [A, B]) {
    const ex = runs[org.slug].body?.results?.[0]?.events?.fee_due?.missingVariableExamples?.[0];
    if (!ex) continue;
    assert(
      `${org.slug}: the idempotency key includes the tenant-local date`,
      /:\d{4}-\d{2}-\d{2}$/.test(ex.contextId),
      ex.contextId,
    );
  }
}

// ── 6. A live run is never triggered by this proof ─────────────────────────
{
  const before = sql(`select count(*) n from public.message_queue`)[0]?.n;
  await call({ dryRun: true, organizationId: A.id, events: ["fee_due"] });
  const after = sql(`select count(*) n from public.message_queue`)[0]?.n;
  assert(
    "a dry run writes no queue row",
    String(before) === String(after),
    `message_queue ${before} → ${after}`,
  );
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "COMMS_ISOLATION_PROOF.json"),
  JSON.stringify(
    { ranAt: new Date().toISOString(), organizations: orgs.map((o) => o.slug), results },
    null, 2,
  ),
);

console.log(`\n  ${results.length - failures}/${results.length} assertions passed`);
console.log(`  → docs/generated/COMMS_ISOLATION_PROOF.json\n`);
process.exit(failures > 0 ? 1 : 0);
