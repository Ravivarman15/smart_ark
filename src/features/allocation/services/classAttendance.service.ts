import { BaseService, AppError } from "@/shared/services";
import { attendanceStudentService } from "@/features/attendance/services/studentAttendance.service";
import type { StudentAttendanceStatus } from "@/features/attendance/types/attendance.types";
import { classStudentsService } from "./classStudents.service";
import type { ClassAttendanceStatus, ClassRosterRow } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Class-attendance service — per-class granularity on TOP of the existing
// student-attendance flow. It does NOT re-implement attendance: the roster is
// loaded via attendanceStudentService.getDay() and the day-level save + parent
// WhatsApp are driven by the existing useSaveStudentAttendance hook. This service
// only reads the class roster (enriched with fee-due + previous status) and
// persists the per-class rows into class_attendance.
// ─────────────────────────────────────────────────────────────────────────────

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
};

interface ScheduleLite {
  id: string;
  batch_id?: string | null;
  schedule_date?: string | null;
}

/**
 * Map the per-class vocabulary (Phase 3: present / absent / late / medical /
 * leave) onto the EXISTING enterprise student-attendance vocabulary, so the
 * day-level row, the parent WhatsApp automation, Student 360 and analytics all
 * keep working off one set of statuses. No parallel vocabulary is introduced.
 */
export const toStudentStatus = (s: ClassAttendanceStatus): StudentAttendanceStatus => {
  switch (s) {
    case "medical":
      return "medical_leave";
    case "leave":
      return "excused";
    case "late":
      return "late";
    case "absent":
      return "absent";
    default:
      return "present";
  }
};

/** Reverse mapping, used when seeding the sheet from an existing day row. */
export const fromStudentStatus = (s?: string): ClassAttendanceStatus => {
  switch (s) {
    case "medical_leave":
      return "medical";
    case "excused":
      return "leave";
    case "late":
      return "late";
    case "absent":
      return "absent";
    default:
      return "present";
  }
};

/** Statuses that count as "not in class" for the present/absent summary. */
export const ABSENT_LIKE: ClassAttendanceStatus[] = ["absent", "medical", "leave"];

/**
 * Split a class roster into per-batch groups for the day-level save.
 *
 * The day-level `student_attendance` row is batch-stamped, and a multi-standard
 * class deliberately mixes batches — so saving the whole sheet under the class's
 * own batch would file every visiting student against a batch they aren't in,
 * corrupting the batch register. Rows with no batch at all are dropped rather
 * than guessed: there is nothing truthful to stamp them with.
 */
