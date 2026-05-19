import { BaseService, AppError } from "@/shared/services";
import {
  appCheckOutStatus,
  dbCheckInStatus,
  dbCheckOutStatus,
  deriveCheckInStatus,
  deriveCheckOutStatus,
  formatTime,
} from "../utils/attendance";
import type {
  ApprovalArgs,
  AttendanceRecord,
  CheckInResult,
  CheckOutResult,
} from "../types/staff.types";

// ── DB row shape (private) ───────────────────────────────────────────────────
type AttendanceRow = {
  teacher_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  geo_valid: boolean | null;
  checkout_geo_valid: boolean | null;
  status: string | null;
  check_out_status: string | null;
  comments: string | null;
  override_check_in_time: string | null;
  override_check_out_time: string | null;
};

const toDomain = (r: AttendanceRow): AttendanceRecord => {
  const checkIn = r.check_in_time ? new Date(r.check_in_time) : null;
  const checkOut = r.check_out_time ? new Date(r.check_out_time) : null;

  return {
    staffId: r.teacher_id,
    date: r.date,
    time: checkIn ? formatTime(checkIn) : "",
    geoValid: r.geo_valid ?? false,
    status:
      r.status === "late"
        ? "late"
        : r.status === "on_time"
        ? "on-time"
        : checkIn
        ? "pending"
        : "absent",
    checkinTimestamp: r.check_in_time ?? undefined,
    checkoutTime: checkOut ? formatTime(checkOut) : undefined,
    checkoutGeoValid: r.checkout_geo_valid ?? undefined,
    checkoutStatus: appCheckOutStatus(r.check_out_status),
    checkoutTimestamp: r.check_out_time ?? undefined,
    comments: r.comments ?? undefined,
  };
};

// ── Service ──────────────────────────────────────────────────────────────────
class AttendanceService extends BaseService {
  /**
   * Fetch attendance rows for a date range. Used by the historical log
   * and the daily admin board.
   */
  async list(args: { fromDate?: string; toDate?: string; staffIds?: string[] } = {}): Promise<AttendanceRecord[]> {
    let q = this.db
      .from("teacher_attendance")
      .select(
        "teacher_id, date, check_in_time, check_out_time, geo_valid, checkout_geo_valid, status, check_out_status, comments, override_check_in_time, override_check_out_time"
      );
    if (args.fromDate) q = q.gte("date", args.fromDate);
    if (args.toDate) q = q.lte("date", args.toDate);
    if (args.staffIds && args.staffIds.length > 0) q = q.in("teacher_id", args.staffIds);

    const res = await q.order("date", { ascending: false });
    const rows = this.guardList(res, "teacher_attendance");
    return (rows as unknown as AttendanceRow[]).map(toDomain);
  }

  /**
   * Record a check-in. Status starts as `pending` — admin approval flips
   * it to `on-time` / `late`. Same table is used for admin + teacher; the
   * distinction is only at the role level on the profile row.
   *
   * NOTE: `geoValid` is currently a client-side claim. When backend geo
   * validation lands, this method's signature won't change — only the
   * implementation moves from `upsert` to an edge-function call.
   */
  async checkIn(staffId: string, date: string, geoValid: boolean): Promise<void> {
    const now = new Date();
    const { error } = await this.db
      .from("teacher_attendance")
      .upsert(
        {
          teacher_id: staffId,
          date,
          check_in_time: now.toISOString(),
          geo_valid: geoValid,
          status: null,
        } as never,
        { onConflict: "teacher_id,date" }
      );
    if (error) throw AppError.fromSupabase(error, "attendance.checkIn");
  }

  async checkOut(staffId: string, date: string, geoValid: boolean): Promise<void> {
    const now = new Date();
    const { error } = await this.db
      .from("teacher_attendance")
      .upsert(
        {
          teacher_id: staffId,
          date,
          check_out_time: now.toISOString(),
          checkout_geo_valid: geoValid,
          check_out_status: null,
        } as never,
        { onConflict: "teacher_id,date" }
      );
    if (error) throw AppError.fromSupabase(error, "attendance.checkOut");
  }

  /**
   * Approve a check-in. Looks up the actual check_in_time (or the override),
   * derives on-time/late, and patches the row. Returns the resolved status
   * so the caller can update local state without re-reading the row.
   */
  async approveCheckIn(args: ApprovalArgs): Promise<CheckInResult> {
    const { data: attRecord, error: lookupErr } = await this.db
      .from("teacher_attendance")
      .select("check_in_time")
      .eq("teacher_id", args.staffId)
      .eq("date", args.date)
      .single();
    if (lookupErr) throw AppError.fromSupabase(lookupErr, "attendance lookup");

    const checkIn = args.overrideTime
      ? new Date(args.overrideTime)
      : attRecord?.check_in_time
      ? new Date(attRecord.check_in_time)
      : new Date();

    const status = deriveCheckInStatus(checkIn);
    const update: Record<string, unknown> = { status: dbCheckInStatus(status) };
    if (args.comments) update.comments = args.comments;
    if (args.overrideTime) update.override_check_in_time = args.overrideTime;

    const { error } = await this.db
      .from("teacher_attendance")
      .update(update as never)
      .eq("teacher_id", args.staffId)
      .eq("date", args.date);
    if (error) throw AppError.fromSupabase(error, "attendance.approveCheckIn");

    return { status, time: formatTime(checkIn) };
  }

  async approveCheckOut(args: ApprovalArgs): Promise<CheckOutResult> {
    const { data: attRecord, error: lookupErr } = await this.db
      .from("teacher_attendance")
      .select("check_out_time")
      .eq("teacher_id", args.staffId)
      .eq("date", args.date)
      .single();
    if (lookupErr) throw AppError.fromSupabase(lookupErr, "attendance lookup");

    const checkOut = args.overrideTime
      ? new Date(args.overrideTime)
      : attRecord?.check_out_time
      ? new Date(attRecord.check_out_time)
      : new Date();

    const status = deriveCheckOutStatus(checkOut);
    const update: Record<string, unknown> = { check_out_status: dbCheckOutStatus(status) };
    if (args.comments) update.comments = args.comments;
    if (args.overrideTime) update.override_check_out_time = args.overrideTime;

    const { error } = await this.db
      .from("teacher_attendance")
      .update(update as never)
      .eq("teacher_id", args.staffId)
      .eq("date", args.date);
    if (error) throw AppError.fromSupabase(error, "attendance.approveCheckOut");

    return { status, time: formatTime(checkOut) };
  }
}

export const attendanceService = new AttendanceService();
