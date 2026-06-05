import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { attendanceDashboardService } from "../services";

/** Combined student + staff attendance snapshot for one date (realtime). */
export const useAttendanceDashboard = (date: string) =>
  useQuery({
    queryKey: queryKeys.attendance.dashboard(date),
    queryFn: () => attendanceDashboardService.snapshot(date),
  });
