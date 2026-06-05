import { BaseService, AppError } from "@/shared/services";
import { computeWorkHours } from "../utils/workHours";
import { lockGuardService } from "./lockGuard.service";
import type {
  AttendanceMarker,
  AttendanceSettings,
  AttendanceSource,
  StaffAttendanceRecord,
  StaffAttendanceStatus,
  StaffAuditEntry,
  StaffDaySummary,
  StaffManualInput,
} from "../types/attendance.types";

const SELECT_COLS =
  "id, staff_id, date, attendance_date, status, in_time, out_time, " +
  "worked_minutes, expected_minutes, overtime_minutes, late_minutes, source, remarks, " +
  "marked_by, marked_by_name, marked_by_role, marked_at, last_updated_at";

type Row = {
  id: string;
  staff_id: string;
  date?: string | null;
  attendance_date?: string | null;
  status: string;
  in_time?: string | null;
  out_time?: string | null;
  worked_minutes?: number | null;
  expected_minutes?: number | null;
  overtime_minutes?: number | null;
  late_minutes?: number | null;
  source?: string | null;
  remarks?: string | null;
  marked_by?: string | null;
  marked_by_name?: string | null;
  marked_by_role?: string | null;
  marked_at?: string | null;
  last_updated_at?: string | null;
};

const toRecord = (
  r: Row,
  profile?: { name?: string | null; role?: string | null },
): StaffAttendanceRecord => ({
  id: r.id,
  staffId: r.staff_id,
  staffName: profile?.name ?? undefined,
  role: profile?.role ?? r.marked_by_role ?? undefined,
  date: (r.attendance_date ?? r.date ?? "") as string,
  status: (r.status as StaffAttendanceStatus) ?? "present",
  inTime: r.in_time ?? undefined,
  outTime: r.out_time ?? undefined,
  workedMinutes: r.worked_minutes ?? 0,
  expectedMinutes: r.expected_minutes ?? 0,
  overtimeMinutes: r.overtime_minutes ?? 0,
  lateMinutes: r.late_minutes ?? 0,
  source: (r.source as AttendanceSource) ?? "manual",
  remarks: r.remarks ?? undefined,
  markedBy: r.marked_by ?? undefined,
  markedByName: r.marked_by_name ?? undefined,
  markedByRole: r.marked_by_role ?? undefined,
  markedAt: r.marked_at ?? undefined,
  lastUpdatedAt: r.last_updated_at ?? undefined,
});

/**
 * Staff attendance — manual entry, self check-in/out and the work-hours engine,
 * backed by the new `staff_attendance` table (+ audit trigger). The table isn't
 * in the generated Supabase types yet, so queries go through the untyped builder
 * (`from(<name> as never)`), matching the students-feature pattern.
 */
class StaffAttendanceService extends BaseService {
  private table() {
    return this.db.from("staff_attendance" as never);
  }

