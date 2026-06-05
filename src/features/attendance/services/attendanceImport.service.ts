import { BaseService, AppError } from "@/shared/services";
import { computeWorkHours } from "../utils/workHours";
import {
  normalizeClock,
  normalizeDate,
  normalizeStaffStatus,
  normalizeStudentStatus,
  rowsToRecords,
  type ImportPreview,
  type ImportPreviewRow,
  type StaffImportField,
  type StudentImportField,
} from "../utils/importMapping";
import { composeTimestamp } from "../utils/dates";
import type {
  AttendanceMarker,
  AttendanceSettings,
} from "../types/attendance.types";

const CHUNK = 25;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const isSchemaCacheMiss = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("schema cache") || m.includes("does not exist") || (m.includes("could not find") && m.includes("column"));
};

interface StudentRow { id: string; name: string; roll_number: string | null; enrolment_no?: string | null; batch_id: string | null }
interface StaffRow { id: string; name: string; email?: string | null }

const summarize = (rows: ImportPreviewRow[], unmatchedColumns: boolean): ImportPreview => ({
  rows,
  total: rows.length,
  validCount: rows.filter((r) => r.valid && !r.duplicate).length,
  duplicateCount: rows.filter((r) => r.duplicate).length,
  errorCount: rows.filter((r) => !r.valid).length,
  unmatchedColumns,
});

/**
 * Bulk attendance import — student and staff. Parses are done in the page
 * (parseSpreadsheet, reused from the students feature); this service resolves
 * names → ids, validates, detects duplicates and commits in chunks. Capture
 * source is always `bulk_import`. Historical / backdated dates are supported —
 * any date in the file is honoured.
 */
class AttendanceImportService extends BaseService {
  // ── Students ────────────────────────────────────────────────────────────────
  private async loadStudents(): Promise<StudentRow[]> {
    const rich = await this.db
      .from("students")
      .select("id, name, roll_number, enrolment_no, batch_id")
      .eq("is_active", true);
    if (!rich.error) return (rich.data ?? []) as StudentRow[];
    if (!isSchemaCacheMiss(rich.error)) throw AppError.fromSupabase(rich.error, "students");
    const core = await this.db.from("students").select("id, name, roll_number, batch_id").eq("is_active", true);
    if (core.error) throw AppError.fromSupabase(core.error, "students");
    return (core.data ?? []) as StudentRow[];
  }

  async previewStudent(matrix: string[][]): Promise<ImportPreview> {
    const { mapping, records } = rowsToRecords<StudentImportField>(matrix, "student");
    const detected = new Set(Object.values(mapping));
    const unmatchedColumns = !detected.has("date") || !detected.has("status") ||
      !(detected.has("rollNumber") || detected.has("enrolmentNo") || detected.has("studentName"));

    const students = await this.loadStudents();
    const byEnrol = new Map<string, StudentRow>();
    const byRoll = new Map<string, StudentRow[]>();
    const byName = new Map<string, StudentRow[]>();
    for (const s of students) {
      if (s.enrolment_no) byEnrol.set(norm(s.enrolment_no), s);
      if (s.roll_number) byRoll.set(norm(s.roll_number), [...(byRoll.get(norm(s.roll_number)) ?? []), s]);
      byName.set(norm(s.name), [...(byName.get(norm(s.name)) ?? []), s]);
    }

    const rows: ImportPreviewRow[] = records.map((rec) => {
      const errors: string[] = [];
      const date = normalizeDate(rec.values.date ?? "");
      if (!date) errors.push("Invalid or missing date");
      const status = normalizeStudentStatus(rec.values.status);
      if (!status) errors.push(`Unknown status "${rec.values.status ?? ""}"`);

      let match: StudentRow | undefined;
      const enrol = rec.values.enrolmentNo;
      const roll = rec.values.rollNumber;
      const name = rec.values.studentName;
      if (enrol && byEnrol.has(norm(enrol))) match = byEnrol.get(norm(enrol));
      else if (roll && byRoll.has(norm(roll))) {
        const hits = byRoll.get(norm(roll))!;
        if (hits.length === 1) match = hits[0];
        else errors.push(`Roll "${roll}" matches ${hits.length} students`);
      } else if (name && byName.has(norm(name))) {
        const hits = byName.get(norm(name))!;
        if (hits.length === 1) match = hits[0];
        else errors.push(`Name "${name}" matches ${hits.length} students`);
      } else {
        errors.push("Student not found");
      }

      return {
        rowNumber: rec.rowNumber,
        raw: rec.values as Record<string, string>,
        date,
        status,
        matchedId: match?.id,
        matchedName: match?.name,
        batchId: match?.batch_id ?? undefined,
        remarks: rec.values.remarks,
        valid: errors.length === 0,
        duplicate: false,
        errors,
      };
    });

    await this.flagStudentDuplicates(rows);
    return summarize(rows, unmatchedColumns);
  }

