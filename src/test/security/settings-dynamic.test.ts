import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS SUBMODULES READ REAL DATA
//
// Three of these pages rendered numbers that came from nowhere, and none of
// them looked broken — which is the whole problem:
//
//   • My Plan   returned a hardcoded "ARK Pro" with invented limits (50 staff,
//               2,000 students, 5,000 MB, 5,000 SMS) and a synthetic Jan-to-Jan
//               validity window. Every tenant saw ARK's fictional plan.
//   • SMS Plan  queried `sms_transactions`, a table that has never existed. The
//               error was swallowed, so it showed 0 balance / 0 usage / "no
//               activity" against 342 real messages — plus a permanent LOW
//               BALANCE warning, because 0 <= 100 always holds.
//   • Referral  read stored total columns that NO trigger maintains, so the
//               first real referral would show 0 beside a populated history.
//
// A page that displays a plausible wrong number is worse than one that errors.
// ══════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const SETTINGS = join(ROOT, "src", "features", "settings");
const read = (p: string) => readFileSync(p, "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("My Plan reflects the real subscription", () => {
  const svc = stripComments(read(join(SETTINGS, "services", "plan.service.ts")));

  it("reads the subscriptions and plans tables", () => {
    expect(svc).toMatch(/from\("subscriptions"/);
    expect(svc).toMatch(/plans\(/);
  });

  it("invents no plan name or limit", () => {
    for (const fiction of ["ARK Pro", "Unlimited students\"", "staffLimit: 50", "studentLimit: 2000"]) {
      expect(svc, `still hardcodes ${fiction}`).not.toContain(fiction);
    }
    // A literal number assigned to any limit field is a hardcoded entitlement.
    const limits = svc.match(/(staffLimit|studentLimit|storageLimitMb|smsLimit):\s*\d+/g) ?? [];
    expect(limits, `limits hardcoded: ${limits.join(", ")}`).toEqual([]);
  });

  it("distinguishes 'no subscription' from a fabricated one", () => {
    // An organization provisioned before billing was wired has no subscription
    // row. That is a real state and must be shown, not papered over.
    expect(svc).toMatch(/No active plan/);
  });

  it("treats past_due and grace as still working", () => {
    // These are subscriptions being chased for payment, not dead ones. Showing
    // "expired" would tell a paying institution their system is off.
    // Sliced rather than regex-matched: escaping a bracket-heavy pattern
    // through several layers is how a gate ends up matching nothing and
    // passing for the wrong reason.
    const setBody = (name: string) => {
      const start = svc.indexOf(`${name} = new Set([`);
      expect(start, `${name} set not found`).toBeGreaterThan(-1);
      return svc.slice(start, svc.indexOf("]", start));
    };
    const working = setBody("WORKING");
    expect(working).toContain("active");
    expect(working).toContain("past_due");
    expect(working).toContain("grace");

    const ended = setBody("ENDED");
    expect(ended, "a suspended subscription is not still working").toContain("suspended");
    expect(ended, "past_due is not an ended subscription").not.toContain("past_due");
  });

  it("does not confuse unlimited with zero", () => {
    // plans models NULL as unlimited. Coercing that to 0 would tell an
    // Enterprise customer they may have no students.
    expect(svc).toMatch(/=== null \|\| v === undefined \? undefined : Number\(v\)/);
  });
});

describe("SMS Plan counts real messages", () => {
  const svc = stripComments(read(join(SETTINGS, "services", "smsPlan.service.ts")));
  const page = stripComments(read(join(SETTINGS, "pages", "SmsPlanPage.tsx")));

  it("no longer queries a table that does not exist", () => {
    expect(svc, "sms_transactions has never existed in this database")
      .not.toContain("sms_transactions");
  });

  it("counts from message_queue", () => {
    expect(svc).toMatch(/from\("message_queue"/);
    expect(svc).toMatch(/count: "exact", head: true/);
  });

  it("a failed count is raised, never reported as zero usage", () => {
    // The old version swallowed the error and rendered 0. This is the exact
    // line that stops a read failure from looking like an idle month.
    expect(svc).toMatch(/if \(error\) throw error;/);
    expect(page).toMatch(/read error, not zero usage/);
  });

  it("excludes cancelled messages from consumption", () => {
    const billable = svc.match(/BILLABLE\s*=\s*\[([^\]]*)\]/)?.[1] ?? "";
    expect(billable).toContain("sent");
    expect(billable, "a cancelled message consumed no allowance").not.toContain("cancelled");
    expect(billable, "a failed message consumed no allowance").not.toContain("failed");
  });

  it("warns on a real threshold, not on an always-true one", () => {
    // The old page warned whenever balance <= 100, and balance was always 0.
    expect(page).toMatch(/c\.allowance !== undefined && c\.allowance > 0/);
    expect(page).not.toMatch(/lowBalanceThreshold/);
  });
});

describe("Referral totals are derived, not trusted", () => {
  const svc = stripComments(read(join(SETTINGS, "services", "referral.service.ts")));

  it("computes totals from the events table", () => {
    // settings_referrals.total_* are stored columns with no trigger behind
    // them — confirmed against the live database.
    expect(svc).toMatch(/derivedTotals/);
    expect(svc).toMatch(/from\("settings_referral_events"/);
  });

  it("the summary overrides the stored totals", () => {
    expect(svc).toMatch(/\.\.\.row,\s*\.\.\.\(await this\.derivedTotals/);
  });

  it("counts only what has actually been credited", () => {
    expect(svc).toMatch(/status === "credited"/);
    expect(svc).toMatch(/status !== "reversed"/);
  });
});

describe("No settings service ships fabricated data", () => {
  const services = readdirSync(join(SETTINGS, "services"))
    .filter((f) => f.endsWith(".service.ts"))
    .map((f) => join(SETTINGS, "services", f));

  it("none returns a hardcoded plan, balance or usage figure", () => {
    // Generic sweep: a literal assigned to a field whose name means "how much
    // does this customer have or get" is a fabricated number by definition.
    const suspicious = /\b(planName|balance|lifetimeUsage|monthlyUsage|staffLimit|studentLimit|smsLimit|storageLimitMb):\s*(\d+|"(?!No active plan)[^"]+")/g;
    const offenders: string[] = [];
    for (const f of services) {
      for (const m of stripComments(read(f)).matchAll(suspicious)) {
        offenders.push(`${f.replace(ROOT, "")}: ${m[0]}`);
      }
    }
    expect(offenders, `fabricated values:\n${offenders.join("\n")}`).toEqual([]);
  });
});
