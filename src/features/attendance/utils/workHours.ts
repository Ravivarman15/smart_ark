// ── Work-hours engine ────────────────────────────────────────────────────────
// PURE functions: pass in/out timestamps + settings, get derived minutes.
// No React, no Supabase. All staff work-time policy lives here so a "shift
// change" is a single-file edit. The same engine computes the columns we
// persist on staff_attendance AND the dashboard aggregates the UI reads back.

import type {
  AttendanceSettings,
  StaffAttendanceRecord,
  StaffAttendanceStatus,
  WorkHours,
} from "../types/attendance.types";

/** Sensible defaults used before settings load / when the row is missing. */
export const DEFAULT_SETTINGS: AttendanceSettings = {
  instituteStartTime: "09:00",
  instituteEndTime: "17:00",
  lateThresholdMinutes: 10,
  expectedDailyMinutes: 480,
  expectedWeeklyMinutes: 2400,
  attendanceMinPct: 75,
  autoNotifications: false,
  correctionApprovalRequired: false,
};

/** "HH:MM" or "HH:MM:SS" → minutes since midnight. */
export const parseTimeToMinutes = (time: string): number => {
  const [h = "0", m = "0"] = (time ?? "").split(":");
  return Number(h) * 60 + Number(m);
};

/** Minutes since local midnight for an ISO timestamp. */
const timeOfDayMinutes = (iso: string): number => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/** Whole minutes between two ISO timestamps (clamped at 0). */
export const minutesBetween = (fromIso: string, toIso: string): number => {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return ms > 0 ? Math.round(ms / 60000) : 0;
};

/** Expected minutes for a day given the status (half-day counts half). */
export const expectedForStatus = (
  status: StaffAttendanceStatus,
  settings: AttendanceSettings,
): number => {
  if (status === "absent" || status === "leave") return 0;
  if (status === "half_day") return Math.round(settings.expectedDailyMinutes / 2);
  return settings.expectedDailyMinutes;
};

/**
 * Derive the full work-hours breakdown for one day.
 * - worked     = out − in (0 if either missing)
 * - expected   = per-status expectation
 * - remaining  = max(expected − worked, 0)
 * - overtime   = max(worked − expected, 0)
 * - late       = minutes after (start + threshold) the staff checked in
 * - earlyExit  = minutes before institute end the staff checked out
 * - pct        = min(worked / expected, 1) × 100
 */
export const computeWorkHours = (
  inIso: string | undefined,
  outIso: string | undefined,
  settings: AttendanceSettings,
  status: StaffAttendanceStatus = "present",
): WorkHours => {
  const expectedMinutes = expectedForStatus(status, settings);
  const workedMinutes = inIso && outIso ? minutesBetween(inIso, outIso) : 0;

  let lateMinutes = 0;
  if (inIso) {
    const allowed = parseTimeToMinutes(settings.instituteStartTime) + settings.lateThresholdMinutes;
    lateMinutes = Math.max(timeOfDayMinutes(inIso) - allowed, 0);
  }

  let earlyExitMinutes = 0;
  if (outIso) {
    const end = parseTimeToMinutes(settings.instituteEndTime);
    earlyExitMinutes = Math.max(end - timeOfDayMinutes(outIso), 0);
  }

  const remainingMinutes = Math.max(expectedMinutes - workedMinutes, 0);
  const overtimeMinutes = Math.max(workedMinutes - expectedMinutes, 0);
  const attendancePct =
    expectedMinutes > 0 ? Math.round(Math.min(workedMinutes / expectedMinutes, 1) * 100) : 0;

  return {
    workedMinutes,
    expectedMinutes,
    remainingMinutes,
    overtimeMinutes,
    lateMinutes,
    earlyExitMinutes,
    attendancePct,
  };
};

/** Human-friendly "7h 30m" from minutes. */
export const formatMinutes = (minutes: number): string => {
  const m = Math.max(Math.round(minutes), 0);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
};

/** Aggregate a set of staff records (e.g. a week / month for one person). */
export interface WorkHoursAggregate {
  days: number;
  presentDays: number;
  workedMinutes: number;
  expectedMinutes: number;
  overtimeMinutes: number;
  lateCount: number;
  leaveCount: number;
  attendancePct: number;
}

export const aggregateWorkHours = (records: StaffAttendanceRecord[]): WorkHoursAggregate => {
  const agg: WorkHoursAggregate = {
    days: records.length,
    presentDays: 0,
    workedMinutes: 0,
    expectedMinutes: 0,
    overtimeMinutes: 0,
    lateCount: 0,
    leaveCount: 0,
    attendancePct: 0,
  };
  for (const r of records) {
    agg.workedMinutes += r.workedMinutes;
    agg.expectedMinutes += r.expectedMinutes;
    agg.overtimeMinutes += r.overtimeMinutes;
    if (r.status === "present" || r.status === "late" || r.status === "half_day") agg.presentDays += 1;
    if (r.status === "late" || r.lateMinutes > 0) agg.lateCount += 1;
    if (r.status === "leave" || r.status === "absent") agg.leaveCount += 1;
  }
  agg.attendancePct =
    agg.expectedMinutes > 0
      ? Math.round(Math.min(agg.workedMinutes / agg.expectedMinutes, 1) * 100)
      : 0;
  return agg;
};
