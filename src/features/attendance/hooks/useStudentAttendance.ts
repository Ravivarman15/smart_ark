import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { AppError } from "@/shared/services";
import { attendanceStudentService } from "../services";
import { useMarker } from "./useMarker";
import type {
  AttendanceSource,
  StudentAttendanceStatus,
  StudentDraftRow,
} from "../types/attendance.types";

/** Roster + that day's marks for a batch. */
export const useStudentAttendanceDay = (batchId: string | undefined, date: string) =>
  useQuery({
    queryKey: batchId
      ? queryKeys.attendance.studentMark(batchId, date)
      : queryKeys.attendance.studentMark("noop", date),
    queryFn: () => attendanceStudentService.getDay(batchId as string, date),
    enabled: !!batchId,
  });

/**
 * Persist a batch's marks. Attaches the marker bundle so the audit trigger
 * records who marked what, then invalidates every namespace that aggregates
 * attendance (dashboard / reports / register / student profile).
 */
export const useSaveStudentAttendance = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  return useMutation({
    mutationFn: ({
      batchId,
      date,
      rows,
      source,
    }: {
      batchId: string;
      date: string;
      rows: StudentDraftRow[];
      source?: AttendanceSource;
    }) => attendanceStudentService.saveDay(batchId, date, rows, marker, source ?? "manual"),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: queryKeys.attendance.studentMark(args.batchId, args.date) });
      toast.success("Attendance saved");
    },
    onError: (err) => {
      // Soft warning from the legacy-column fallback path → info, not error.
      if (err instanceof AppError && err.kind === "Validation") {
        toast.warning(err.message);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    },
  });
};

export const useStudentRegister = (params: {
  batchId?: string;
  from: string;
  to: string;
  status?: StudentAttendanceStatus;
  studentId?: string;
  enabled?: boolean;
}) =>
  useQuery({
    queryKey: queryKeys.attendance.studentRegister(params as Record<string, unknown>),
    queryFn: () =>
      attendanceStudentService.register({
        batchId: params.batchId,
        from: params.from,
        to: params.to,
        status: params.status,
        studentId: params.studentId,
      }),
    enabled: params.enabled ?? true,
  });

export const useStudentAttendanceAudit = (filters: {
  batchId?: string;
  date?: string;
  fromDate?: string;
  toDate?: string;
  markerId?: string;
  limit?: number;
}) =>
  useQuery({
    queryKey: queryKeys.attendance.studentAudit(filters as Record<string, unknown>),
    queryFn: () => attendanceStudentService.auditTimeline(filters),
  });
