import { BaseService, AppError } from "@/shared/services";
import { DEFAULT_SETTINGS } from "../utils/workHours";
import type { AttendanceMarker, AttendanceSettings } from "../types/attendance.types";
import type { AttendanceSettingsForm } from "../schemas/attendance.schema";

const isSchemaCacheMiss = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("schema cache") || msg.includes("does not exist");
};

// DB `time` columns come back as "HH:MM:SS" — trim to the "HH:MM" the inputs use.
const hhmm = (t: string | null | undefined, fallback: string): string =>
  t ? t.slice(0, 5) : fallback;

/**
 * Single-row institute attendance policy. Read by everyone (drives the
 * work-hours engine + late thresholds); written by admin / management only
 * (enforced by RLS). Returns sensible defaults if the table/row isn't present
 * yet so the app never crashes pre-migration.
 */
class AttendanceSettingsService extends BaseService {
  private table() {
    return this.db.from("attendance_settings" as never);
  }

  async get(): Promise<AttendanceSettings> {
    const res = await this.table().select("*").limit(1);
    if (res.error) {
      if (isSchemaCacheMiss(res.error)) return DEFAULT_SETTINGS;
      throw AppError.fromSupabase(res.error, "attendance_settings");
    }
    const row = ((res.data ?? []) as Record<string, unknown>[])[0];
    if (!row) return DEFAULT_SETTINGS;
    return {
      instituteStartTime: hhmm(row.institute_start_time as string, DEFAULT_SETTINGS.instituteStartTime),
      instituteEndTime: hhmm(row.institute_end_time as string, DEFAULT_SETTINGS.instituteEndTime),
      lateThresholdMinutes: Number(row.late_threshold_minutes ?? DEFAULT_SETTINGS.lateThresholdMinutes),
      expectedDailyMinutes: Number(row.expected_daily_minutes ?? DEFAULT_SETTINGS.expectedDailyMinutes),
      expectedWeeklyMinutes: Number(row.expected_weekly_minutes ?? DEFAULT_SETTINGS.expectedWeeklyMinutes),
      attendanceMinPct: Number(row.attendance_min_pct ?? DEFAULT_SETTINGS.attendanceMinPct),
      autoNotifications: Boolean(row.auto_notifications ?? false),
      correctionApprovalRequired: Boolean(row.correction_approval_required ?? false),
      updatedAt: (row.updated_at as string) ?? undefined,
      updatedBy: (row.updated_by as string) ?? undefined,
    };
  }

  async update(form: AttendanceSettingsForm, marker?: AttendanceMarker): Promise<void> {
    const payload = {
      singleton: true,
      institute_start_time: form.instituteStartTime,
      institute_end_time: form.instituteEndTime,
      late_threshold_minutes: form.lateThresholdMinutes,
      expected_daily_minutes: form.expectedDailyMinutes,
      expected_weekly_minutes: form.expectedWeeklyMinutes,
      attendance_min_pct: form.attendanceMinPct,
      auto_notifications: form.autoNotifications,
      correction_approval_required: form.correctionApprovalRequired,
      updated_by: marker?.profileId ?? null,
      updated_at: new Date().toISOString(),
    };
    // Upsert on the `singleton` unique column keeps exactly one policy row.
    const res = await this.table().upsert(payload as never, { onConflict: "singleton" });
    if (res.error) throw AppError.fromSupabase(res.error, "attendance_settings.update");
  }
}

export const attendanceSettingsService = new AttendanceSettingsService();
