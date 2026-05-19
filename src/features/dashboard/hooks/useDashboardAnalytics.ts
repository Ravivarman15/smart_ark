import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { analyticsService } from "../services/analytics.service";
import type { DashboardAnalytics } from "../types/dashboard.types";

/**
 * Cross-cutting dashboard counters (students/enquiries/today attendance).
 * Default scope "all" — pass a campus key when per-campus filtering lands.
 */
export const useDashboardAnalytics = (scope = "all") =>
  useQuery<DashboardAnalytics>({
    queryKey: queryKeys.dashboard.analytics(scope),
    queryFn: () => analyticsService.dashboard(),
    staleTime: 60_000,
  });
