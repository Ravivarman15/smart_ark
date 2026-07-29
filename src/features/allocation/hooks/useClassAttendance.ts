import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useSaveStudentAttendance } from "@/features/attendance/hooks/useStudentAttendance";
import type { StudentDraftRow } from "@/features/attendance/types/attendance.types";
import { classAttendanceService, scheduleService } from "../services";
import { groupRowsByBatch, toStudentStatus } from "../services/classAttendance.service";
import type { ClassRosterRow } from "../types/allocation.types";

/** The class roster (students + previous status + fee-due). */
export const useClassRoster = (classScheduleId?: string) =>
  useQuery({
    queryKey: queryKeys.allocation.classRoster(classScheduleId ?? ""),
    queryFn: () => classAttendanceService.roster(classScheduleId as string),
    enabled: !!classScheduleId,
  });

/**
 * Auto-save (Phase 8) — persist the per-class marks as the teacher taps, WITHOUT
 * completing the class or firing parent comms. Only `class_attendance` is
 * touched, so a dropped connection mid-sheet never loses work and never sends a
 * premature WhatsApp. The final Submit still runs the full pipeline below.
 */
export const useAutosaveClassAttendance = () => {
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: { classScheduleId: string; rows: ClassRosterRow[] }) =>
      classAttendanceService.upsert(input.classScheduleId, input.rows, user?.profileId),
  });
};

/**
 * Submit class attendance. Reuses the existing student-attendance pipeline
 * verbatim (day-level save + real-time parent WhatsApp via
 * useSaveStudentAttendance), then persists the per-class rows and completes the
 * class (which feeds teaching hours → payroll). No attendance/comms logic is
 * duplicated here.
 */
export const useSubmitClassAttendance = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const saveStudentAttendance = useSaveStudentAttendance();

  return useMutation({
    mutationFn: async (input: {
      classScheduleId: string;
      /** The class's own batch — the fallback for rows with no batch of their own. */
      batchId?: string;
      date: string;
      rows: ClassRosterRow[];
      previousRows?: ClassRosterRow[];
    }) => {
      // The per-class vocabulary (present/absent/late/medical/leave) is mapped
      // onto the existing enterprise student-attendance statuses so the day-level
      // save, parent WhatsApp and Student 360 stay on one vocabulary.
      const toDraft = (r: ClassRosterRow): StudentDraftRow => ({
        studentId: r.studentId,
        studentName: r.studentName,
        rollNumber: r.rollNumber,
        status: toStudentStatus(r.status),
        remarks: r.remarks,
      });
      const previousById = new Map(
        (input.previousRows ?? []).map((r) => [
          r.studentId,
          {
            studentId: r.studentId,
            studentName: r.studentName,
            status: toStudentStatus(r.previousStatus ?? r.status),
          } as StudentDraftRow,
        ]),
      );

      // A multi-standard class draws students from several batches, and the
      // day-level row is batch-stamped — so run the existing pipeline once per
      // batch rather than filing everyone under the class's own batch.
      const groups = groupRowsByBatch(input.rows, input.batchId);

      // 1) Day-level student attendance + parent WhatsApp (existing pipeline).
      for (const [batchId, rows] of groups) {
        await saveStudentAttendance.mutateAsync({
          batchId,
          date: input.date,
          rows: rows.map(toDraft),
          previousRows: rows
            .map((r) => previousById.get(r.studentId))
            .filter((v): v is StudentDraftRow => !!v),
        });
      }
      // 2) Per-class granular rows.
      await classAttendanceService.upsert(input.classScheduleId, input.rows, user?.profileId);
      // 3) Complete the class → teaching hours → payroll.
      await scheduleService.submitAttendance(input.classScheduleId, { id: user?.profileId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.allocation.all });
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
};
