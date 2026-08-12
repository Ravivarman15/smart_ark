// ──────────────────────────────────────────────────────────────────────────────
// ENTITLEMENT RESOLUTION — the one algorithm
//
// ┌── WHY THIS IS A PURE FUNCTION AND NOT A SQL VIEW ──────────────────────┐
// │ Two callers need the same answer:                                      │
// │                                                                        │
// │   • the TENANT's sidebar    — "may I see Payroll?"                     │
// │   • the PLATFORM console    — "does this customer have Payroll, and     │
// │                                why?"                                    │
// │                                                                        │
// │ Implementing that twice — once in SQL for tenants, once in TypeScript  │
// │ for the console — guarantees eventual drift, and the symptom is the    │
// │ worst kind of support call: the customer sees a module the platform    │
// │ believes they do not have (or the reverse), with no way to tell which  │
// │ side is wrong.                                                         │
// │                                                                        │
// │ So SQL returns raw LAYERS (entitlement_layers()) and this function is  │
// │ the only place precedence is decided. Pure, synchronous, no imports    │
// │ from React or Supabase — so it is exhaustively unit-testable, which is │
// │ the other half of the argument.                                        │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import type { ModuleId } from "@/features/rbac/constants/catalog";
import { MODULE_IDS, MODULE_METADATA } from "./moduleRegistry";

/** Which layer decided. Ordered most-authoritative first. */
export type EntitlementSource =
  | "global_governance"   // withdrawn platform-wide
  | "organization_status" // suspended / hold / archived
  | "override"            // explicit per-organization decision
  | "plan"                // the subscribed plan says so
  | "essential"           // core module, never revocable
  | "default";            // nothing said anything — included

export interface Entitlement {
  enabled: boolean;
  source: EntitlementSource;
  /** Human-readable, shown verbatim in the console. */
  explain: string;
  /** Set when the deciding layer was a temporary override. */
  expiresAt?: string | null;
  /** True when an override is actively contradicting the plan. */
  overridesPlan?: boolean;
}

export type EntitlementMap = Record<string, Entitlement>;

/** The shape `entitlement_layers(uuid)` returns. */
export interface EntitlementLayers {
  organization_id?: string;
  status: string;
  plan_code: string | null;
  plan_id: string | null;
  governance: Record<string, boolean>;
  plan: Record<string, { enabled: boolean; limit: number | null }>;
  overrides: Record<
    string,
    { enabled: boolean; reason: string; expires_at: string | null; updated_at: string }
  >;
  generated_at?: string;
}

// ── Status policy ─────────────────────────────────────────────────────────────
//
// A lifecycle state is a HARD gate above plan and override alike: an archived
// organization does not get Payroll back because someone left an override on it.

/** Statuses under which the product runs normally. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * What survives a HOLD.
 *
 * A hold is a commercial pause, not a punishment, and the customer is expected
 * back. Three things therefore stay reachable:
 *
 *   settings + authentication  they must be able to sign in and see why
 *   fee                        so they can settle what is owed
 *   reports                    so they can export their own records
 *
 * Taking export away from a customer you have just paused is how a billing
 * dispute becomes a data-hostage complaint.
 */
const HOLD_ALLOWED = new Set<string>([
  "settings", "authentication", "staff_user", "student", "fee", "reports", "help",
]);

/**
 * What survives a SUSPENSION.
 *
 * Narrower than a hold: enough to log in, understand the state, and pay.
 */
const SUSPENDED_ALLOWED = new Set<string>([
  "settings", "authentication", "fee", "help",
]);

const statusGate = (status: string, moduleId: string): Entitlement | null => {
  if (LIVE_STATUSES.has(status)) return null;

  if (status === "hold") {
    if (HOLD_ALLOWED.has(moduleId)) return null;
    return {
      enabled: false,
      source: "organization_status",
      explain: "Unavailable while the organization is on hold. Billing, export and sign-in remain open.",
    };
  }

  if (status === "suspended") {
    if (SUSPENDED_ALLOWED.has(moduleId)) return null;
    return {
      enabled: false,
      source: "organization_status",
      explain: "Unavailable while the organization is suspended. No data has been removed.",
    };
  }

  // archived | cancelled — closed, but nothing is deleted.
  return {
    enabled: false,
    source: "organization_status",
    explain: `Unavailable — the organization is ${status}. All records are retained.`,
  };
};