  /** Attach profile names/roles to a set of staff rows in one extra query. */
  private async withProfiles(rows: Row[]): Promise<StaffAttendanceRecord[]> {
    const ids = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))];
    const byId = new Map<string, { name?: string | null; role?: string | null }>();
    if (ids.length > 0) {
      const res = await this.db.from("profiles").select("id, name, role").in("id", ids);
      for (const p of (res.data ?? []) as { id: string; name: string; role: string }[]) {
        byId.set(p.id, { name: p.name, role: String(p.role ?? "") });
      }
    }
    return rows.map((r) => toRecord(r, byId.get(r.staff_id)));
  }

  /** Build the persisted column payload from in/out + settings + status. */
  private derive(input: {
    staffId: string;
    date: string;
    status: StaffAttendanceStatus;
    inTime?: string;
    outTime?: string;
    remarks?: string;
    source: AttendanceSource;
    marker?: AttendanceMarker;
    settings: AttendanceSettings;
  }) {
    const wh = computeWorkHours(input.inTime, input.outTime, input.settings, input.status);
    const now = new Date().toISOString();
    return {
      staff_id: input.staffId,
      date: input.date,
      attendance_date: input.date,
      status: input.status,
      in_time: input.inTime ?? null,
      out_time: input.outTime ?? null,
      worked_minutes: wh.workedMinutes,
      expected_minutes: wh.expectedMinutes,
      overtime_minutes: wh.overtimeMinutes,
      late_minutes: wh.lateMinutes,
      source: input.source,
      remarks: input.remarks ?? null,
      marked_by: input.marker?.profileId ?? null,
      marked_by_name: input.marker?.name || null,
      marked_by_role: input.marker?.role || null,
      marked_at: now,
      last_updated_by: input.marker?.profileId ?? null,
      last_updated_at: now,
    };
  }

  // ── Reads ───────────────────────────────────────────────────────────────────

  /** All staff rows for one date (management board). */
  async getDay(date: string): Promise<StaffAttendanceRecord[]> {
    const res = await this.table().select(SELECT_COLS).eq("attendance_date", date);
    if (res.error) throw AppError.fromSupabase(res.error, "staff_attendance");
    return this.withProfiles((res.data ?? []) as unknown as Row[]);
  }

  /** One staff member's record for one date (self check-in page). */
  async getMemberDay(staffId: string, date: string): Promise<StaffAttendanceRecord | null> {
    const res = await this.table()
      .select(SELECT_COLS)
      .eq("staff_id", staffId)
      .eq("attendance_date", date)
      .limit(1);
    if (res.error) throw AppError.fromSupabase(res.error, "staff_attendance");
    const rows = (res.data ?? []) as unknown as Row[];
    if (rows.length === 0) return null;
    const [withProfile] = await this.withProfiles(rows);
    return withProfile ?? null;
  }

  /** A staff member's records over a date range (register / work-hours). */
  async memberRange(staffId: string, from: string, to: string): Promise<StaffAttendanceRecord[]> {
    const res = await this.table()
      .select(SELECT_COLS)
      .eq("staff_id", staffId)
      .gte("attendance_date", from)
      .lte("attendance_date", to)
      .order("attendance_date", { ascending: false });
    if (res.error) throw AppError.fromSupabase(res.error, "staff_attendance");
    return this.withProfiles((res.data ?? []) as unknown as Row[]);
  }

  /** All staff records over a date range (register grid). */
  async range(from: string, to: string, staffId?: string): Promise<StaffAttendanceRecord[]> {
    let q = this.table().select(SELECT_COLS).gte("attendance_date", from).lte("attendance_date", to);
    if (staffId) q = q.eq("staff_id", staffId);
    const res = await q.order("attendance_date", { ascending: false });
    if (res.error) throw AppError.fromSupabase(res.error, "staff_attendance");
    return this.withProfiles((res.data ?? []) as unknown as Row[]);
  }

  // ── Writes ──────────────────────────────────────────────────────────────────

  /** Management manual entry (or a backdated entry). Upserts on (staff, date). */
  async saveManual(
    input: StaffManualInput,
    marker: AttendanceMarker | undefined,
    settings: AttendanceSettings,
    source: AttendanceSource = "manual",
  ): Promise<void> {
    await lockGuardService.assertWritable("staff", input.date);
    const payload = this.derive({ ...input, source, marker, settings });
    const res = await this.table().upsert(payload as never, { onConflict: "staff_id,date" });
    if (res.error) throw AppError.fromSupabase(res.error, "staff_attendance.saveManual");
  }

  /** Self check-in — stamps in_time=now, source=staff_checkin. */
  async checkIn(
    staffId: string,
    date: string,
    marker: AttendanceMarker | undefined,
    settings: AttendanceSettings,
  ): Promise<void> {
    await lockGuardService.assertWritable("staff", date);
    const nowIso = new Date().toISOString();
    const existing = await this.getMemberDay(staffId, date);
    const wh = computeWorkHours(nowIso, existing?.outTime, settings, "present");
    const status: StaffAttendanceStatus = wh.lateMinutes > 0 ? "late" : "present";
    const payload = {
      ...this.derive({
        staffId,
        date,
        status,
        inTime: nowIso,
        outTime: existing?.outTime,
        remarks: existing?.remarks,
        source: "staff_checkin",
        marker,
        settings,
      }),
    };
    const res = await this.table().upsert(payload as never, { onConflict: "staff_id,date" });
    if (res.error) throw AppError.fromSupabase(res.error, "staff_attendance.checkIn");
  }

  /** Self check-out — stamps out_time=now, recomputes worked hours. */
  async checkOut(
    staffId: string,
    date: string,
    marker: AttendanceMarker | undefined,
    settings: AttendanceSettings,
  ): Promise<void> {
    await lockGuardService.assertWritable("staff", date);
    const existing = await this.getMemberDay(staffId, date);
    if (!existing?.inTime) throw AppError.validation("Check in before checking out.");
    const nowIso = new Date().toISOString();
    const wh = computeWorkHours(existing.inTime, nowIso, settings, "present");
    const status: StaffAttendanceStatus = wh.lateMinutes > 0 ? "late" : "present";
    const payload = this.derive({
      staffId,
      date,
      status,
      inTime: existing.inTime,
      outTime: nowIso,
      remarks: existing.remarks,
      source: "staff_checkin",
      marker,
      settings,
    });
    const res = await this.table().upsert(payload as never, { onConflict: "staff_id,date" });
    if (res.error) throw AppError.fromSupabase(res.error, "staff_attendance.checkOut");
  }

  /** Correction — overwrites a day with a reason; logged by the audit trigger. */
  async correct(
    input: StaffManualInput,
    reason: string,
    marker: AttendanceMarker | undefined,
    settings: AttendanceSettings,
  ): Promise<void> {
    const remarks = input.remarks ? `${input.remarks} • Correction: ${reason}` : `Correction: ${reason}`;
    await this.saveManual({ ...input, remarks }, marker, settings, "correction");
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  async auditTimeline(filters: {
    staffId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<StaffAuditEntry[]> {
    let q = this.db
      .from("staff_attendance_audit" as never)
      .select(
        "id, attendance_id, staff_id, attendance_date, old_status, new_status, " +
          "old_in_time, new_in_time, old_out_time, new_out_time, source, remarks, " +
          "changed_by, changed_by_name, changed_by_role, change_type, changed_at",
      )
      .order("changed_at", { ascending: false })
      .limit(filters.limit ?? 200);
    if (filters.staffId) q = q.eq("staff_id", filters.staffId);
    if (filters.fromDate) q = q.gte("attendance_date", filters.fromDate);
    if (filters.toDate) q = q.lte("attendance_date", filters.toDate);
    const res = await q;
    if (res.error) return []; // audit table absent (migration not applied) → empty
    return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      attendanceId: String(r.attendance_id),
      staffId: (r.staff_id as string) ?? undefined,
      date: String(r.attendance_date ?? ""),
      oldStatus: (r.old_status as StaffAttendanceStatus | null) ?? undefined,
      newStatus: r.new_status as StaffAttendanceStatus,
      oldInTime: (r.old_in_time as string) ?? undefined,
      newInTime: (r.new_in_time as string) ?? undefined,
      oldOutTime: (r.old_out_time as string) ?? undefined,
      newOutTime: (r.new_out_time as string) ?? undefined,
      source: (r.source as AttendanceSource) ?? undefined,
      remarks: (r.remarks as string) ?? undefined,
      changedBy: (r.changed_by as string) ?? undefined,
      changedByName: (r.changed_by_name as string) ?? undefined,
      changedByRole: (r.changed_by_role as string) ?? undefined,
      changeType: r.change_type as "insert" | "update",
      changedAt: String(r.changed_at ?? ""),
    }));
  }

  // ── Dashboard aggregate ─────────────────────────────────────────────────────

  async daySummary(date: string): Promise<StaffDaySummary> {
    const records = await this.getDay(date);
    const summary: StaffDaySummary = {
      present: 0,
      absent: 0,
      late: 0,
      leave: 0,
      halfDay: 0,
      total: records.length,
      presentPct: 0,
      avgWorkedMinutes: 0,
    };
    let workedTotal = 0;
    for (const r of records) {
      if (r.status === "present") summary.present += 1;
      else if (r.status === "absent") summary.absent += 1;
      else if (r.status === "late") summary.late += 1;
      else if (r.status === "leave") summary.leave += 1;
      else if (r.status === "half_day") summary.halfDay += 1;
      workedTotal += r.workedMinutes;
    }
    const presentish = summary.present + summary.late + summary.halfDay;
    summary.presentPct = summary.total > 0 ? Math.round((presentish / summary.total) * 100) : 0;
    summary.avgWorkedMinutes = summary.total > 0 ? Math.round(workedTotal / summary.total) : 0;
    return summary;
  }
}

export const staffAttendanceService = new StaffAttendanceService();
