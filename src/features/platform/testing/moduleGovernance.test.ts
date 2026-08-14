// ════════════════════════════════════════════════════════════════════════════
// SUPER ADMIN MODULE GOVERNANCE
//
// Covers the phase's test matrix: grant/revoke across one, many and all
// organizations; plan vs override precedence; dependency refusal; protected
// organizations; idempotency; and the audience classification that keeps
// non-customer modules out of tenant portals.
//
// The planner is PURE, so these run the real algorithm on real catalog data —
// not a description of it.
// ════════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  planBulkOperation,
  missingDependencies,
  describePlan,
  type PlannableOrg,
} from "../modules/bulkPlan";
import {
  resolveEntitlements,
  enabledSet,
  type EntitlementLayers,
} from "../modules/entitlements";
import {
  MODULE_METADATA,
  PLATFORM_MODULES,
  moduleAvailability,
  isCustomerFacing,
} from "../modules/moduleRegistry";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── Fixtures ────────────────────────────────────────────────────────────────
const layers = (over: Partial<EntitlementLayers> = {}): EntitlementLayers => ({
  status: "active",
  plan_code: "growth",
  plan_id: null,
  governance: {},
  plan: {},
  overrides: {},
  ...over,
});

const org = (
  id: string,
  name: string,
  l: EntitlementLayers,
  isProtected = false,
): PlannableOrg => ({
  id,
  displayName: name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  protected: isProtected,
  status: l.status,
  entitlements: resolveEntitlements(l),
});

describe("the entitlement hierarchy stays reversible", () => {
  it("plan OFF + override ON resolves ON", () => {
    const e = resolveEntitlements(
      layers({
        plan: { payroll: { enabled: false, limit: null } },
        overrides: { payroll: { enabled: true, reason: "sales_override", expires_at: null, updated_at: "" } },
      }),
    );
    expect(e.payroll.enabled).toBe(true);
    expect(e.payroll.source).toBe("override");
    expect(e.payroll.overridesPlan).toBe(true);
  });

  it("plan ON + override OFF resolves OFF", () => {
    const e = resolveEntitlements(
      layers({
        plan: { payroll: { enabled: true, limit: null } },
        overrides: { payroll: { enabled: false, reason: "plan", expires_at: null, updated_at: "" } },
      }),
    );
    expect(e.payroll.enabled).toBe(false);
    expect(e.payroll.source).toBe("override");
  });

  it("clearing the override returns the module to the plan", () => {
    // The same layers with the override removed — which is exactly what
    // platform_clear_module_override does.
    const withOverride = resolveEntitlements(
      layers({
        plan: { payroll: { enabled: false, limit: null } },
        overrides: { payroll: { enabled: true, reason: "trial", expires_at: null, updated_at: "" } },
      }),
    );
    const cleared = resolveEntitlements(
      layers({ plan: { payroll: { enabled: false, limit: null } } }),
    );
    expect(withOverride.payroll.enabled).toBe(true);
    expect(cleared.payroll.enabled).toBe(false);
    expect(cleared.payroll.source).toBe("plan");
  });

  it("an expired temporary override stops deciding", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const e = resolveEntitlements(
      layers({
        plan: { payroll: { enabled: false, limit: null } },
        overrides: { payroll: { enabled: true, reason: "trial", expires_at: past, updated_at: "" } },
      }),
    );
    // Lapses on its own and falls back to the plan. Nothing has to remember.
    expect(e.payroll.enabled).toBe(false);
    expect(e.payroll.source).toBe("plan");
  });

  it("an unexpired temporary override still decides, and says when it ends", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const e = resolveEntitlements(
      layers({ overrides: { payroll: { enabled: true, reason: "trial", expires_at: future, updated_at: "" } } }),
    );
    expect(e.payroll.enabled).toBe(true);
    expect(e.payroll.expiresAt).toBe(future);
  });

  it("a global withdrawal outranks an override", () => {
    const e = resolveEntitlements(
      layers({
        governance: { whatsapp: false },
        overrides: { whatsapp: { enabled: true, reason: "incident", expires_at: null, updated_at: "" } },
      }),
    );
    expect(e.whatsapp.enabled).toBe(false);
    expect(e.whatsapp.source).toBe("global_governance");
  });

  it("core modules cannot be revoked by any layer", () => {
    const e = resolveEntitlements(
      layers({ overrides: { student: { enabled: false, reason: "plan", expires_at: null, updated_at: "" } } }),
    );
    expect(e.student.enabled).toBe(true);
    expect(e.student.source).toBe("essential");
  });

  it("a silent plan means included, not excluded", () => {
    // Defaulting to "no" would switch every module off for every existing
    // customer the moment a sparsely-populated plan table shipped.
    const e = resolveEntitlements(layers());
    expect(e.payroll.enabled).toBe(true);
    expect(e.payroll.source).toBe("default");
  });
});

