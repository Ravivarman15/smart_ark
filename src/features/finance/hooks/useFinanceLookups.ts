import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { financeLookupsService } from "../services";

export const useFinanceLookups = () =>
  useQuery({
    queryKey: queryKeys.finance.lookups("all"),
    queryFn: () => financeLookupsService.all(),
    staleTime: 5 * 60 * 1000,
  });
