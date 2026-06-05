import { BaseService, AppError } from "@/shared/services";
import {
  attendanceService as studentsAttendanceService,
} from "@/features/students";
import { lockGuardService } from "./lockGuard.service";
import type {
  AttendanceMarker,
  StudentAttendanceRow,
  StudentAttendanceStatus,
  StudentDraftRow,
  AttendanceSource,
} from "../types/attendance.types";

// PostgREST schema-cache-miss detection (migration not applied / cache stale).
const isSchemaCacheMiss = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("schema cache") || (msg.includes("could not find") && msg.includes("column"));
};

type AttRow = {
  id: string;
  student_id: string;
  batch_id?: string | null;
  date?: string | null;
  attendance_date?: string | null;
  status: string;
  method?: string | null;
  remarks?: string | null;
  notes?: string | null;
  marked_by_name?: string | null;
  marked_by_role?: string | null;
  marked_at?: string | null;
  students?: { name?: string | null; roll_number?: string | null } | null;
};

const toRow = (r: AttRow): StudentAttendanceRow => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.students?.name ?? undefined,
  rollNumber: r.students?.roll_number ?? undefined,
  batchId: r.batch_id ?? undefined,
  date: (r.attendance_date ?? r.date ?? "") as string,
  status: (r.status as StudentAttendanceStatus) ?? "present",
  source: (r.method as AttendanceSource) ?? "manual",
  remarks: r.remarks ?? r.notes ?? undefined,
  markedByName: r.marked_by_name ?? undefined,
  markedByRole: r.marked_by_role ?? undefined,
  markedAt: r.marked_at ?? undefined,
});

/**
 * Student attendance — the attendance module's surface over the existing
 * `student_attendance` table. Writes delegate to the students-feature service
 * (which carries the batch-access guard, marker audit and legacy-column
 * fallback); reads that need roll numbers / register shapes are implemented
 * here directly against the table.
 */
class AttendanceStudentService extends BaseService {
  /** Roster + that day's marks for a batch (defaults to present). */
  async getDay(batchId: string, date: string): Promise<StudentDraftRow[]> {
    const studentsRes = await this.db
      .from("students")
      .select("id, name, roll_number")
      .eq("batch_id", batchId)
      .eq("is_active", true)
      .order("name");
    if (studentsRes.error) throw AppError.fromSupabase(studentsRes.error, "students");
    const roster = (studentsRes.data ?? []) as { id: string; name: string; roll_number: string | null }[];
    if (roster.length === 0) return [];

    const ids = roster.map((s) => s.id);
    let attRes = await this.db
      .from("student_attendance")
      .select("student_id, status")
      .eq("attendance_date", date)
      .in("student_id", ids);
    if (attRes.error && isSchemaCacheMiss(attRes.error)) {
      attRes = await this.db
        .from("student_attendance")
        .select("student_id, status")
        .eq("date", date)
        .in("student_id", ids);
    }
    if (attRes.error) throw AppError.fromSupabase(attRes.error, "student_attendance");

    const marks = new Map(
      ((attRes.data ?? []) as { student_id: string; status: string }[]).map((r) => [
        r.student_id,
        r.status as StudentAttendanceStatus,
      ]),
    );
    return roster.map((s) => ({
      studentId: s.id,
      studentName: s.name,
      rollNumber: s.roll_number ?? undefined,
      status: marks.get(s.id) ?? "present",
    }));
  }

  /**
   * Persist a whole day's marks. Delegates to the students-feature service so
   * the batch-access guard + audit trigger + legacy fallback all apply. The
   * capture `source` is stored in the `method` column (the student table's
   * source-tracking field).
   */
  async saveDay(
    batchId: string,
    date: string,
    rows: StudentDraftRow[],
    marker?: AttendanceMarker,
    source: AttendanceSource = "manual",
  ): Promise<void> {
    await lockGuardService.assertWritable("student", date);
    await studentsAttendanceService.saveDay(
      batchId,
      date,
      rows as never,
      marker as never,
      source as never,
    );
  }

  /** Attendance register over a date range (Daily / Monthly / Register views). */
  async register(params: {
    batchId?: string;
    from: string;
    to: string;
    status?: StudentAttendanceStatus;
    studentId?: string;
  }): Promise<StudentAttendanceRow[]> {
    const cols =
      "id, student_id, batch_id, date, attendance_date, status, method, remarks, " +
      "marked_by_name, marked_by_role, marked_at, students(name, roll_number)";
    const run = (dateCol: "attendance_date" | "date") => {
      let q = this.db.from("student_attendance").select(cols).gte(dateCol, params.from).lte(dateCol, params.to);
      if (params.batchId) q = q.eq("batch_id", params.batchId);
      if (params.studentId) q = q.eq("student_id", params.studentId);
      if (params.status) q = q.eq("status", params.status);
      return q.order(dateCol, { ascending: false });
    };
    let res = await run("attendance_date");
    if (res.error && isSchemaCacheMiss(res.error)) res = await run("date");
    if (res.error) throw AppError.fromSupabase(res.error, "student_attendance");
    return ((res.data ?? []) as unknown as AttRow[]).map(toRow);
  }

  /** Audit timeline (who marked / changed what) — reuses the students service. */
  auditTimeline(filters: {
    batchId?: string;
    date?: string;
    fromDate?: string;
    toDate?: string;
    markerId?: string;
    limit?: number;
  }) {
    return studentsAttendanceService.auditTimeline(filters);
  }
}

export const attendanceStudentService = new AttendanceStudentService();
