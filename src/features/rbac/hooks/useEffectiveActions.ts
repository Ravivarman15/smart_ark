import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useActionRights } from "./useActionRights";
import { useUserActionOverrides } from "./useUserActionOverrides";
import { useEffectivePermissions } from "./useEffectivePermissions";
import { deriveEffectiveActions } from "../utils/actionEvaluator";
import type { EffectiveActions } from "../types/rbac.types";

interface Result {
  data: EffectiveActions;
  isLoading: boolean;
}

/**
 * Resolved per-user "what actions can I perform?" map. Combines:
 *   1. user overrides
 *   2. role grants
 *   3. parent submodule visibility (from useEffectivePermissions)
 *   4. catalog default (allow)
 *
 * Returns a deterministic object even while loading (everything = true), so
 * consumers don't flash disabled buttons between auth-ready and rights-loaded.
 *
 * Use `useCanDo` for the common boolean-per-action case.
 */
export const useEffectiveActions = (): Result => {
  const { user } = useAuth();
  const role = user?.role;
  const profileId = user?.profileId;

  const roleActions = useActionRights(role);
  const overrides = useUserActionOverrides(profileId);
  const modulePerms = useEffectivePermissions();

  const data = useMemo(
    () =>
      deriveEffectiveActions({
        role,
        modulePermissions: modulePerms.data,
        roleActions: roleActions.data ?? [],
        userOverrides: overrides.data ?? [],
      }),
    [role, modulePerms.data, roleActions.data, overrides.data]
  );

  return {
    data,
    isLoading: roleActions.isLoading || overrides.isLoading || modulePerms.isLoading,
  };
};
