import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { AppError } from "@/shared/services";
import { attendanceService } from "../services/attendance.service";
import type {
  AttendanceDraftRow,
  AttendanceMarker,
  AttendanceMethod,
} from "../types/student.types";

/** Roster + marks for one batch on one date. */
export const useAttendanceDay = (batchId: string | undefined, date: string) =>
  useQuery({
    queryKey: batchId
      ? queryKeys.students.attendanceDay(batchId, date)
      : ["students", "attendance-day", "noop"],
    queryFn: () => attendanceService.getDay(batchId as string, date),
    enabled: !!batchId,
  });

/**
 * Submit a batch's attendance. Attaches a full marker bundle (id, name,
 * role) so the audit trigger can record WHO marked WHAT. On success, every
 * query that drives analytics / dashboards / reports is invalidated so the
 * UI refetches the new numbers — no page reload needed.
 *
 * Migration-safe: the service downgrades to a legacy column set when the
 * enterprise schema isn't yet applied and surfaces a soft warning. We
 * promote that warning to a `toast.info` rather than a hard failure so
 * teachers can keep working while ops applies the migration.
 */
export const useSaveAttendance = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      batchId,
      date,
      rows,
      method,
    }: {
      batchId: string;
      date: string;
      rows: AttendanceDraftRow[];
      method?: AttendanceMethod;
    }) => {
      const marker: AttendanceMarker | undefined = user
        ? {
            userId: user.id,
            profileId: user.profileId ?? user.id,
            name: user.name ?? "",
            role: user.role ?? "",
          }
        : undefined;
      return attendanceService.saveDay(batchId, date, rows, marker, method ?? "manual");
    },
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.attendanceDay(args.batchId, args.date) });
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.attendance("batch") });
      // Reports aggregate from student_attendance — bust their cache too.
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Attendance saved");
    },
    onError: (err) => {
      // The service throws AppError.validation when it had to fall back to
      // the legacy column set. That's a soft warning (data was saved, but
      // marker identity wasn't captured), so surface as info — not error.
      if (err instanceof AppError && err.kind === "Validation") {
        toast.warning(err.message);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    },
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
  to: string,
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

/**
 * Audit timeline for management / triage. Filters by batch + date range +
 * marker. Returns an empty list (no crash) when the audit table isn't
 * present yet — service handles that.
 */
export const useAttendanceAudit = (filters: {
  batchId?: string;
  date?: string;
  fromDate?: string;
  toDate?: string;
  markerId?: string;
  limit?: number;
}) =>
  useQuery({
    queryKey: [...queryKeys.students.all, "attendance-audit", filters] as const,
    queryFn: () => attendanceService.auditTimeline(filters),
  });

/** Distinct markers in a date range — drives the "marked by" filter dropdown. */
export const useAttendanceMarkers = (fromDate: string, toDate: string) =>
  useQuery({
    queryKey: [...queryKeys.students.all, "attendance-markers", fromDate, toDate] as const,
    queryFn: () => attendanceService.markerList(fromDate, toDate),
  });
