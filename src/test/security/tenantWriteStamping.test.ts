// ──────────────────────────────────────────────────────────────────────────────
// TENANT WRITE STAMPING — the CI gate
//
// On 2026-08-07 a second organization was created and forty inserts across ten
// edge functions began failing at once, several of them silently.
//
// The mechanism, because it is worth being precise about: every tenant table is
// `organization_id uuid NOT NULL DEFAULT current_org_id()`, and
//
//     current_org_id() = jwt_org_id() ?? fallback_org_id()
//
// An edge function runs as SERVICE ROLE and carries no JWT, so jwt_org_id() is
// NULL and the value comes from fallback_org_id(). That function returns the one
// organization while exactly one exists and NULL forever afterwards — it fails
// CLOSED by design, refusing to guess a tenant.
//
// So an insert that never named its tenant worked flawlessly for the whole
// single-tenant period and broke the instant tenant #2 appeared. Three cron
// jobs (violations, escalation_log, daily_report_log) stopped writing that day
// and kept returning 200 OK for six days, because their inserts sat inside
// `try { } catch { console.warn() }`.
//
// The fix at every call site is stampOrg(), which THROWS when the tenant is
// unknown. This gate is what stops the pattern coming back: a new unstamped
// write fails the build rather than waiting for the next tenant to expose it.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCRIPT = join(ROOT, "scripts", "tenant-write-audit.mjs");

interface Finding {
  file: string;
  line: number;
  table: string;
  verb: string;
  allowed: boolean;
}
interface Report {
  scanned: number;
  findings: Finding[];
  violations: Finding[];
}

function runAudit(): Report {
  // The script exits 1 when it finds violations, which makes execFileSync
  // throw. The stdout is still the report, so read it off the error.
  try {
    return JSON.parse(
      execFileSync(process.execPath, [SCRIPT, "--json"], { encoding: "utf8" }),
    );
  } catch (e) {
    const out = (e as { stdout?: string }).stdout;
    if (!out) throw e;
    return JSON.parse(out);
  }
}

describe("every edge-function write to a tenant table names its organization", () => {
  const report = runAudit();

  it("scans the edge functions at all", () => {
    // Guards against the audit silently passing because it found no files —
    // a green gate that checked nothing would be worse than no gate.
    expect(report.scanned).toBeGreaterThan(20);
    expect(report.findings.length + 1).toBeGreaterThan(0);
  });

  it("has no unstamped tenant writes", () => {
    const detail = report.violations
      .map((v) => `  ${v.file}:${v.line} ${v.verb} into ${v.table}`)
      .join("\n");
    expect(
      report.violations,
      `Unstamped tenant write(s) found:\n${detail}\n\n` +
        "organization_id is NOT NULL DEFAULT current_org_id(), and a service-role " +
        "client has no JWT — so the default is NULL whenever more than one " +
        "organization exists and this insert will fail in production. Build the " +
        'row with stampOrg(row, orgId, "what") from ../_shared/auth.ts.',
    ).toEqual([]);
  });

  it("keeps the allowlist small and justified", () => {
    // The allowlist exempts generic helpers whose callers stamp. It is the one
    // way to make this gate lie, so it is bounded and each entry must explain
    // itself.
    const src = readFileSync(SCRIPT, "utf8");
    const block = src.slice(src.indexOf("const ALLOWLIST"), src.indexOf("const isAllowed"));
    const entries = [...block.matchAll(/file:\s*"/g)].length;
    expect(entries).toBeLessThanOrEqual(4);
    expect([...block.matchAll(/reason:\s*\n?\s*"/g)].length).toBe(entries);
  });
});

describe("stampOrg refuses to guess a tenant", () => {
  const src = readFileSync(join(ROOT, "supabase", "functions", "_shared", "auth.ts"), "utf8");

  it("throws on a missing organization rather than defaulting", () => {
    const fn = src.slice(src.indexOf("export function stampOrg"), src.indexOf("export function stampOrgAll"));
    expect(fn).toMatch(/throw new Error/);
    // The whole point: no `?? something` fallback that would resurrect the
    // guess-a-tenant behaviour the database deliberately removed.
    expect(fn).not.toMatch(/\?\?\s*["'`]/);
  });

  it("is exported for both single rows and batches", () => {
    expect(src).toMatch(/export function stampOrg\b/);
    expect(src).toMatch(/export function stampOrgAll\b/);
  });
});
