import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useSaveStudentAttendance } from "@/features/attendance/hooks/useStudentAttendance";
import type { StudentDraftRow } from "@/features/attendance/types/attendance.types";
import { classAttendanceService, scheduleService } from "../services";
import type { ClassRosterRow } from "../types/allocation.types";

/** The class roster (students + previous status + fee-due). */
export const useClassRoster = (classScheduleId?: string) =>
  useQuery({
    queryKey: queryKeys.allocation.classRoster(classScheduleId ?? ""),
    queryFn: () => classAttendanceService.roster(classScheduleId as string),
    enabled: !!classScheduleId,
  });

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
      batchId: string;
      date: string;
      rows: ClassRosterRow[];
      previousRows?: ClassRosterRow[];
    }) => {
      const draft: StudentDraftRow[] = input.rows.map((r) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        rollNumber: r.rollNumber,
        status: r.status,
        remarks: r.remarks,
      }));
      const previous: StudentDraftRow[] | undefined = input.previousRows?.map((r) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        status: r.previousStatus ?? r.status,
      }));

      // 1) Day-level student attendance + parent WhatsApp (existing pipeline).
      await saveStudentAttendance.mutateAsync({
        batchId: input.batchId,
        date: input.date,
        rows: draft,
        previousRows: previous,
      });
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