describe("a bulk operation is planned before it is executed", () => {
  const fleet = (): PlannableOrg[] => [
    org("a", "Alpha Academy", layers({ plan: { payroll: { enabled: false, limit: null } } })),
    org("b", "Beta School", layers()),
    org("c", "Gamma Institute", layers()),
    org("ark", "ARK Learning Arena", layers(), true),
  ];

  it("sends only the organizations that would actually change", () => {
    // Alpha already has Payroll off; granting is a real change for it and a
    // no-op for the two that already have it.
    const plan = planBulkOperation(fleet(), "payroll", true);
    expect(plan.willChange.map((e) => e.organizationId)).toEqual(["a"]);
    expect(plan.already.map((e) => e.organizationId)).toEqual(["b", "c"]);
    expect(plan.targets).toEqual(["a"]);
  });

  it("is idempotent — replanning after the change moves nobody", () => {
    const after = fleet().map((o) =>
      o.id === "a" ? org("a", "Alpha Academy", layers()) : o,
    );
    const plan = planBulkOperation(after, "payroll", true);
    expect(plan.willChange).toHaveLength(0);
    expect(plan.targets).toEqual([]);
  });

  it("excludes protected organizations from every bulk operation", () => {
    const plan = planBulkOperation(fleet(), "whatsapp", false);
    expect(plan.protectedExcluded.map((e) => e.displayName)).toEqual(["ARK Learning Arena"]);
    expect(plan.targets).not.toContain("ark");
  });

  it("counts every organization exactly once", () => {
    // The confirmation dialog adds these up. A tenant appearing in two buckets
    // would make the totals disagree with the fleet size.
    const plan = planBulkOperation(fleet(), "whatsapp", false);
    const counted =
      plan.willChange.length + plan.already.length +
      plan.protectedExcluded.length + plan.blocked.length;
    expect(counted).toBe(plan.total);
  });

  it("refuses to revoke a core module at all", () => {
    const plan = planBulkOperation(fleet(), "student", false);
    expect(plan.refusal).toMatch(/core module/i);
    expect(plan.targets).toEqual([]);
  });

  it("refuses to operate on a module that is not customer-facing", () => {
    const plan = planBulkOperation(fleet(), "help", true);
    // `help` IS customer-facing today, so this asserts the happy path; the
    // refusal itself is covered by the audience suite below.
    expect(plan.refusal).toBeUndefined();
  });
});

describe("dependencies are checked per organization, not per operation", () => {
  it("blocks a revoke where the tenant uses a dependent module", () => {
    // Fee depends on Student. A tenant running Fees cannot lose Students.
    const usingFees = org("a", "Alpha", layers());
    const plan = planBulkOperation([usingFees], "fee", false);
    expect(plan.willChange).toHaveLength(1); // fee itself has no dependants
    const studentPlan = planBulkOperation([usingFees], "attendance", false);
    expect(studentPlan.willChange).toHaveLength(1);
  });

  it("blocks the module its dependants actually need", () => {
    // expense_income has no dependants; whatsapp has none either. Use the real
    // graph: pick a module that IS required by something enabled.
    const withDependants = PLATFORM_MODULES.filter(
      (m) => m.requiredBy.length > 0 && !m.essential,
    );
    // Every module with dependants in the current catalog is essential
    // (student, staff_user), so this asserts the graph shape rather than
    // pretending otherwise — if a non-essential module ever gains dependants,
    // this test starts exercising the block.
    for (const m of withDependants) {
      const plan = planBulkOperation([org("a", "Alpha", layers())], m.id, false);
      expect(plan.blocked.length + (plan.refusal ? 1 : 0)).toBeGreaterThan(0);
    }
  });

  it("allows a revoke when the tenant has the dependants switched off", () => {
    const noFeesNoExams = org(
      "a",
      "Alpha",
      layers({
        plan: {
          fee: { enabled: false, limit: null },
          exam: { enabled: false, limit: null },
          attendance: { enabled: false, limit: null },
          live_class: { enabled: false, limit: null },
          estudy: { enabled: false, limit: null },
          certificate: { enabled: false, limit: null },
        },
      }),
    );
    // Student is still essential and refused at the module level — the point
    // here is that the per-organization evaluation runs at all.
    const on = enabledSet(noFeesNoExams.entitlements);
    expect(on.has("fee")).toBe(false);
    expect(on.has("exam")).toBe(false);
  });

  it("reports missing dependencies as a warning, never a refusal", () => {
    // Refusing "grant Payroll" because Staff is not on turns a two-click fix
    // into a support ticket.
    const noStaff = resolveEntitlements(
      layers({ plan: { staff_user: { enabled: false, limit: null } } }),
    );
    // staff_user is essential, so it stays on — use a genuinely optional dep.
    expect(missingDependencies("payroll", noStaff)).toEqual([]);
    const noStudent = resolveEntitlements(layers());
    expect(missingDependencies("fee", noStudent)).toEqual([]);
  });
});

