// ──────────────────────────────────────────────────────────────────────────────
// useWhyAccess — diagnostics hook used by the "Why was this allowed/denied?"
// panel. Returns the full access trace for any module / submodule / action id,
// or a generic "unknown_permissive" explanation if the key isn't catalogued.
// ──────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { explain } from "../resolver/rbacResolver";
import type { AccessEntry } from "../resolver/types";
import { useEffectiveAccess } from "./useEffectiveAccess";

interface Why {
  entry: AccessEntry | undefined;
  summary: string;
}

export const useWhyAccess = () => {
  const { data, isLoading } = useEffectiveAccess();
  const why = useCallback(
    (key: string): Why => explain(data, key),
    [data]
  );
  return { why, access: data, isLoading };
};
