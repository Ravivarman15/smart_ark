import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { analyticsService } from "../services/analytics.service";
import type { StudentAttendanceAnalytics } from "../types/dashboard.types";

/** Today's institute-wide student attendance numbers. Live-refreshes when the
 *  student_attendance table mutates (see AttendanceRealtimeProvider — its
 *  invalidation hits queryKeys.dashboard.attendance). */
export const useStudentAttendanceAnalytics = () =>
  useQuery<StudentAttendanceAnalytics>({
    queryKey: queryKeys.dashboard.attendance("student-today"),
    queryFn: () => analyticsService.studentAttendance(),
    staleTime: 60_000,
  });
