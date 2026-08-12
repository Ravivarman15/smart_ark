import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { AppError } from "@/shared/services";
import { attendanceStudentService } from "../services";
import { attendanceWhatsappService, type NotifyResult } from "../automation/services";
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

/** One-line summary of what the parents were told, for the save toast. */
const commsToast = (n: NotifyResult): void => {
  if (n.skipped) {
    if (n.reason) toast.info(`Attendance saved. ${n.reason}`);
    return;
  }
  const bits: string[] = [];
  if (n.sent > 0) bits.push(`${n.sent} parent${n.sent === 1 ? "" : "s"} notified`);
  if (n.corrections > 0) bits.push(`${n.corrections} correction${n.corrections === 1 ? "" : "s"} sent`);
  if (n.duplicates > 0) bits.push(`${n.duplicates} already notified`);
  if (bits.length > 0) toast.success(`Attendance saved — ${bits.join(", ")}.`);

  // Gaps are surfaced, never swallowed: the teacher is the one who can fix them.
  const gaps: string[] = [];
  if (n.missingMobile > 0) gaps.push(`${n.missingMobile} missing a parent mobile`);
  if (n.invalidMobile > 0) gaps.push(`${n.invalidMobile} with an invalid mobile`);
  if (n.failed > 0) gaps.push(`${n.failed} failed to send`);
  if (gaps.length > 0) {
    toast.warning(`WhatsApp not delivered for ${gaps.join(", ")}.`, {
      description: "See Attendance → Communication Dashboard for the reason and to resend.",
    });
  }
};

/**
 * Persist a batch's marks. Attaches the marker bundle so the audit trigger
 * records who marked what, then invalidates every namespace that aggregates
 * attendance (dashboard / reports / register / student profile).
 *
 * ENTERPRISE ATTENDANCE WHATSAPP AUTOMATION
 * Once the save SUCCEEDS, every ABSENT student's parent is WhatsApped in real
 * time (attendanceWhatsappService — synchronous, no queue, no scheduler), and
 * any absence corrected to PRESENT triggers a correction message.
 *
 * The notification runs AFTER saveDay resolves and its errors are swallowed by
 * the service, so a comms failure can never fail or roll back the attendance
 * submission. `previousStatus` comes from the rows loaded before editing, which
 * is what lets us tell "newly absent" from "corrected to present".
 */
export const useSaveStudentAttendance = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  return useMutation({
    mutationFn: async ({
      batchId,
      date,
      rows,
      source,
      previousRows,
    }: {
      batchId: string;
      date: string;
      rows: StudentDraftRow[];
      source?: AttendanceSource;
      /** Statuses as they were on the server before this edit. */
      previousRows?: StudentDraftRow[];
    }): Promise<NotifyResult | null> => {
      // 1. The business action. If this throws, nothing is notified.
      await attendanceStudentService.saveDay(batchId, date, rows, marker, source ?? "manual");

      // 2. Real-time parent notification. Best-effort by contract.
      const previous = new Map((previousRows ?? []).map((r) => [r.studentId, r.status]));
      return attendanceWhatsappService.notifyAbsentees({
        date,
        rows: rows.map((r) => ({
          studentId: r.studentId,
          studentName: r.studentName,
          status: r.status,
          previousStatus: previous.get(r.studentId),
        })),
        actorId: marker?.profileId,
        actorRole: marker?.role,
      });
    },
    onSuccess: (notify, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: queryKeys.attendance.studentMark(args.batchId, args.date) });
      // The dashboard reads the ledger we just wrote.
      qc.invalidateQueries({ queryKey: ["attendance-comms"] });

      if (notify) commsToast(notify);
      else toast.success("Attendance saved");
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

export const useStudentAttendanceLookup = (params: {
  from: string;
  to: string;
  standardId?: string;
  batchId?: string;
  studentId?: string;
  status?: string;
  source?: string;
  search?: string;
  enabled?: boolean;
}) =>
  useQuery({
    queryKey: ["attendance", "student-lookup", params] as const,
    queryFn: () => attendanceStudentService.lookup(params),
    enabled: params.enabled ?? true,
  });
