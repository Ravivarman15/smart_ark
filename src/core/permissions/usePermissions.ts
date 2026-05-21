import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffRights } from "@/contexts/StaffRightsContext";
import { useSidebarAccess, useCanDo, ACTIONS_BY_ID } from "@/features/rbac";
import { SUPER_ROLES, type Role } from "@/core/constants/roles";

// Single read-side API for "what can the current user do?"
// Components/pages must use this — never read role or rights raw.
//
// Layered backing (most specific wins):
//   1. RBAC v2 modules (rbac_role_permissions + rbac_user_permission_overrides)
//      — module / submodule visibility via useSidebarAccess.
//   2. RBAC v2 actions  (rbac_role_actions + rbac_user_action_overrides) —
//      fine-grained action gates via useCanDo.
//   3. Legacy StaffRightsContext (staff_rights + staff_action_rights) —
//      original action keys + module-key enum. Kept so existing checks like
//      `canDoAction("fee.collection")` keep working untouched.
//   4. Super-role bypass — management sees everything.
export const usePermissions = () => {
  const { user } = useAuth();
  const { canViewModule: legacyCanViewModule, canDoAction: legacyCanDoAction, loading: legacyLoading } = useStaffRights();
  const { canViewModule: rbacCanViewModule, canViewSubmodule: rbacCanViewSubmodule, isLoading: rbacSidebarLoading } =
    useSidebarAccess();
  const { canDo: rbacCanDoAction, isLoading: rbacActionLoading } = useCanDo();

  const isLoading = legacyLoading || rbacSidebarLoading || rbacActionLoading;

  return useMemo(() => {
    const role = user?.role as Role | undefined;
    const isSuper = !!role && SUPER_ROLES.includes(role);

    return {
      role,
      isSuper,
      isLoading,
      hasRole: (allowed: Role[]) => !!role && allowed.includes(role),
      /**
       * Module visibility. Accepts both legacy module keys (from
       * StaffRightsContext) and new catalog ids (from features/rbac).
       * The check is an AND: a module must pass both gates to be visible.
       */
      canViewModule: (key: Parameters<typeof legacyCanViewModule>[0]) =>
        isSuper || (legacyCanViewModule(key) && rbacCanViewModule(key as string)),
      /** Submodule check — new RBAC layer only. */
      canViewSubmodule: (key: string) => isSuper || rbacCanViewSubmodule(key),
      /**
       * Action gate. Both layers must agree:
       *   - If the action is in the new catalog AND has a legacyAction
       *     mapping, BOTH must allow it (AND).
       *   - If the action is in the new catalog only, the v2 layer decides.
       *   - If the key isn't in the catalog at all, fall back to the legacy
       *     check (preserves existing call sites like `fee.collection`).
       */
      canDoAction: (key: string) => {
        if (isSuper) return true;
        const def = ACTIONS_BY_ID[key];
        if (!def) return legacyCanDoAction(key);
        const v2 = rbacCanDoAction(key);
        const legacy = def.legacyAction ? legacyCanDoAction(def.legacyAction) : true;
        return v2 && legacy;
      },
    };
  }, [
    user?.role,
    legacyCanViewModule,
    legacyCanDoAction,
    rbacCanViewModule,
    rbacCanViewSubmodule,
    rbacCanDoAction,
    isLoading,
  ]);
};