// ── The resolver ──────────────────────────────────────────────────────────────

/**
 * Resolve every module's entitlement from the raw layers.
 *
 * Precedence, most authoritative first:
 *
 *   1. global governance   a module withdrawn platform-wide is off everywhere
 *   2. organization status  suspended / hold / archived
 *   3. essential            core modules are never revocable
 *   4. override             an explicit, unexpired per-organization decision
 *   5. plan                 what the subscription includes
 *   6. default              nothing said anything → included
 *
 * Note the DEFAULT. Plans in this product differ by capacity and support, not
 * by withheld modules, so a plan that is silent about a module means "yes".
 * Defaulting to "no" would have switched every module off for every existing
 * customer the moment this shipped, because `plan_features` is sparsely
 * populated — a silent, total outage dressed up as a feature launch.
 */
export const resolveEntitlements = (
  layers: EntitlementLayers | null | undefined,
  now: Date = new Date(),
): EntitlementMap => {
  const out: EntitlementMap = {};
  if (!layers) return out;

  const nowMs = now.getTime();

  for (const id of MODULE_IDS) {
    // 1 ── global governance
    if (layers.governance?.[id] === false) {
      out[id] = {
        enabled: false,
        source: "global_governance",
        explain: "Withdrawn platform-wide by Smart ARK. No organization currently has this module.",
      };
      continue;
    }

    // 2 ── organization status
    const gate = statusGate(layers.status, id);
    if (gate) {
      out[id] = gate;
      continue;
    }

    const planRow = layers.plan?.[id];
    const planSaysEnabled = planRow ? planRow.enabled : true;

    // 3 ── essential
    if (MODULE_METADATA[id as ModuleId]?.essential) {
      out[id] = {
        enabled: true,
        source: "essential",
        explain: "Core module — always included, and cannot be revoked.",
      };
      continue;
    }

    // 4 ── override (expired rows are already stripped by entitlement_layers,
    //      but the check is repeated here so the pure function is correct on
    //      its own and can be tested without a database).
    const ov = layers.overrides?.[id];
    if (ov && (!ov.expires_at || new Date(ov.expires_at).getTime() > nowMs)) {
      out[id] = {
        enabled: ov.enabled,
        source: "override",
        expiresAt: ov.expires_at,
        overridesPlan: ov.enabled !== planSaysEnabled,
        explain: ov.expires_at
          ? `Super Admin override (${ov.reason}), expires ${ov.expires_at.slice(0, 10)}.`
          : `Super Admin override (${ov.reason}).`,
      };
      continue;
    }

    // 5 ── plan
    if (planRow) {
      out[id] = {
        enabled: planRow.enabled,
        source: "plan",
        explain: planRow.enabled
          ? `Included in the ${layers.plan_code ?? "current"} plan.`
          : `Not included in the ${layers.plan_code ?? "current"} plan.`,
      };
      continue;
    }

    // 6 ── default
    out[id] = {
      enabled: true,
      source: "default",
      explain: "Included by default — no plan rule or override applies.",
    };
  }

  return out;
};

/** Convenience: the set of enabled module ids, for the dependency checks. */
export const enabledSet = (map: EntitlementMap): Set<string> =>
  new Set(Object.entries(map).filter(([, v]) => v.enabled).map(([k]) => k));

/**
 * The tenant-side answer: module id → boolean.
 *
 * Deliberately returns a plain map rather than the rich entitlement — the
 * sidebar has no use for the explanation, and passing the reasons into the
 * tenant bundle would leak commercial detail ("not included in your plan")
 * into places that only asked whether to render a link.
 */
export const entitlementFlags = (map: EntitlementMap): Record<string, boolean> =>
  Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.enabled]));
