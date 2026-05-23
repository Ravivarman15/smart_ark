import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { financeAnalyticsService } from "../services";

export const useFinanceOverview = () =>
  useQuery({
    queryKey: queryKeys.finance.overview(),
    queryFn: () => financeAnalyticsService.overview(),
  });

export const useFinanceAnalytics = () =>
  useQuery({
    queryKey: queryKeys.finance.analytics("full"),
    queryFn: () => financeAnalyticsService.analytics(),
  });
