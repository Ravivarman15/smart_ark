// ──────────────────────────────────────────────────────────────────────────────
// useEffectiveAccess — single React-facing entry point for the resolver.
//
// All other gates (useSidebarAccess, useCanDo, useActionAccess) ultimately
// wire through this hook. It pulls every layer (role grants, user overrides,
// role actions, user action overrides, legacy module/action snapshots) and
// hands them to the pure resolver — so any UI subscribing here re-renders
// when permissions change in realtime without manual cache plumbing.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffRights } from "@/contexts/StaffRightsContext";
import { resolveAccess } from "../resolver/rbacResolver";
import type { EffectiveAccess } from "../resolver/types";
import { useRolePermissions } from "./useRolePermissions";
import { useUserOverrides } from "./useUserOverrides";
import { useActionRights } from "./useActionRights";
import { useUserActionOverrides } from "./useUserActionOverrides";

interface Result {
  data: EffectiveAccess;
  isLoading: boolean;
}

const emptyAccess = (role: string | undefined): EffectiveAccess => ({
  role,
  isSuper: role === "management",
  modules: {},
  submodules: {},
  actions: {},
});

export const useEffectiveAccess = (): Result => {
  const { user } = useAuth();
  const role = user?.role;
  const profileId = user?.profileId;

  const rolePerms = useRolePermissions(role);
  const userOverrides = useUserOverrides(profileId);
  const roleActions = useActionRights(role);
  const userActionOverrides = useUserActionOverrides(profileId);
  const legacy = useStaffRights();

  const data = useMemo(() => {
    if (!role) return emptyAccess(role);
    return resolveAccess({
      role,
      rolePermissions: rolePerms.data ?? [],
      userOverrides: userOverrides.data ?? [],
      roleActions: roleActions.data ?? [],
      userActionOverrides: userActionOverrides.data ?? [],
      legacyModules: legacy.moduleRights,
      legacyActions: legacy.actionRights,
    });
  }, [
    role,
    rolePerms.data,
    userOverrides.data,
    roleActions.data,
    userActionOverrides.data,
    legacy.moduleRights,
    legacy.actionRights,
  ]);

  const isLoading =
    rolePerms.isLoading ||
    userOverrides.isLoading ||
    roleActions.isLoading ||
    userActionOverrides.isLoading ||
    legacy.loading;

  return { data, isLoading };
};
