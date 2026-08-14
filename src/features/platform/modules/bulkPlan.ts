// ──────────────────────────────────────────────────────────────────────────────
// BULK OPERATION PLANNER — decide what a grant/revoke would actually do, before
// it does it.
//
// ┌── WHY PLANNING IS A SEPARATE STEP ─────────────────────────────────────┐
// │ "Revoke Payroll from all organizations" is four different operations   │
// │ wearing one button:                                                     │
// │                                                                         │
// │   • organizations that would genuinely change                           │
// │   • organizations already in that state — writing them creates an       │
// │     override row that says nothing and is indistinguishable from a      │
// │     deliberate decision six months later                                │
// │   • protected organizations, which are excluded by policy               │
// │   • organizations where the change would strand a dependent module      │
// │                                                                         │
// │ Collapsing those into "24 organizations affected" is how an operator    │
// │ confirms something they did not mean. So the plan is computed first,    │
// │ shown, and only its `targets` are sent.                                 │
// └─────────────────────────────────────────────────────────────────────────┘
//
// PURE. No React, no Supabase — the confirmation dialog and the test suite run
// the same function on the same inputs, and the numbers an operator reads are
// by construction the numbers that will be executed.
//
// This is a PREVIEW, not the authorization. The edge function re-derives
// protection and dependency safety server-side; a planner that ran only in the
// browser would be advice, not a control.
// ──────────────────────────────────────────────────────────────────────────────

import type { ModuleId } from "@/features/rbac/constants/catalog";
import type { EntitlementMap } from "./entitlements";
import { enabledSet } from "./entitlements";
import {
  MODULE_METADATA,
  PLATFORM_MODULES_BY_ID,
  isCustomerFacing,
  moduleLabel,
} from "./moduleRegistry";

/** One organization as the planner needs to see it. */
export interface PlannableOrg {
  id: string;
  displayName: string;
  slug: string;
  /** `organization_protections.block_bulk` — ARK and anything like it. */
  protected: boolean;
  status: string;
  /** Already resolved through `resolveEntitlements`. */
  entitlements: EntitlementMap;
}

export type PlanOutcome =
  /** The operation would move this organization. Only these are sent. */
  | "will_change"
  /** Already in the requested state — sending it would write a no-op row. */
  | "already"
  /** Protected. Excluded from every bulk operation by policy. */
  | "protected"
  /** Refused: the change would break something this organization is using. */
  | "blocked";

export interface PlanEntry {
  organizationId: string;
  displayName: string;
  outcome: PlanOutcome;
  /** Present on `blocked`. Operator-facing, names what to do first. */
  reason?: string;
  /** Modules that caused a block, so the UI can list them. */
  modules?: ModuleId[];
}

export interface BulkPlan {
  module: ModuleId;
  enable: boolean;
  /** Every organization considered. */
  total: number;
  willChange: PlanEntry[];
  already: PlanEntry[];
  protectedExcluded: PlanEntry[];
  blocked: PlanEntry[];
  /**
   * The organization ids to actually send.
   *
   * Exactly `willChange`. Never "all of them and let the server sort it out" —
   * an unnecessary write is still a write, and it lands in the entitlement
   * history as a decision somebody made.
   */
  targets: string[];
  /**
   * Set when the module cannot be bulk-operated at all, whatever the
   * organizations look like. Rendered instead of the breakdown.
   */
  refusal?: string;
}

/**
 * Plan a grant or revoke of one module across a set of organizations.
 *
 * Order matters. Protection is checked before dependencies, because a protected
 * organization is excluded regardless of whether the change would have been
 * safe — reporting it as "blocked by dependencies" would send an operator to
 * fix the wrong thing.
 */
export const planBulkOperation = (
  orgs: readonly PlannableOrg[],
  module: ModuleId,
  enable: boolean,
): BulkPlan => {
  const base: BulkPlan = {
    module,
    enable,
    total: orgs.length,
    willChange: [],
    already: [],
    protectedExcluded: [],
    blocked: [],
    targets: [],
  };

  // ── Module-level refusals ───────────────────────────────────────────────
  // Checked once, not per organization: the answer cannot differ between them,
  // and reporting "23 blocked" for a fact about the module reads like a data
  // problem rather than a category error.
  if (!isCustomerFacing(module)) {
    return {
      ...base,
      refusal: `${moduleLabel(module)} is not a customer-facing module. It is never offered to institutions, so there is nothing to grant or revoke.`,
    };
  }
  if (!enable && MODULE_METADATA[module]?.essential) {
    return {
      ...base,
      refusal: `${moduleLabel(module)} is a core module and cannot be revoked. Every other module depends on it; switching it off would leave the portal unusable rather than cheaper.`,
    };
  }

  for (const org of orgs) {
    const entry = { organizationId: org.id, displayName: org.displayName };

    if (org.protected) {
      base.protectedExcluded.push({ ...entry, outcome: "protected" });
      continue;
    }

    const current = org.entitlements[module];
    const on = enabledSet(org.entitlements);

    // Already there. Deliberately compared on the RESOLVED state, not on the
    // presence of an override row: an organization whose plan already grants
    // the module does not need an override saying the same thing.
    if (current && current.enabled === enable) {
      base.already.push({ ...entry, outcome: "already" });
      continue;
    }

    // Dependency safety, evaluated against THIS organization's own state.
    // A module is only a blocker where it is actually switched on — revoking
    // Students is safe for a customer who has neither Fees nor Exams, and
    // refusing globally would block a legitimate change on the strength of a
    // different tenant's configuration.
    if (!enable) {
      const dependants = (PLATFORM_MODULES_BY_ID.get(module)?.requiredBy ?? []).filter((d) =>
        on.has(d),
      );
      if (dependants.length > 0) {
        base.blocked.push({
          ...entry,
          outcome: "blocked",
          modules: dependants,
          reason: `${moduleLabel(module)} is required by ${dependants
            .map(moduleLabel)
            .join(", ")}. Revoke ${dependants.length === 1 ? "that" : "those"} first.`,
        });
        continue;
      }
    }

    base.willChange.push({ ...entry, outcome: "will_change" });
  }

  base.targets = base.willChange.map((e) => e.organizationId);
  return base;
};

/**
 * Modules an organization would be missing if this one were granted.
 *
 * Enabling something incomplete is a warning, never a refusal: refusing "grant
 * Payroll" because the customer has not been given Staff yet turns a two-click
 * fix into a support ticket. The operator is told, and decides.
 */
export const missingDependencies = (
  module: ModuleId,
  entitlements: EntitlementMap,
): ModuleId[] => {
  const on = enabledSet(entitlements);
  return (MODULE_METADATA[module]?.dependsOn ?? []).filter((d) => !on.has(d));
};

/** One-line summary for the confirmation dialog. */
export const describePlan = (plan: BulkPlan): string => {
  if (plan.refusal) return plan.refusal;
  const bits = [`${plan.willChange.length} will change`];
  if (plan.already.length) bits.push(`${plan.already.length} already ${plan.enable ? "enabled" : "disabled"}`);
  if (plan.protectedExcluded.length) bits.push(`${plan.protectedExcluded.length} protected, excluded`);
  if (plan.blocked.length) bits.push(`${plan.blocked.length} blocked by dependencies`);
  return bits.join(" · ");
};
