import { useMemo } from "react";
import { useEffectiveAccess } from "./useEffectiveAccess";
import type { EffectiveActions } from "../types/rbac.types";

interface Result {
  data: EffectiveActions;
  isLoading: boolean;
}

/**
 * Resolved per-user action map. Backward-compat wrapper around
 * `useEffectiveAccess` — kept so existing consumers like `useCanDo` /
 * `useActionAccess` continue to work without source changes. New code that
 * wants the resolution trace should use `useEffectiveAccess` directly.
 */
export const useEffectiveActions = (): Result => {
  const { data, isLoading } = useEffectiveAccess();

  const flat = useMemo<EffectiveActions>(() => {
    const actions: Record<string, boolean> = {};
    for (const [id, entry] of Object.entries(data.actions)) actions[id] = entry.allowed;
    return { actions };
  }, [data.actions]);

  return { data: flat, isLoading };
};
