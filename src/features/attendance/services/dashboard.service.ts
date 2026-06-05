import { BaseService, AppError } from "@/shared/services";
import { staffAttendanceService } from "./staffAttendance.service";
import type {
  DashboardSnapshot,
  StudentAttendanceStatus,
  StudentDaySummary,
} from "../types/attendance.types";

const isSchemaCacheMiss = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("schema cache") || (msg.includes("could not find") && msg.includes("column"));
};

const emptyStudents = (): StudentDaySummary => ({
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
  halfDay: 0,
  medicalLeave: 0,
  holiday: 0,
  total: 0,
  presentPct: 0,
});

/** Realtime dashboard aggregate — student + staff counts for one date. */
class AttendanceDashboardService extends BaseService {
  private async studentSummary(date: string): Promise<StudentDaySummary> {
    const run = (col: "attendance_date" | "date") =>
      this.db.from("student_attendance").select("status").eq(col, date);
    let res = await run("attendance_date");
    if (res.error && isSchemaCacheMiss(res.error)) res = await run("date");
    if (res.error) throw AppError.fromSupabase(res.error, "student_attendance");

    const s = emptyStudents();
    for (const r of (res.data ?? []) as { status: string }[]) {
      const status = r.status as StudentAttendanceStatus;
      if (status === "present") s.present += 1;
      else if (status === "absent") s.absent += 1;
      else if (status === "late") s.late += 1;
      else if (status === "excused") s.excused += 1;
      else if (status === "half_day") s.halfDay += 1;
      else if (status === "medical_leave") s.medicalLeave += 1;
      else if (status === "holiday") s.holiday += 1;
      s.total += 1;
    }
    const presentish = s.present + s.late + s.halfDay;
    s.presentPct = s.total > 0 ? Math.round((presentish / s.total) * 100) : 0;
    return s;
  }

  async snapshot(date: string): Promise<DashboardSnapshot> {
    const [students, staff] = await Promise.all([
      this.studentSummary(date),
      staffAttendanceService.daySummary(date),
    ]);
    return { date, students, staff };
  }
}

export const attendanceDashboardService = new AttendanceDashboardService();