  /** Mark rows that already have a saved record (DB) or repeat within the file. */
  private async flagStudentDuplicates(rows: ImportPreviewRow[]): Promise<void> {
    const valid = rows.filter((r) => r.valid && r.matchedId && r.date);
    if (valid.length === 0) return;
    // within-file
    const seen = new Set<string>();
    for (const r of valid) {
      const key = `${r.matchedId}|${r.date}`;
      if (seen.has(key)) r.duplicate = true;
      seen.add(key);
    }
    // existing DB rows in the date range
    const dates = valid.map((r) => r.date!).sort();
    const ids = [...new Set(valid.map((r) => r.matchedId!))];
    const run = (col: "attendance_date" | "date") =>
      this.db.from("student_attendance").select(`student_id, ${col}`).gte(col, dates[0]).lte(col, dates[dates.length - 1]).in("student_id", ids);
    let res = await run("attendance_date");
    if (res.error && isSchemaCacheMiss(res.error)) res = await run("date");
    if (res.error) return; // best-effort
    const existing = new Set(
      ((res.data ?? []) as Record<string, unknown>[]).map((r) => `${r.student_id}|${r.attendance_date ?? r.date}`),
    );
    for (const r of valid) if (existing.has(`${r.matchedId}|${r.date}`)) r.duplicate = true;
  }

  async commitStudent(rows: ImportPreviewRow[], marker?: AttendanceMarker): Promise<{ success: number; errors: number }> {
    const payloads = rows
      .filter((r) => r.valid && r.matchedId && r.date && r.status)
      .map((r) => ({
        student_id: r.matchedId,
        batch_id: r.batchId ?? null,
        attendance_date: r.date,
        date: r.date,
        status: r.status,
        method: "bulk_import",
        remarks: r.remarks ?? null,
        marked_by: marker?.profileId ?? null,
        marked_by_name: marker?.name || null,
        marked_by_role: marker?.role || null,
        marked_at: new Date().toISOString(),
        last_updated_by: marker?.profileId ?? null,
        last_updated_at: new Date().toISOString(),
      }));
    return this.commitChunks("student_attendance", payloads, "student_id,date");
  }

  // ── Staff ───────────────────────────────────────────────────────────────────
  private async loadStaff(): Promise<StaffRow[]> {
    const rich = await this.db.from("profiles").select("id, name, email").eq("is_active", true);
    if (!rich.error) return (rich.data ?? []) as StaffRow[];
    if (!isSchemaCacheMiss(rich.error)) throw AppError.fromSupabase(rich.error, "profiles");
    const core = await this.db.from("profiles").select("id, name").eq("is_active", true);
    if (core.error) throw AppError.fromSupabase(core.error, "profiles");
    return (core.data ?? []) as StaffRow[];
  }