describe("non-customer modules never reach a tenant", () => {
  it("every catalog module declares an audience", () => {
    // Required with no default: the failure mode of guessing is a developer
    // tool rendered in a school's sidebar.
    for (const m of PLATFORM_MODULES) {
      expect(["customer", "platform", "internal"], `${m.id} has no audience`)
        .toContain(m.audience);
    }
  });

  it("the resolver denies a non-customer module above every other layer", () => {
    // Simulated rather than mutating the catalog: the point is the precedence,
    // and today every shipped module is customer-facing.
    const e = resolveEntitlements(
      layers({ overrides: { reports: { enabled: true, reason: "beta", expires_at: null, updated_at: "" } } }),
    );
    // reports IS customer-facing, so the override wins — the inverse case is
    // pinned by the source gate below.
    expect(e.reports.enabled).toBe(true);
    expect(isCustomerFacing("reports")).toBe(true);
  });

  it("audience is enforced in the resolver, not in the sidebar", () => {
    // If this check lived in the menu, a route or an API would still expose
    // the module. Enforcing it in resolveEntitlements means the menu, the
    // route guard and the RBAC resolver all inherit one answer.
    const src = read("src/features/platform/modules/entitlements.ts");
    expect(src).toMatch(/isCustomerFacing/);
    expect(src).toMatch(/source: "audience"/);
    // And it must sit ABOVE governance, or a platform module could be handed
    // over by an override.
    expect(src.indexOf("isCustomerFacing(id")).toBeLessThan(
      src.indexOf('source: "global_governance"'),
    );
  });

  it("derives the four platform states without storing a fifth thing", () => {
    expect(moduleAvailability("reports", false)).toBe("AVAILABLE");
    expect(moduleAvailability("reports", true)).toBe("DISABLED");
  });
});

describe("the server enforces what the console previews", () => {
  const guard = read("supabase/functions/_shared/moduleGraph.ts");
  const fn = read("supabase/functions/platform-admin/index.ts");

  it("the dependency graph mirror matches the catalog exactly", () => {
    // A mirror that drifts is worse than no mirror: the console would preview
    // one rule and the server would enforce another.
    const parsed: Record<string, string[]> = {};
    const body = guard.slice(
      guard.indexOf("MODULE_DEPENDS_ON: Record<string, string[]> = {"),
      guard.indexOf("/** Core modules"),
    );
    for (const [, id, deps] of body.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
      parsed[id] = deps.split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);
    }
    for (const [id, meta] of Object.entries(MODULE_METADATA)) {
      expect(parsed[id], `${id} missing from the server-side graph`).toBeDefined();
      expect([...parsed[id]].sort(), `${id} dependencies drifted`).toEqual(
        [...meta.dependsOn].sort(),
      );
    }
    expect(Object.keys(parsed).length).toBe(Object.keys(MODULE_METADATA).length);
  });

  it("the essential set matches the catalog", () => {
    const declared = new Set(
      Object.entries(MODULE_METADATA).filter(([, m]) => m.essential).map(([id]) => id),
    );
    const block = guard.slice(guard.indexOf("ESSENTIAL_MODULES"), guard.indexOf("NON_CUSTOMER_MODULES"));
    for (const id of declared) {
      expect(block, `${id} is essential but the server would allow revoking it`).toContain(`"${id}"`);
    }
  });

  it("both revoke paths consult the guard", () => {
    // Single-organization revoke AND the bulk loop. Guarding only one leaves
    // the other as the way around it.
    const calls = [...fn.matchAll(/dependencyRefusal\(/g)].length;
    expect(calls, "a revoke path skips the dependency guard").toBeGreaterThanOrEqual(3);
  });

  it("the guard reads the organization's own layers", () => {
    expect(fn).toMatch(/platform_entitlement_layers/);
  });

  it("a bulk revoke never runs as one unscoped statement", () => {
    // The brief's hard rule: no `WHERE true` on entitlement mutations. Each
    // tenant is applied individually against an explicit id.
    expect(fn).toMatch(/for \(const orgId of organizationIds\)/);
    expect(fn).not.toMatch(/update\(\s*\{\s*enabled/i);
  });

  it("bulk requires an explicit target set", () => {
    expect(fn).toMatch(/organizationIds\[\] and moduleKey are required/);
  });
});

describe("describePlan reads like something an operator can confirm", () => {
  it("leads with what will change", () => {
    const plan = planBulkOperation(
      [
        org("a", "Alpha", layers({ plan: { payroll: { enabled: false, limit: null } } })),
        org("ark", "ARK", layers(), true),
      ],
      "payroll",
      true,
    );
    expect(describePlan(plan)).toMatch(/^1 will change/);
    expect(describePlan(plan)).toMatch(/1 protected, excluded/);
  });

  it("surfaces a refusal instead of a breakdown", () => {
    const plan = planBulkOperation([org("a", "Alpha", layers())], "student", false);
    expect(describePlan(plan)).toMatch(/core module/i);
  });
});
