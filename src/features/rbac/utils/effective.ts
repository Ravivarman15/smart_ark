// Pure permission math. NO React, NO Supabase, NO side effects.
//
// Resolution rules (in order):
//   1. user override (specific submodule) wins
//   2. user override (module-level, no submodule) applies to all that
//      module's submodules unless a more-specific user override exists
//   3. role grant (specific submodule)
//   4. role grant (module-level)
//   5. catalog default — module is visible if the user's role is listed in
//      `defaultRoles`, else hidden
//
// "Empty grants for this role" is treated as **permissive** (everything in
// the catalog is visible). This matches the legacy `StaffRightsContext`
// behaviour and avoids locking everyone out the moment the new system ships.

import type { Role } from "@/core/constants/roles";
import { MODULE_CATALOG } from "../constants/catalog";
import type {
  EffectivePermissions,
  RolePermission,
  UserPermissionOverride,
} from "../types/rbac.types";

interface Args {
  role: Role | string | undefined;
  rolePermissions: RolePermission[];
  userOverrides?: UserPermissionOverride[];
}

const isSuper = (role: Role | string | undefined) => role === "management";

export const deriveEffectivePermissions = (args: Args): EffectivePermissions => {
  const out: EffectivePermissions = { modules: {}, submodules: {} };

  // Super-role bypass — full visibility, no DB read needed.
  if (isSuper(args.role)) {
    for (const m of MODULE_CATALOG) {
      out.modules[m.id] = true;
      for (const s of m.submodules) out.submodules[s.id] = true;
    }
    return out;
  }

  // Index lookups so we hit O(1) per check.
  const roleByModule = new Map<string, boolean>();
  const roleBySubmodule = new Map<string, boolean>();
  for (const r of args.rolePermissions) {
    if (args.role && r.role !== args.role) continue;
    if (r.submoduleId) roleBySubmodule.set(r.submoduleId, r.canView);
    else roleByModule.set(r.moduleId, r.canView);
  }

  const userByModule = new Map<string, boolean>();
  const userBySubmodule = new Map<string, boolean>();
  for (const o of args.userOverrides ?? []) {
    if (o.submoduleId) userBySubmodule.set(o.submoduleId, o.canView);
    else userByModule.set(o.moduleId, o.canView);
  }

  const noGrantsForThisRole =
    roleByModule.size === 0 &&
    roleBySubmodule.size === 0 &&
    (args.userOverrides?.length ?? 0) === 0;

  for (const m of MODULE_CATALOG) {
    const defaultVisible =
      !args.role ||
      noGrantsForThisRole ||
      m.defaultRoles.includes(args.role as Role);

    const moduleVisible =
      userByModule.get(m.id) ??
      roleByModule.get(m.id) ??
      defaultVisible;

    out.modules[m.id] = moduleVisible;

    for (const s of m.submodules) {
      const subVisible =
        userBySubmodule.get(s.id) ??
        roleBySubmodule.get(s.id) ??
        // If the module is hidden, the submodule is hidden too — unless
        // an explicit override forces it visible (handled by the ?? above).
        (moduleVisible ? defaultVisible : false);
      out.submodules[s.id] = subVisible;
    }
  }

  return out;
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
