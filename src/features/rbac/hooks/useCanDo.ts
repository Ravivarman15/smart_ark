import { useCallback } from "react";
import { useEffectiveActions } from "./useEffectiveActions";
import { isCatalogAction } from "../constants/actionCatalog";

/**
 * Primary boolean gate for action-level RBAC. Returns `(actionId) => boolean`.
 *
 * Default-permissive: unknown action ids (not in the catalog) return `true`.
 * Hiding things just because the catalog hasn't been updated would lock users
 * out of features the RBAC layer doesn't yet model — same posture as
 * `useSidebarAccess`.
 *
 * For consumers that need richer state (loading flag, multi-action checks),
 * use `useActionAccess`.
 */
export const useCanDo = () => {
  const { data, isLoading } = useEffectiveActions();

  const canDo = useCallback(
    (actionId?: string): boolean => {
      if (!actionId) return true;
      if (!isCatalogAction(actionId)) return true;
      const v = data.actions[actionId];
      return v === undefined ? true : v;
    },
    [data.actions]
  );

  return { canDo, isLoading };
};