export const groupRowsByBatch = (
  rows: ClassRosterRow[],
  fallbackBatchId?: string,
): Map<string, ClassRosterRow[]> => {
  const groups = new Map<string, ClassRosterRow[]>();
  for (const r of rows) {
    const key = r.batchId ?? fallbackBatchId;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return groups;
};

class ClassAttendanceService extends BaseService {
  /**
   * The class's students with current/previous status + fee-due indicator.
   *
   * Source of the student list, in order:
   *   1. the EXPLICIT roster the coordinator assigned (class_students), which
   *      may span several standards and batches;
   *   2. the class's batch, for classes scheduled before per-class assignment
   *      existed (and for anyone who deliberately left the roster empty).
   *
   * This is the whole point of the feature: a teacher sees the students they
   * were given, not everyone who happens to share a batch.
   */
  async roster(classScheduleId: string): Promise<{
    rows: ClassRosterRow[];
    batchId?: string;
    date?: string;
    /** True when the list came from an explicit per-class assignment. */
    assigned?: boolean;
  }> {
    const schedRes = (await this.db
      .from("class_schedules" as never)
      .select("id, batch_id, schedule_date")
      .eq("id", classScheduleId)
      .maybeSingle()) as { data: ScheduleLite | null };
    const sched = schedRes.data;
    if (!sched?.schedule_date) return { rows: [] };

    const assignedRoster = await classStudentsService.listAssigned(classScheduleId);
    const assigned = assignedRoster.length > 0;
    if (!assigned && !sched.batch_id) return { rows: [], date: sched.schedule_date };

    // Reuse the attendance module's roster loader (day-level status per student)
    // for both paths, so the "what was this student marked today" logic is
    // resolved in exactly one place.
    const draft = assigned
      ? await attendanceStudentService.getDayForStudents(
          assignedRoster.map((a) => a.studentId),
          sched.schedule_date,
        )
      : await attendanceStudentService.getDay(
          sched.batch_id as string,
          sched.schedule_date,
        );

    // Which batch/standard each student belongs to — the submit groups the
    // day-level save by this, since one class can now cross batches.
    const meta = new Map(assignedRoster.map((a) => [a.studentId, a]));

    // Any per-class marks already saved override the day defaults.
    const existing = await this.list(classScheduleId);
    const byStudent = new Map(existing.map((e) => [e.studentId, e]));

    // Fee-due indicator — students with an outstanding balance.
    const studentIds = draft.map((d) => d.studentId);
    const feeDue = await this.feeDueSet(studentIds);

    const rows: ClassRosterRow[] = draft.map((d) => {
      const prior = byStudent.get(d.studentId);
      const dayStatus = fromStudentStatus(d.status);
      const m = meta.get(d.studentId);
      return {
        studentId: d.studentId,
        studentName: d.studentName,
        rollNumber: d.rollNumber,
        status: prior?.status ?? dayStatus,
        previousStatus: dayStatus,
        feeDue: feeDue.has(d.studentId),
        remarks: prior?.remarks,
        batchId: m?.batchId ?? sched.batch_id ?? undefined,
        standardId: m?.standardId,
        standardName: m?.standardName,
      };
    });
    return { rows, batchId: sched.batch_id ?? undefined, date: sched.schedule_date, assigned };
  }

  /** Students (from a list) that carry an outstanding fee balance. */
  private async feeDueSet(studentIds: string[]): Promise<Set<string>> {
    const set = new Set<string>();
    if (studentIds.length === 0) return set;
    const res = await this.db
      .from("student_fees" as never)
      .select("student_id, amount_pending")
      .in("student_id", studentIds)
      .gt("amount_pending", 0);
    if (res.error) return set; // fees module absent → no indicator
    for (const r of (res.data as unknown as { student_id: string }[]) ?? [])
      set.add(String(r.student_id));
    return set;
  }

  /** Persisted per-class rows. */
  async list(classScheduleId: string): Promise<ClassRosterRow[]> {
    const res = await this.db
      .from("class_attendance" as never)
      .select("student_id, student_name, status, remarks")
      .eq("class_schedule_id", classScheduleId);
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "class_attendance");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      studentId: String(r.student_id),
      studentName: String(r.student_name ?? ""),
      status: (r.status as ClassAttendanceStatus) ?? "present",
      feeDue: false,
      remarks: (r.remarks as string) ?? undefined,
    }));
  }

  /** Upsert the per-class attendance rows (one per student). */
  async upsert(
    classScheduleId: string,
    rows: ClassRosterRow[],
    markedBy?: string,
  ): Promise<void> {
    if (rows.length === 0) return;
    const payload = rows.map((r) => ({
      class_schedule_id: classScheduleId,
      student_id: r.studentId,
      student_name: r.studentName,
      status: r.status,
      remarks: r.remarks ?? null,
      marked_by: markedBy ?? null,
      marked_at: new Date().toISOString(),
    }));
    const res = await this.db
      .from("class_attendance" as never)
      .upsert(payload as never, { onConflict: "class_schedule_id,student_id" } as never);
    if (res.error) throw AppError.fromSupabase(res.error, "class_attendance");
  }
}

export const classAttendanceService = new ClassAttendanceService();
