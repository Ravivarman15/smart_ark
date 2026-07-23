import { BaseService, AppError } from "@/shared/services";
import { attendanceStudentService } from "@/features/attendance/services/studentAttendance.service";
import type { ClassRosterRow } from "../types/allocation.types";

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

class ClassAttendanceService extends BaseService {
  /** The class's students with current/previous status + fee-due indicator. */
  async roster(classScheduleId: string): Promise<{
    rows: ClassRosterRow[];
    batchId?: string;
    date?: string;
  }> {
    const schedRes = (await this.db
      .from("class_schedules" as never)
      .select("id, batch_id, schedule_date")
      .eq("id", classScheduleId)
      .maybeSingle()) as { data: ScheduleLite | null };
    const sched = schedRes.data;
    if (!sched?.batch_id || !sched.schedule_date) return { rows: [] };

    // Reuse the attendance module's roster loader (day-level status per student).
    const draft = await attendanceStudentService.getDay(sched.batch_id, sched.schedule_date);

    // Any per-class marks already saved override the day defaults.
    const existing = await this.list(classScheduleId);
    const byStudent = new Map(existing.map((e) => [e.studentId, e]));

    // Fee-due indicator — students with an outstanding balance.
    const studentIds = draft.map((d) => d.studentId);
    const feeDue = await this.feeDueSet(studentIds);

    const rows: ClassRosterRow[] = draft.map((d) => {
      const prior = byStudent.get(d.studentId);
      const status: "present" | "absent" =
        prior?.status ?? (d.status === "absent" ? "absent" : "present");
      return {
        studentId: d.studentId,
        studentName: d.studentName,
        rollNumber: d.rollNumber,
        status,
        previousStatus: d.status === "absent" ? "absent" : "present",
        feeDue: feeDue.has(d.studentId),
        remarks: prior?.remarks,
      };
    });
    return { rows, batchId: sched.batch_id, date: sched.schedule_date };
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
      status: (r.status as "present" | "absent") ?? "present",
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
