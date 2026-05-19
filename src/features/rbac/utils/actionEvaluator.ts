// Pure action-rights resolution. NO React, NO Supabase.
//
// Layered resolution (most specific wins):
//   1. user override (boolean)
//   2. role grant (boolean)
//   3. parent submodule visibility — if the user can't see the submodule,
//      they can't perform actions inside it
//   4. catalog default (allow)
//
// Symmetry with `deriveEffectivePermissions` (module/submodule layer) is
// intentional — same shape, same semantics, easier to reason about.

import type { Role } from "@/core/constants/roles";
import { ACTION_CATALOG, ACTIONS_BY_ID } from "../constants/actionCatalog";
import type {
  ActionRight,
  EffectiveActions,
  EffectivePermissions,
  UserActionOverride,
} from "../types/rbac.types";

interface Args {
  role: Role | string | undefined;
  /** Pre-resolved module/submodule visibility (from deriveEffectivePermissions). */
  modulePermissions?: EffectivePermissions;
  roleActions: ActionRight[];
  userOverrides?: UserActionOverride[];
}

const isSuper = (role: Role | string | undefined) => role === "management";

export const deriveEffectiveActions = (args: Args): EffectiveActions => {
  const actions: Record<string, boolean> = {};

  // Super-role bypass — full access without DB reads.
  if (isSuper(args.role)) {
    for (const a of ACTION_CATALOG) actions[a.id] = true;
    return { actions };
  }

  // Index lookups for O(1) per check.
  const byRole = new Map<string, boolean>();
  for (const r of args.roleActions) {
    if (args.role && r.role !== args.role) continue;
    byRole.set(r.actionId, r.isAllowed);
  }

  const byUser = new Map<string, boolean>();
  for (const o of args.userOverrides ?? []) {
    byUser.set(o.actionId, o.isAllowed);
  }

  for (const a of ACTION_CATALOG) {
    // Parent submodule visibility — when the submodule is hidden, the
    // action is also hidden unless an explicit grant brings it back.
    const submoduleVisible =
      args.modulePermissions?.submodules[a.submoduleId] ?? true;

    const allowed =
      byUser.get(a.id) ??
      byRole.get(a.id) ??
      // Default: follow the submodule's visibility. If management hasn't
      // configured anything, an action inside a visible submodule is allowed.
      submoduleVisible;

    actions[a.id] = allowed;
  }

  return { actions };
};

/** Pure helper for the matrix UI — flip every action in a category. */
export const setAllForCategory = (
  current: Record<string, boolean>,
  category: string,
  value: boolean
): Record<string, boolean> => {
  const next = { ...current };
  for (const a of ACTION_CATALOG) {
    if (a.category === category) next[a.id] = value;
  }
  return next;
};

/** Pure helper — flip every action under a submodule. */
export const setAllForSubmodule = (
  current: Record<string, boolean>,
  submoduleId: string,
  value: boolean
): Record<string, boolean> => {
  const next = { ...current };
  for (const a of ACTION_CATALOG) {
    if (a.submoduleId === submoduleId) next[a.id] = value;
  }
  return next;
};

void ACTIONS_BY_ID; // referenced indirectly; export kept for downstream consumers
