import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { analyticsService } from "../services/analytics.service";
import type { AttendanceAnalytics } from "../types/dashboard.types";

export const useAttendanceAnalytics = (scope = "today") =>
  useQuery<AttendanceAnalytics>({
    queryKey: queryKeys.dashboard.attendance(scope),
    queryFn: () => analyticsService.attendance(),
    staleTime: 60_000,
  });
