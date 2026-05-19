import { useMemo } from "react";
import { useEffectiveActions } from "./useEffectiveActions";
import { isCatalogAction } from "../constants/actionCatalog";

interface AccessResult {
  allowed: boolean;
  isLoading: boolean;
}

interface MultiAccessResult {
  allowed: Record<string, boolean>;
  /** True only if every requested action is allowed. */
  all: boolean;
  /** True if at least one requested action is allowed. */
  some: boolean;
  isLoading: boolean;
}

/**
 * Rich gate for a single action or a set of actions. Use when the consumer
 * needs the loading flag (to gray-out vs hide) or multi-action aggregation
 * (e.g. "show menu if user can do ANY of these"). For the common one-shot
 * boolean case, prefer `useCanDo`.
 *
 * Unknown action ids default to allowed — same posture as `useCanDo`.
 */
export function useActionAccess(actionId: string): AccessResult;
export function useActionAccess(actionIds: string[]): MultiAccessResult;
export function useActionAccess(
  input: string | string[]
): AccessResult | MultiAccessResult {
  const { data, isLoading } = useEffectiveActions();

  return useMemo(() => {
    if (typeof input === "string") {
      const v = !isCatalogAction(input) ? true : data.actions[input] ?? true;
      return { allowed: v, isLoading };
    }
    const allowed: Record<string, boolean> = {};
    for (const id of input) {
      allowed[id] = !isCatalogAction(id) ? true : data.actions[id] ?? true;
    }
    const values = Object.values(allowed);
    return {
      allowed,
      all: values.length > 0 && values.every(Boolean),
      some: values.some(Boolean),
      isLoading,
    };
  }, [input, data.actions, isLoading]);
}
