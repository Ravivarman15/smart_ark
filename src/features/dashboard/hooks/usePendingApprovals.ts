import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { analyticsService } from "../services/analytics.service";
import type { PendingApprovalsSummary } from "../types/dashboard.types";

/**
 * Counts every approval queue (admissions/leaves/check-ins/overrides) so a
 * single widget can show "5 things waiting on you". Short stale window —
 * approvals tend to be a "click then go look at the queue" workflow.
 */
export const usePendingApprovals = () =>
  useQuery<PendingApprovalsSummary>({
    queryKey: queryKeys.dashboard.approvals(),
    queryFn: () => analyticsService.pendingApprovals(),
    staleTime: 30_000,
  });
