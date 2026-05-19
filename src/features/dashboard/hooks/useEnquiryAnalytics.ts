import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { analyticsService } from "../services/analytics.service";
import type { EnquiryAnalytics } from "../types/dashboard.types";

export const useEnquiryAnalytics = (scope = "all") =>
  useQuery<EnquiryAnalytics>({
    queryKey: queryKeys.dashboard.enquiries(scope),
    queryFn: () => analyticsService.enquiries(),
    staleTime: 120_000,
  });
