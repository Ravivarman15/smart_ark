import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { financeAnalyticsService } from "../services/financeAnalytics.service";
import type { FinanceAnalytics } from "../types/dashboard.types";

/**
 * Finance roll-up powering today's income/expense KPIs and the 30-day series.
 * Heavier than other hooks (multiple table scans) — kept on a 2-minute stale
 * window because finance numbers rarely change second-to-second.
 */
export const useRevenueAnalytics = (scope = "all") =>
  useQuery<FinanceAnalytics>({
    queryKey: queryKeys.dashboard.finance(scope),
    queryFn: () => financeAnalyticsService.finance(),
    staleTime: 120_000,
  });
