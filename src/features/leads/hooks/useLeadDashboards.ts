import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { leadDashboardService } from "../services/leadDashboard.service";

// `scope` is either a counselor profile id (personal view) or the literal
// "all" for an org-wide view (reassign-capable users). Passing undefined keeps
// the query disabled until the scope is known.
export const useCounselorDashboard = (scope: string | "all" | undefined) =>
  useQuery({
    queryKey: queryKeys.leads.counselorDashboard(scope ?? ""),
    queryFn: () => leadDashboardService.counselor(scope === "all" ? null : scope!),
    enabled: scope !== undefined,
  });

export const useManagementDashboard = () =>
  useQuery({
    queryKey: queryKeys.leads.managementDashboard(),
    queryFn: () => leadDashboardService.management(),
  });
