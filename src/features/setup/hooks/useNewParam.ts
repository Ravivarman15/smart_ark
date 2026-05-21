import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Setup "Add X" menu links deep-link to a Manage page with `?new=1`. This
 * hook fires `onTrigger` exactly once on mount when the flag is present,
 * then strips it so a refresh doesn't reopen the form.
 */
export const useNewParam = (onTrigger: () => void) => {
  const [params, setParams] = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (params.get("new") === "1") {
      fired.current = true;
      onTrigger();
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
    // Run once on mount — onTrigger identity is intentionally ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
