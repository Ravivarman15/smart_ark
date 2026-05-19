import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { planService } from "../services/plan.service";
import { smsPlanService } from "../services/smsPlan.service";

export const usePlanDetails = () =>
  useQuery({
    queryKey: queryKeys.settings.plan(),
    queryFn: () => planService.summary(),
    staleTime: 5 * 60_000,
  });

export const useSmsPlan = () =>
  useQuery({
    queryKey: queryKeys.settings.smsPlan(),
    queryFn: () => smsPlanService.summary(),
    staleTime: 60_000,
  });
