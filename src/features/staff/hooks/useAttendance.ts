import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { attendanceService } from "../services/attendance.service";
import type { ApprovalArgs } from "../types/staff.types";

interface ListArgs {
  fromDate?: string;
  toDate?: string;
  staffIds?: string[];
}

/** Historical attendance log. Filterable by date range / staff set. */
export const useAttendance = (args: ListArgs = {}) =>
  useQuery({
    queryKey: ["staff", "attendance", args],
    queryFn: () => attendanceService.list(args),
  });

interface CheckArgs {
  staffId: string;
  date: string;
  geoValid: boolean;
}

/**
 * Check-in. Not optimistic — the row must be in the DB before UI shows
 * "checked in" (a phantom green badge for a failed write is worse than
 * a 200ms delay).
 */
export const useCheckIn = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, CheckArgs>({
    mutationFn: ({ staffId, date, geoValid }) => attendanceService.checkIn(staffId, date, geoValid),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      qc.invalidateQueries({
        queryKey: queryKeys.attendance.teacherDay(vars.staffId, vars.date),
      });
    },
  });
};

export const useCheckOut = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, CheckArgs>({
    mutationFn: ({ staffId, date, geoValid }) => attendanceService.checkOut(staffId, date, geoValid),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      qc.invalidateQueries({
        queryKey: queryKeys.attendance.teacherDay(vars.staffId, vars.date),
      });
    },
  });
};

export const useApproveCheckIn = () => {
  const qc = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof attendanceService.approveCheckIn>>, Error, ApprovalArgs>({
    mutationFn: (args) => attendanceService.approveCheckIn(args),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      qc.invalidateQueries({
        queryKey: queryKeys.attendance.teacherDay(vars.staffId, vars.date),
      });
    },
  });
};

export const useApproveCheckOut = () => {
  const qc = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof attendanceService.approveCheckOut>>, Error, ApprovalArgs>({
    mutationFn: (args) => attendanceService.approveCheckOut(args),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      qc.invalidateQueries({
        queryKey: queryKeys.attendance.teacherDay(vars.staffId, vars.date),
      });
    },
  });
};
