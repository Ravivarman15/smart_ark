// ──────────────────────────────────────────────────────────────────────────────
// useRefreshAccess — force-invalidate every RBAC cache and refetch.
//
// The realtime layer (RbacRealtimeProvider) and the per-mutation invalidations
// inside useAssignRolePermissions / useAssignActionRights already handle
// 99% of cases. This hook exists as the manual escape hatch:
//
//   - Diagnostics page "Refresh access now" button.
//   - Role Center toolbar after a save, when the operator wants to confirm
//     the new state propagated to their own session.
//   - End-user "Refresh permissions" affordance in the sidebar footer.
//
// Returns { refresh, isPending } so the caller can render a spinner.
// ──────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CURRENT_PROFILE_QUERY_KEY } from "@/contexts/AuthContext";
import { useStaffRights } from "@/contexts/StaffRightsContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { rbacDebug } from "../utils/rbacDebug";

export const useRefreshAccess = () => {
  const qc = useQueryClient();
  const legacy = useStaffRights();
  const [isPending, setIsPending] = useState(false);

  const refresh = useCallback(async () => {
    setIsPending(true);
    try {
      // 1. Nuke every cached RBAC query so re-renders re-derive from network.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.rbac.all }),
        qc.invalidateQueries({ queryKey: queryKeys.permissions.all }),
        qc.invalidateQueries({ queryKey: CURRENT_PROFILE_QUERY_KEY }),
      ]);

      // 2. Refetch the active subscribers right now so the UI updates
      //    without waiting for a focus/visibility event.
      await qc.refetchQueries({ queryKey: queryKeys.rbac.all, type: "active" });

      // 3. Nudge the legacy StaffRightsContext too — it still backs catalog-
      //    unknown keys via the resolver's legacy fallback.
      legacy.refresh();

      rbacDebug("refetch", { source: "useRefreshAccess" });
    } finally {
      setIsPending(false);
    }
  }, [qc, legacy]);

  return { refresh, isPending };
};
