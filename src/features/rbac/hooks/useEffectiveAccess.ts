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
import { useModuleEntitlements } from "./useModuleEntitlements";

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
  const entitlements = useModuleEntitlements();

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
      moduleEntitlements: entitlements.data?.flags,
    });
  }, [
    role,
    rolePerms.data,
    userOverrides.data,
    roleActions.data,
    userActionOverrides.data,
    legacy.moduleRights,
    legacy.actionRights,
    entitlements.data,
  ]);

  // Entitlements are deliberately NOT part of `isLoading`. They fail open, so
  // a slow or failed entitlement lookup must not hold the whole permission
  // layer in a loading state — gates that block on `isLoading` would render a
  // spinner over a portal that is otherwise perfectly usable.
  const isLoading =
    rolePerms.isLoading ||
    userOverrides.isLoading ||
    roleActions.isLoading ||
    userActionOverrides.isLoading ||
    legacy.loading;

  return { data, isLoading };
};
