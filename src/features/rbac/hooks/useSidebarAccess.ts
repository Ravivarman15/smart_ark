import { useCallback } from "react";
import { useEffectivePermissions } from "./useEffectivePermissions";

/**
 * Boolean selectors used by the sidebar / menu filter. Thin wrapper around
 * `useEffectivePermissions` — kept separate so the most common consumer
 * (NAV filter) gets a tight API.
 *
 * Both selectors return `true` when the module/submodule is missing from
 * the catalog. Hiding things just because the catalog doesn't know about
 * them would lock users out of features the RBAC layer doesn't yet model.
 */
export const useSidebarAccess = () => {
  const { data, isLoading } = useEffectivePermissions();

  const canViewModule = useCallback(
    (moduleId?: string): boolean => {
      if (!moduleId) return true;
      const v = data.modules[moduleId];
      return v === undefined ? true : v;
    },
    [data.modules]
  );

  const canViewSubmodule = useCallback(
    (submoduleId?: string): boolean => {
      if (!submoduleId) return true;
      const v = data.submodules[submoduleId];
      return v === undefined ? true : v;
    },
    [data.submodules]
  );

  return { canViewModule, canViewSubmodule, isLoading };
};
