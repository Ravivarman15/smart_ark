import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { leadDashboardService } from "../services/leadDashboard.service";

export const useCounselorDashboard = (counselorId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.leads.counselorDashboard(counselorId ?? ""),
    queryFn: () => leadDashboardService.counselor(counselorId!),
    enabled: !!counselorId,
  });

export const useManagementDashboard = () =>
  useQuery({
    queryKey: queryKeys.leads.managementDashboard(),
    queryFn: () => leadDashboardService.management(),
  });
