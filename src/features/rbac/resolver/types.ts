// ──────────────────────────────────────────────────────────────────────────────
// Centralized RBAC resolver — shared types
// ──────────────────────────────────────────────────────────────────────────────
// Every permission decision in the app flows through `rbacResolver` and is
// described by these shapes. The `AccessEntry` for a module / submodule /
// action carries not just the boolean outcome but also *why* it was reached,
// so the diagnostics panel ("Why was this allowed/denied?") can render the
// resolution trace without re-running the math.
// ──────────────────────────────────────────────────────────────────────────────

import type { Role } from "@/core/constants/roles";
import type {
  ActionRight,
  RolePermission,
  UserActionOverride,
  UserPermissionOverride,
} from "../types/rbac.types";

/**
 * Which layer of the resolver decided the outcome for a particular key.
 * Highest specificity wins — see `RESOLUTION_ORDER` in rbacResolver.ts.
 */
export type AccessSource =
  | "entitlement"         // the ORGANIZATION is not entitled to the module at all
  | "super_role"          // management bypass — every check returns allow
  | "user_override"       // per-user override row in rbac_user_*_overrides
  | "role_grant"          // per-role row in rbac_role_permissions / rbac_role_actions
  | "parent_submodule"    // action denied because its parent submodule is hidden
  | "catalog_default"     // module catalog says "default-visible for this role"
  | "legacy_action"       // legacy staff_action_rights fallback (only for catalog-unknown actions)
  | "legacy_module"       // legacy staff_rights fallback (only for catalog-unknown modules)
  | "unknown_permissive"  // key isn't in the catalog and no legacy gate exists — default allow
  | "no_role";            // unauthenticated / role missing

export interface AccessLayer {
  source: AccessSource;
  /** What this layer contributed — true=allow, false=deny, null=did not decide. */
  outcome: boolean | null;
  /** Free-form note used by the diagnostics panel. */
  note?: string;
}

export interface AccessEntry {
  /** Final boolean — the value gates consult. */
  allowed: boolean;
  /** Which layer was the deciding factor. */
  source: AccessSource;
  /** Ordered trace from most-specific to least-specific layer. */
  layers: AccessLayer[];
}

export interface EffectiveAccess {
  role: Role | string | undefined;
  isSuper: boolean;
  /** Module id → final access entry. */
  modules: Record<string, AccessEntry>;
  /** Submodule id (e.g. "fee.collection") → final access entry. */
  submodules: Record<string, AccessEntry>;
  /** Action id (e.g. "student.create") → final access entry. */
  actions: Record<string, AccessEntry>;
}

export interface ResolverInput {
  role: Role | string | undefined;
  rolePermissions: RolePermission[];
  userOverrides: UserPermissionOverride[];
  roleActions: ActionRight[];
  userActionOverrides: UserActionOverride[];
  /** Legacy `staff_rights` snapshot (module_name → can_view). */
  legacyModules?: Record<string, boolean>;
  /** Legacy `staff_action_rights` snapshot (action_key → is_allowed). */
  legacyActions?: Record<string, boolean>;
  /**
   * Module id → is the ORGANIZATION entitled to it, from the platform control
   * plane (plan + Super Admin override + lifecycle status).
   *
   * A different question from every other input here. The rest of this shape
   * asks "may this PERSON see it"; this asks "did this SCHOOL buy it". A
   * commercial answer outranks a permission answer, so an absent entitlement
   * denies even `management` — see the resolver's entitlement layer.
   *
   * OMITTED, or a module missing from the map, means "unknown", which is
   * treated as allowed. Fail-open is deliberate: a transient RPC failure must
   * not black out a paying customer's entire portal.
   */
  moduleEntitlements?: Record<string, boolean>;
}