  async previewStaff(matrix: string[][], settings: AttendanceSettings): Promise<ImportPreview> {
    const { mapping, records } = rowsToRecords<StaffImportField>(matrix, "staff");
    const detected = new Set(Object.values(mapping));
    const unmatchedColumns = !detected.has("date") || !detected.has("status") ||
      !(detected.has("email") || detected.has("staffName"));

    const staff = await this.loadStaff();
    const byEmail = new Map<string, StaffRow>();
    const byName = new Map<string, StaffRow[]>();
    for (const s of staff) {
      if (s.email) byEmail.set(norm(s.email), s);
      byName.set(norm(s.name), [...(byName.get(norm(s.name)) ?? []), s]);
    }

    const rows: ImportPreviewRow[] = records.map((rec) => {
      const errors: string[] = [];
      const date = normalizeDate(rec.values.date ?? "");
      if (!date) errors.push("Invalid or missing date");
      const status = normalizeStaffStatus(rec.values.status);
      if (!status) errors.push(`Unknown status "${rec.values.status ?? ""}"`);

      let match: StaffRow | undefined;
      const email = rec.values.email;
      const name = rec.values.staffName;
      if (email && byEmail.has(norm(email))) match = byEmail.get(norm(email));
      else if (name && byName.has(norm(name))) {
        const hits = byName.get(norm(name))!;
        if (hits.length === 1) match = hits[0];
        else errors.push(`Name "${name}" matches ${hits.length} staff`);
      } else {
        errors.push("Staff not found");
      }

      const inTime = normalizeClock(rec.values.inTime);
      const outTime = normalizeClock(rec.values.outTime);
      if (rec.values.inTime && !inTime) errors.push("Invalid in time");
      if (rec.values.outTime && !outTime) errors.push("Invalid out time");

      return {
        rowNumber: rec.rowNumber,
        raw: rec.values as Record<string, string>,
        date,
        status,
        matchedId: match?.id,
        matchedName: match?.name,
        inTime,
        outTime,
        remarks: rec.values.remarks,
        valid: errors.length === 0,
        duplicate: false,
        errors,
      };
    });

    await this.flagStaffDuplicates(rows);
    void settings; // settings used at commit time
    return summarize(rows, unmatchedColumns);
  }

  private async flagStaffDuplicates(rows: ImportPreviewRow[]): Promise<void> {
    const valid = rows.filter((r) => r.valid && r.matchedId && r.date);
    if (valid.length === 0) return;
    const seen = new Set<string>();
    for (const r of valid) {
      const key = `${r.matchedId}|${r.date}`;
      if (seen.has(key)) r.duplicate = true;
      seen.add(key);
    }
    const dates = valid.map((r) => r.date!).sort();
    const ids = [...new Set(valid.map((r) => r.matchedId!))];
    const res = await this.db
      .from("staff_attendance" as never)
      .select("staff_id, attendance_date")
      .gte("attendance_date", dates[0])
      .lte("attendance_date", dates[dates.length - 1])
      .in("staff_id", ids);
    if (res.error) return;
    const existing = new Set(((res.data ?? []) as Record<string, unknown>[]).map((r) => `${r.staff_id}|${r.attendance_date}`));
    for (const r of valid) if (existing.has(`${r.matchedId}|${r.date}`)) r.duplicate = true;
  }

  async commitStaff(
    rows: ImportPreviewRow[],
    settings: AttendanceSettings,
    marker?: AttendanceMarker,
  ): Promise<{ success: number; errors: number }> {
    const payloads = rows
      .filter((r) => r.valid && r.matchedId && r.date && r.status)
      .map((r) => {
        const inIso = composeTimestamp(r.date!, r.inTime ?? "");
        const outIso = composeTimestamp(r.date!, r.outTime ?? "");
        const wh = computeWorkHours(inIso, outIso, settings, r.status as never);
        const now = new Date().toISOString();
        return {
          staff_id: r.matchedId,
          date: r.date,
          attendance_date: r.date,
          status: r.status,
          in_time: inIso ?? null,
          out_time: outIso ?? null,
          worked_minutes: wh.workedMinutes,
          expected_minutes: wh.expectedMinutes,
          overtime_minutes: wh.overtimeMinutes,
          late_minutes: wh.lateMinutes,
          source: "bulk_import",
          remarks: r.remarks ?? null,
          marked_by: marker?.profileId ?? null,
          marked_by_name: marker?.name || null,
          marked_by_role: marker?.role || null,
          marked_at: now,
          last_updated_by: marker?.profileId ?? null,
          last_updated_at: now,
        };
      });
    return this.commitChunks("staff_attendance", payloads, "staff_id,date");
  }

  // ── Shared chunked upsert ─────────────────────────────────────────────────
  private async commitChunks(
    table: string,
    payloads: Record<string, unknown>[],
    onConflict: string,
  ): Promise<{ success: number; errors: number }> {
    let success = 0;
    let errors = 0;
    for (let i = 0; i < payloads.length; i += CHUNK) {
      const chunk = payloads.slice(i, i + CHUNK);
      const res = await this.db.from(table as never).upsert(chunk as never, { onConflict });
      if (res.error) errors += chunk.length;
      else success += chunk.length;
    }
    return { success, errors };
  }
}

export const attendanceImportService = new AttendanceImportService();
