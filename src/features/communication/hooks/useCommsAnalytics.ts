import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { commsAnalyticsService } from "../services";

export const useCommsAnalytics = (filter: { campaignId?: string; from?: string; to?: string } = {}) =>
  useQuery({
    queryKey: queryKeys.communication.analytics("overview", filter),
    queryFn: () => commsAnalyticsService.overview(filter),
    staleTime: 30_000,
  });
