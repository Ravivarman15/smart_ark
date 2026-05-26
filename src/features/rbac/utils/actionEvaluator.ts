// ──────────────────────────────────────────────────────────────────────────────
// Action-rights helpers — backwards-compat shims that delegate to the
// centralized resolver.
//
// Same story as utils/effective.ts: the original `deriveEffectiveActions`
// computed action visibility itself. After the resolver landed in
// `src/features/rbac/resolver/rbacResolver.ts`, the math lives there and this
// file just exposes the legacy `{ actions }` shape consumers were written for.
// ──────────────────────────────────────────────────────────────────────────────

import { ACTION_CATALOG } from "../constants/actionCatalog";
import { resolveAccess } from "../resolver/rbacResolver";
import type {
  ActionRight,
  EffectiveActions,
  EffectivePermissions,
  UserActionOverride,
} from "../types/rbac.types";

interface Args {
  role: string | undefined;
  /**
   * Optional pre-resolved module/submodule visibility map. The resolver
   * derives this internally from `rolePermissions`/`userOverrides` if you
   * don't pass it — but the matrix UI hands us the matrix's *draft* visibility
   * so the action preview matches what the editor sees on screen.
   */
  modulePermissions?: EffectivePermissions;
  roleActions: ActionRight[];
  userOverrides?: UserActionOverride[];
}

export const deriveEffectiveActions = (args: Args): EffectiveActions => {
  // Convert the optional pre-resolved module/submodule map back into
  // synthetic role-permission rows so the resolver gives the same answer
  // a consumer would have got by passing the raw rows.
  const synth = synthesizeRolePermissions(args.role, args.modulePermissions);

  const eff = resolveAccess({
    role: args.role,
    rolePermissions: synth,
    userOverrides: [],
    roleActions: args.roleActions,
    userActionOverrides: args.userOverrides ?? [],
  });

  const actions: Record<string, boolean> = {};
  for (const a of ACTION_CATALOG) {
    actions[a.id] = eff.actions[a.id]?.allowed ?? true;
  }
  return { actions };
};

const synthesizeRolePermissions = (
  role: string | undefined,
  modulePerms: EffectivePermissions | undefined
) => {
  if (!modulePerms || !role) return [];
  const rows: ActionRight[] = []; // placeholder typing — same shape works
  // We don't actually need full role permissions; the resolver only uses the
  // module/submodule visibility to gate actions. We achieve the same effect
  // by constructing synthetic `RolePermission` rows from the visibility map.
  const out: import("../types/rbac.types").RolePermission[] = [];
  for (const [moduleId, visible] of Object.entries(modulePerms.modules)) {
    out.push({
      id: `synthetic:${moduleId}`,
      role,
      moduleId,
      canView: visible,
    });
  }
  for (const [submoduleId, visible] of Object.entries(modulePerms.submodules)) {
    out.push({
      id: `synthetic:${submoduleId}`,
      role,
      moduleId: submoduleId.split(".")[0] ?? submoduleId,
      submoduleId,
      canView: visible,
    });
  }
  void rows;
  return out;
};

/** Pure helper used by the matrix UI — flip every action in a category. */
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
