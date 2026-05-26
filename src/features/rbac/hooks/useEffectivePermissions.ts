import { useMemo } from "react";
import { useEffectiveAccess } from "./useEffectiveAccess";
import type { EffectivePermissions } from "../types/rbac.types";

interface Result {
  data: EffectivePermissions;
  isLoading: boolean;
}

/**
 * Resolved view of "what can this user see?" — kept as a thin backward-compat
 * wrapper around `useEffectiveAccess`. New code should prefer `useEffectiveAccess`
 * directly when it needs the resolution trace; this hook is here so existing
 * callers that read `{ modules, submodules }` keep working unchanged.
 */
export const useEffectivePermissions = (): Result => {
  const { data, isLoading } = useEffectiveAccess();

  const flat = useMemo<EffectivePermissions>(() => {
    const modules: Record<string, boolean> = {};
    const submodules: Record<string, boolean> = {};
    for (const [id, entry] of Object.entries(data.modules)) modules[id] = entry.allowed;
    for (const [id, entry] of Object.entries(data.submodules)) submodules[id] = entry.allowed;
    return { modules, submodules };
  }, [data.modules, data.submodules]);

  return { data: flat, isLoading };
};
