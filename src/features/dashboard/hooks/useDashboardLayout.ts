import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { dashboardService } from "../services/dashboard.service";
import type { DashboardLayout } from "../types/dashboard.types";

/**
 * Reads the DB-backed per-scope layout. Returns `null` when the table is
 * missing or the scope has no saved layout — the consumer falls back to the
 * registry defaults in that case.
 */
export const useDashboardLayout = (scope: string) =>
  useQuery<DashboardLayout | null>({
    queryKey: queryKeys.dashboard.layout(scope),
    queryFn: () => dashboardService.getLayout(scope),
    staleTime: 5 * 60_000,
  });

export const useSaveDashboardLayout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (layout: DashboardLayout) => dashboardService.saveLayout(layout),
    onSuccess: (_v, layout) => {
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.layout(layout.scope) });
    },
  });
};
