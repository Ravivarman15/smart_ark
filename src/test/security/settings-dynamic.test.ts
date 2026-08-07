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
/**
 * LINE comments first, THEN block comments — the order matters.
 *
 * The other way round, a `//` comment containing a glob path such as
 * "/settings/" followed by a star is read as a block-comment opener, and
 * everything up to the next block-comment terminator anywhere in the file is
 * deleted. That silently ate the imports and half the JSX of SettingsLayout,
 * so gates asserting on its content failed against a file that was correct.
 */
const stripComments = (s: string) =>
  s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

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

// ══════════════════════════════════════════════════════════════════════════════
// A NULL MUST NOT TAKE THE MODULE DOWN
//
// usage_status() emitted {"used": null} and BillingPage called
// .toLocaleString() on it, so the error boundary replaced the entire Settings
// module with "Something went wrong". A settings screen showing a dash is a
// blemish; a settings screen that will not render is an outage.
// ══════════════════════════════════════════════════════════════════════════════

describe("usage_status never emits a null count", () => {
  const MIGRATIONS = join(ROOT, "supabase", "migrations");
  const fix = read(join(MIGRATIONS, "20260911_phase5c_usage_status_null_fix.sql"));

  it("re-asserts the default after the CASE", () => {
    // `SELECT ... INTO` assigns NULL on ZERO ROWS — it does not leave the
    // variable alone. So `used := 0` before the CASE was silently discarded,
    // and COALESCE(u.used, 0) only ever guarded a null column in a row that
    // WAS found. usage_counters is empty, so this fired for storage_mb,
    // whatsapp and email on every organization.
    // Bounded to the LOOP body. The verification block further down quotes the
    // same string to assert it is installed, and an unbounded search found
    // that quote instead — so removing the real guard still passed. Caught by
    // mutation-testing this gate, not by reading it.
    const loop = fix.slice(
      fix.indexOf("FOREACH m IN ARRAY"),
      fix.indexOf("END LOOP"),
    );
    expect(loop.length, "loop body not located").toBeGreaterThan(200);

    const guard = loop.indexOf("used := COALESCE(used, 0)");
    const caseEnd = loop.indexOf("END CASE");
    expect(guard, "the null guard is missing from the loop body").toBeGreaterThan(-1);
    expect(guard, "the guard must come AFTER the CASE, not before").toBeGreaterThan(caseEnd);
  });

  it("is registered with the deploy runner, after 5A", () => {
    const runner = read(join(ROOT, "scripts", "deploy-migrations.mjs"));
    expect(runner).toContain("20260911_phase5c_usage_status_null_fix.sql");
    expect(runner.indexOf("20260825_phase5a_billing_core.sql"))
      .toBeLessThan(runner.indexOf("20260911_phase5c_usage_status_null_fix.sql"));
  });

  it("changes nothing but that function", () => {
    for (const pat of [/CREATE TABLE/i, /ALTER TABLE/i, /DROP /i, /DELETE FROM/i, /INSERT INTO/i]) {
      expect(pat.test(fix), `${pat} present in a fix-only migration`).toBe(false);
    }
  });
});

describe("Billing usage rendering tolerates a missing number", () => {
  const page = stripComments(
    read(join(ROOT, "src", "features", "billing", "pages", "BillingPage.tsx")),
  );

  it("guards every usage figure before formatting it", () => {
    // Per line, with a two-line lookback: the guarded form necessarily still
    // contains `u.used.toLocaleString`, so matching the call alone would flag
    // the fix as the bug — and the ternary wraps, putting the typeof check on
    // the line above its own call.
    const lines = page.split("\n");
    const unguarded = lines.filter((l, i) => {
      if (!/\bu\??\.(used|limit)\.toLocaleString/.test(l)) return false;
      const window = lines.slice(Math.max(0, i - 2), i + 1).join("\n");
      return !/typeof u\??\.(used|limit) === "number"/.test(window);
    });
    expect(
      unguarded.map((l) => l.trim()),
      `these crash the whole module on a null:\n${unguarded.join("\n")}`,
    ).toEqual([]);
    // And the guard must actually be present, so an empty usage block cannot
    // pass this vacuously.
    expect(page).toMatch(/typeof u\?\.used === "number"/);
  });
});

describe("Settings looks like every other module", () => {
  // Comments stripped: this file's header EXPLAINS the old standalone shell by
  // naming its "Back to dashboard" button, and an unstripped read would flag
  // the explanation as the defect.
  const layout = stripComments(read(join(SETTINGS, "pages", "SettingsLayout.tsx")));
  const nav = read(join(SETTINGS, "components", "SettingsSidebar.tsx"));
  const app = read(join(ROOT, "src", "App.tsx"));

  it("renders the same role sidebar the role layouts render", () => {
    // It used to be a standalone shell with its own top bar and a
    // "Back to dashboard" button — the only module where a user lost the app
    // navigation and needed a way back.
    expect(layout).toMatch(/import \{ RoleSidebar \} from "@\/shared\/layouts"/);
    expect(layout).toMatch(/<RoleSidebar/);
    expect(layout, "the back button existed only because navigation was missing")
      .not.toMatch(/Back to dashboard/);
  });

  it("uses the same mobile breakpoint and drawer as the role layouts", () => {
    const admin = read(join(ROOT, "src", "pages", "admin", "AdminLayout.tsx"));
    for (const marker of [
      "flex h-screen overflow-hidden bg-background",
      "hidden md:flex shrink-0",
      "md:hidden shrink-0 bg-sidebar border-b border-sidebar-border",
      "flex-1 overflow-y-auto p-4 md:p-6",
    ]) {
      expect(layout, `chrome differs from AdminLayout: ${marker}`).toContain(marker);
      expect(admin).toContain(marker);
    }
  });

  it("the settings sub-nav covers every route mounted under /settings", () => {
    // Billing and Branding had routes, RBAC submodules and menu entries but
    // were absent from this nav, so they were unreachable from inside
    // Settings. The two lists drifted silently; this stops it recurring.
    const block = app.slice(app.indexOf('path="/settings"'));
    const routes = [...block.slice(0, block.indexOf("</Route>")).matchAll(/path="([a-z-]+)"/g)]
      .map((m) => `/settings/${m[1]}`);
    expect(routes.length).toBeGreaterThan(8);

    const linked = [...nav.matchAll(/path: "(\/settings\/[a-z-]+)"/g)].map((m) => m[1]);
    const missing = routes.filter((r) => !linked.includes(r));
    expect(missing, `routes with no link in the settings nav: ${missing.join(", ")}`).toEqual([]);
  });

  it("every sub-nav item is RBAC-gated", () => {
    // Adding a link without a submodule id would show it to roles that cannot
    // open the page.
    const items = [...nav.matchAll(/path: "\/settings\/[a-z-]+",[^}]*/g)].map((m) => m[0]);
    expect(items.length).toBeGreaterThan(8);
    for (const item of items) {
      expect(item, `nav item has no submodule: ${item.slice(0, 60)}`).toMatch(/submodule: "settings\./);
    }
    expect(nav).toMatch(/canViewSubmodule\(s\.submodule\)/);
  });
});
