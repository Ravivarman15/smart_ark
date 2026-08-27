// ──────────────────────────────────────────────────────────────────────────────
// MODULE DEPENDENCY GRAPH + MINIMAL ENTITLEMENT RESOLUTION — server side.
//
// ┌── WHY A MIRROR, AND WHY IT IS SAFE ────────────────────────────────────┐
// │ The planner in src/features/platform/modules/bulkPlan.ts computes what │
// │ a grant or revoke would do, and the confirmation dialog shows it. That │
// │ is a PREVIEW. A dependency check that exists only in the browser is    │
// │ advice — anyone can POST to the edge function directly and skip it.    │
// │                                                                        │
// │ Deno cannot import from src/, so the graph is mirrored here, exactly   │
// │ as templateParams.ts is mirrored into send-aisensy. The duplication is │
// │ gated: moduleGraphMirror.test.ts reads BOTH files and fails the build  │
// │ if the dependency edges or the resolution order drift apart.           │
// └────────────────────────────────────────────────────────────────────────┘
//
// KEEP IN LOCKSTEP with src/features/platform/modules/moduleRegistry.ts
// (MODULE_METADATA.dependsOn / essential) and entitlements.ts (precedence).
// ──────────────────────────────────────────────────────────────────────────────

/** module → modules that must stay on for it to work. */
export const MODULE_DEPENDS_ON: Record<string, string[]> = {
  student: [],
  staff_user: [],
  settings: [],
  authentication: [],
  setup: [],
  attendance: ["student"],
  academics: ["staff_user"],
  exam: ["student"],
  live_class: ["student"],
  estudy: ["student"],
  certificate: ["student"],
  fee: ["student"],
  payroll: ["staff_user"],
  expense_income: [],
  whatsapp: [],
  enquiry_leads: [],
  tasks: ["staff_user"],
  reports: [],
  help: [],
  // The parent-facing portal. Sold per plan; depends on Students because every
  // page in it is a view of one child's record.
  parent_portal: ["student"],
  announcements: [],
};

/** Core modules — never revocable, at any layer. */
export const ESSENTIAL_MODULES = new Set([
  "student", "staff_user", "settings", "authentication",
]);

/** Modules that may ever be offered to an institution. */
export const NON_CUSTOMER_MODULES = new Set<string>([]);

/** module → modules that would break if it were switched off. */
export const MODULE_REQUIRED_BY: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [mod, deps] of Object.entries(MODULE_DEPENDS_ON)) {
    for (const d of deps) (out[d] ??= []).push(mod);
  }
  return out;
})();

// ── Minimal entitlement resolution ───────────────────────────────────────────
//
// Answers ONE question — "is module X on for this organization right now?" —
// and nothing else. It is not a second resolver: there is no `explain`, no
// source, no expiry formatting, because the guard does not need them and every
// extra field is another thing that can disagree with the real resolver.
//
// The PRECEDENCE, however, is identical, and the mirror gate asserts it.

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
const HOLD_ALLOWED = new Set([
  "settings", "authentication", "staff_user", "student", "fee", "reports", "help",
]);
const SUSPENDED_ALLOWED = new Set(["settings", "authentication", "fee", "help"]);

export interface Layers {
  status: string;
  governance?: Record<string, boolean>;
  plan?: Record<string, { enabled: boolean }>;
  overrides?: Record<string, { enabled: boolean; expires_at: string | null }>;
}

export const isModuleEnabled = (
  layers: Layers,
  moduleId: string,
  now: Date = new Date(),
): boolean => {
  if (NON_CUSTOMER_MODULES.has(moduleId)) return false;          // 0 audience
  if (layers.governance?.[moduleId] === false) return false;     // 1 governance

  const status = layers.status;                                   // 2 status
  if (!LIVE_STATUSES.has(status)) {
    if (status === "hold") { if (!HOLD_ALLOWED.has(moduleId)) return false; }
    else if (status === "suspended") { if (!SUSPENDED_ALLOWED.has(moduleId)) return false; }
    else return false;
  }

  if (ESSENTIAL_MODULES.has(moduleId)) return true;               // 3 essential

  const ov = layers.overrides?.[moduleId];                        // 4 override
  if (ov && (!ov.expires_at || new Date(ov.expires_at).getTime() > now.getTime())) {
    return ov.enabled;
  }

  const plan = layers.plan?.[moduleId];                           // 5 plan
  if (plan) return plan.enabled;

  return true;                                                    // 6 default
};

export interface DependencyRefusal {
  reason: string;
  modules: string[];
}

/**
 * May this module be revoked from an organization in this state?
 *
 * Returns the refusal, or null when the revoke is safe. Evaluated against the
 * organization's OWN resolved entitlements: revoking Students is safe for a
 * customer running neither Fees nor Exams, and refusing on the strength of some
 * other tenant's configuration would block a legitimate change.
 */
export const refuseRevoke = (
  layers: Layers,
  moduleId: string,
): DependencyRefusal | null => {
  if (ESSENTIAL_MODULES.has(moduleId)) {
    return {
      reason: `${moduleId} is a core module and cannot be revoked.`,
      modules: [],
    };
  }
  const dependants = (MODULE_REQUIRED_BY[moduleId] ?? []).filter((d) =>
    isModuleEnabled(layers, d),
  );
  if (dependants.length === 0) return null;
  return {
    reason:
      `${moduleId} is required by ${dependants.join(", ")}, which this organization ` +
      `currently uses. Revoke ${dependants.length === 1 ? "it" : "those"} first.`,
    modules: dependants,
  };
};
