import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRolePermissions } from "./useRolePermissions";
import { useUserOverrides } from "./useUserOverrides";
import { deriveEffectivePermissions } from "../utils/effective";
import type { EffectivePermissions } from "../types/rbac.types";

interface Result {
  data: EffectivePermissions;
  isLoading: boolean;
}

/**
 * Resolved view of "what can this user see?" — combines the role's grants
 * with any per-user overrides, falling back to the catalog defaults.
 *
 * Returns a deterministic object even while loading (everything = true), so
 * the sidebar doesn't flash empty between auth-ready and rights-loaded.
 *
 * `useSidebarAccess` is a thin wrapper around this hook with boolean
 * convenience selectors.
 */
export const useEffectivePermissions = (): Result => {
  const { user } = useAuth();
  const role = user?.role;
  const profileId = user?.profileId;

  const rolePerms = useRolePermissions(role);
  const overrides = useUserOverrides(profileId);

  const data = useMemo(
    () =>
      deriveEffectivePermissions({
        role,
        rolePermissions: rolePerms.data ?? [],
        userOverrides: overrides.data ?? [],
      }),
    [role, rolePerms.data, overrides.data]
  );

  return {
    data,
    isLoading: rolePerms.isLoading || overrides.isLoading,
  };
};
