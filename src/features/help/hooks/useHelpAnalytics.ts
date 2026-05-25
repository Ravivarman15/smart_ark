import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { helpAnalyticsService, type HelpAnalyticsScope } from "../services";

export const useHelpAnalytics = (
  scope: HelpAnalyticsScope = {},
  scopeKey = "overview",
) =>
  useQuery({
    queryKey: queryKeys.help.analytics(scopeKey, scope as Record<string, unknown>),
    queryFn: () => helpAnalyticsService.overview(scope),
    staleTime: 60_000,
  });
