import { BaseService, AppError } from "@/shared/services";
import type {
  AttendanceDraftRow,
  AttendanceStatus,
  AttendanceSummary,
  AttendanceTrendPoint,
  StudentAttendanceRecord,
} from "../types/student.types";

type AttRow = {
  id: string;
  student_id: string;
  batch_id: string | null;
  date: string;
  status: string;
  method: string | null;
  notes: string | null;
  marked_by: string | null;
  students?: { name?: string | null } | null;
};

const toRecord = (r: AttRow): StudentAttendanceRecord => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.students?.name ?? undefined,
  batchId: r.batch_id ?? undefined,
  date: r.date,
  status: (r.status as AttendanceStatus) ?? "present",
  method: (r.method as StudentAttendanceRecord["method"]) ?? "manual",
  notes: r.notes ?? undefined,
  markedBy: r.marked_by ?? undefined,
});

const ATT_SELECT = "id, student_id, batch_id, date, status, method, notes, marked_by";

/**
 * Student attendance — daily marking, history and analytics.
 *
 * Capture-method architecture: every row records a `method` (manual today;
 * biometric / qr / mobile later). New capture channels only need to write
 * rows with a different `method` — readers, history and analytics are
 * channel-agnostic, so no schema or query change is required.
 */
class AttendanceService extends BaseService {
  /** Roster + that day's marks for a batch. Missing rows default to present. */
  async getDay(batchId: string, date: string): Promise<AttendanceDraftRow[]> {
    const studentsRes = await this.db
      .from("students")
      .select("id, name")
      .eq("batch_id", batchId)
      .eq("is_active", true)
      .order("name");
    if (studentsRes.error) throw AppError.fromSupabase(studentsRes.error, "students");
    const roster = (studentsRes.data ?? []) as { id: string; name: string }[];
    if (roster.length === 0) return [];

    const ids = roster.map((s) => s.id);
    const attRes = await this.db
      .from("student_attendance")
      .select("student_id, status")
      .eq("date", date)
      .in("student_id", ids);
    if (attRes.error) throw AppError.fromSupabase(attRes.error, "student_attendance");
    const marks = new Map(
      ((attRes.data ?? []) as { student_id: string; status: string }[]).map((r) => [
        r.student_id,
        r.status as AttendanceStatus,
      ])
    );
    return roster.map((s) => ({
      studentId: s.id,
      studentName: s.name,
      status: marks.get(s.id) ?? "present",
    }));
  }

  /** Upsert a whole day's marks for a batch in one round-trip. */
  async saveDay(
    batchId: string,
    date: string,
    rows: AttendanceDraftRow[],
    markedBy?: string
  ): Promise<void> {
    if (rows.length === 0) return;
    const payload = rows.map((r) => ({
      student_id: r.studentId,
      batch_id: batchId,
      date,
      status: r.status,
      method: "manual",
      marked_by: markedBy ?? null,
      marked_at: new Date().toISOString(),
    }));
    const { error } = await this.db
      .from("student_attendance")
      .upsert(payload as never, { onConflict: "student_id,date" });
    if (error) throw AppError.fromSupabase(error, "student_attendance.saveDay");
  }

  /** Recent attendance history for one student. */
  async studentHistory(studentId: string, limit = 60): Promise<StudentAttendanceRecord[]> {
    const res = await this.db
      .from("student_attendance")
      .select(ATT_SELECT)
      .eq("student_id", studentId)
      .order("date", { ascending: false })
      .limit(limit);
    if (res.error) throw AppError.fromSupabase(res.error, "student_attendance");
    return ((res.data ?? []) as AttRow[]).map(toRecord);
  }

  /** Per-day analytics for a batch over a date range. */
  async batchAnalytics(
    batchId: string,
    fromDate: string,
    toDate: string
  ): Promise<{ summary: AttendanceSummary; trend: AttendanceTrendPoint[] }> {
    const res = await this.db
      .from("student_attendance")
      .select("date, status")
      .eq("batch_id", batchId)
      .gte("date", fromDate)
      .lte("date", toDate);
    if (res.error) throw AppError.fromSupabase(res.error, "student_attendance");
    const rows = (res.data ?? []) as { date: string; status: string }[];

    const byDay = new Map<string, AttendanceSummary>();
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    for (const r of rows) {
      if (r.status === "present") present++;
      else if (r.status === "absent") absent++;
      else if (r.status === "late") late++;
      else if (r.status === "excused") excused++;
      const d =
        byDay.get(r.date) ??
        {
          date: r.date,
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          presentPct: 0,
        };
      d.total++;
      if (r.status === "present") d.present++;
      else if (r.status === "absent") d.absent++;
      else if (r.status === "late") d.late++;
      else if (r.status === "excused") d.excused++;
      byDay.set(r.date, d);
    }
    const trend: AttendanceTrendPoint[] = [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        presentPct: d.total ? Math.round((d.present / d.total) * 100) : 0,
      }));
    const total = rows.length;
    return {
      summary: {
        date: `${fromDate} → ${toDate}`,
        total,
        present,
        absent,
        late,
        excused,
        presentPct: total ? Math.round((present / total) * 100) : 0,
      },
      trend,
    };
  }

  /** Students marked absent on a given date (absent tracking). */
  async absentList(date: string): Promise<StudentAttendanceRecord[]> {
    const res = await this.db
      .from("student_attendance")
      .select(`${ATT_SELECT}, students(name)`)
      .eq("date", date)
      .in("status", ["absent", "late"])
      .order("status");
    if (res.error) throw AppError.fromSupabase(res.error, "student_attendance");
    return ((res.data ?? []) as AttRow[]).map(toRecord);
  }
}

export const attendanceService = new AttendanceService();
