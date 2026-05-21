import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { attendanceService } from "../services/attendance.service";
import type { AttendanceDraftRow } from "../types/student.types";

/** Roster + marks for one batch on one date. */
export const useAttendanceDay = (batchId: string | undefined, date: string) =>
  useQuery({
    queryKey: batchId
      ? queryKeys.students.attendanceDay(batchId, date)
      : ["students", "attendance-day", "noop"],
    queryFn: () => attendanceService.getDay(batchId as string, date),
    enabled: !!batchId,
  });

export const useSaveAttendance = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({
      batchId,
      date,
      rows,
    }: {
      batchId: string;
      date: string;
      rows: AttendanceDraftRow[];
    }) => attendanceService.saveDay(batchId, date, rows, user?.profileId),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.attendanceDay(args.batchId, args.date) });
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success("Attendance saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};

export const useAttendanceHistory = (studentId: string | undefined) =>
  useQuery({
    queryKey: studentId
      ? queryKeys.students.attendanceHistory(studentId)
      : ["students", "attendance-history", "noop"],
    queryFn: () => attendanceService.studentHistory(studentId as string),
    enabled: !!studentId,
  });

export const useBatchAttendanceAnalytics = (
  batchId: string | undefined,
  from: string,
  to: string
) =>
  useQuery({
    queryKey: batchId
      ? queryKeys.students.attendanceAnalytics(batchId, from, to)
      : ["students", "attendance-analytics", "noop"],
    queryFn: () => attendanceService.batchAnalytics(batchId as string, from, to),
    enabled: !!batchId,
  });

export const useAbsentList = (date: string) =>
  useQuery({
    queryKey: queryKeys.students.attendanceAbsent(date),
    queryFn: () => attendanceService.absentList(date),
  });
