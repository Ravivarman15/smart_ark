import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { reportAggregatorService } from "../services";

export const useReportLookups = () =>
  useQuery({
    queryKey: queryKeys.reports.aggregator("lookups"),
    queryFn: () => reportAggregatorService.lookups(),
    staleTime: 5 * 60 * 1000,
  });
