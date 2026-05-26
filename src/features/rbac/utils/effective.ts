// ──────────────────────────────────────────────────────────────────────────────
// Module/submodule helpers — backwards-compat shims that delegate to the
// centralized resolver.
//
// The original `deriveEffectivePermissions` computed its own module/submodule
// math. After the introduction of `src/features/rbac/resolver/rbacResolver.ts`
// that logic lives in one place — this file now just adapts the resolver's
// `EffectiveAccess` shape into the legacy `{ modules, submodules }` map that
// every existing consumer (matrix UI, sidebar hooks) was written against.
// ──────────────────────────────────────────────────────────────────────────────

import { MODULE_CATALOG } from "../constants/catalog";
import { resolveAccess } from "../resolver/rbacResolver";
import type {
  EffectivePermissions,
  RolePermission,
  UserPermissionOverride,
} from "../types/rbac.types";

interface Args {
  role: string | undefined;
  rolePermissions: RolePermission[];
  userOverrides?: UserPermissionOverride[];
}

export const deriveEffectivePermissions = (args: Args): EffectivePermissions => {
  const eff = resolveAccess({
    role: args.role,
    rolePermissions: args.rolePermissions,
    userOverrides: args.userOverrides ?? [],
    roleActions: [],
    userActionOverrides: [],
  });

  const modules: Record<string, boolean> = {};
  const submodules: Record<string, boolean> = {};
  for (const m of MODULE_CATALOG) {
    modules[m.id] = eff.modules[m.id]?.allowed ?? true;
    for (const s of m.submodules) {
      submodules[s.id] = eff.submodules[s.id]?.allowed ?? true;
    }
  }
  return { modules, submodules };
};

/** Pure helper used by the matrix UI to flip every submodule in a module. */
export const setAllSubmodulesForModule = (
  modules: Record<string, boolean>,
  submodules: Record<string, boolean>,
  moduleId: string,
  value: boolean
): { modules: Record<string, boolean>; submodules: Record<string, boolean> } => {
  const def = MODULE_CATALOG.find((m) => m.id === moduleId);
  if (!def) return { modules, submodules };
  const nextSubs = { ...submodules };
  for (const s of def.submodules) nextSubs[s.id] = value;
  return { modules: { ...modules, [moduleId]: value }, submodules: nextSubs };
};
