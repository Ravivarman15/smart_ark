// ── Attendance analytics aggregation — PURE functions ────────────────────────
// No React, no Supabase. Single-pass reducers over already-fetched rows so the
// services stay thin and the Phase-4 Reports module can reuse the exact same
// math (no duplicate calculations). All percentage logic lives here.

import type {
  DefaulterRow,
  GroupStat,
  LeaderboardEntry,
  RiskLevel,
  SeriesPoint,
} from "../types/analytics.types";
import type {
  StaffAttendanceRecord,
  StudentAttendanceStatus,
} from "../../types/attendance.types";
import { formatDate } from "../../utils/dates";

// Statuses that count as "attended" in the numerator.
const STUDENT_PRESENTISH = new Set<StudentAttendanceStatus>(["present", "late", "half_day"]);
// Holidays don't count for or against attendance (excluded from denominator).
const isCounted = (s: string) => s !== "holiday";

export interface StudentAttRow {
  studentId: string;
  batchId?: string;
  date: string;
  status: StudentAttendanceStatus;
}

export interface RosterEntry {
  id: string;
  name: string;
  rollNumber?: string;
  batchId?: string;
  batchName?: string;
  standardId?: string;
  standardName?: string;
}

export const pct = (num: number, den: number): number =>
  den > 0 ? Math.round((num / den) * 100) : 0;

// ── Per-student rollup ───────────────────────────────────────────────────────
interface StudentAgg {
  present: number;
  absent: number;
  total: number;          // counted (non-holiday) days
  byDateAsc: { date: string; status: StudentAttendanceStatus }[];
}

export const rollupStudents = (rows: StudentAttRow[]): Map<string, StudentAgg> => {
  const map = new Map<string, StudentAgg>();
  for (const r of rows) {
    let a = map.get(r.studentId);
    if (!a) {
      a = { present: 0, absent: 0, total: 0, byDateAsc: [] };
      map.set(r.studentId, a);
    }
    if (isCounted(r.status)) {
      a.total += 1;
      if (STUDENT_PRESENTISH.has(r.status)) a.present += 1;
      if (r.status === "absent") a.absent += 1;
    }
    a.byDateAsc.push({ date: r.date, status: r.status });
  }
  // sort each student's days once for streak + improvement math.
  for (const a of map.values()) a.byDateAsc.sort((x, y) => x.date.localeCompare(y.date));
  return map;
};

/** Trailing consecutive 'absent' count from the most recent recorded day. */
export const currentAbsenceStreak = (days: { status: StudentAttendanceStatus }[]): number => {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].status === "absent") streak += 1;
    else break;
  }
  return streak;
};

export const studentRiskLevel = (attendancePct: number, streak: number): RiskLevel => {
  if (attendancePct < 50 || streak >= 7) return "critical";
  if (attendancePct < 60 || streak >= 5) return "high";
  if (attendancePct < 75 || streak >= 3) return "medium";
  return "low";
};

/** Build the defaulter list (everyone, sorted worst-first; pages filter by threshold). */
export const buildDefaulters = (
  agg: Map<string, StudentAgg>,
  roster: Map<string, RosterEntry>,
): DefaulterRow[] => {
  const out: DefaulterRow[] = [];
  for (const [id, a] of agg) {
    if (a.total === 0) continue;
    const r = roster.get(id);
    const p = pct(a.present, a.total);
    const streak = currentAbsenceStreak(a.byDateAsc);
    out.push({
      studentId: id,
      studentName: r?.name ?? "Student",
      rollNumber: r?.rollNumber,
      batchName: r?.batchName,
      standardName: r?.standardName,
      attendancePct: p,
      daysMissed: a.absent,
      totalDays: a.total,
      consecutiveAbsence: streak,
      riskLevel: studentRiskLevel(p, streak),
    });
  }
  return out.sort((x, y) => x.attendancePct - y.attendancePct);
};

/** Count of students whose current absence streak ≥ each threshold. */
export const consecutiveBuckets = (defaulters: DefaulterRow[]): { threshold: number; count: number }[] =>
  [3, 5, 7, 10].map((threshold) => ({
    threshold,
    count: defaulters.filter((d) => d.consecutiveAbsence >= threshold).length,
  }));

// ── Trends ───────────────────────────────────────────────────────────────────
const trendBy = (
  rows: StudentAttRow[],
  keyOf: (date: string) => string,
  labelOf: (key: string) => string,
): SeriesPoint[] => {
  const map = new Map<string, { num: number; den: number }>();
  for (const r of rows) {
    if (!isCounted(r.status)) continue;
    const k = keyOf(r.date);
    const e = map.get(k) ?? { num: 0, den: 0 };
    e.den += 1;
    if (STUDENT_PRESENTISH.has(r.status)) e.num += 1;
    map.set(k, e);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ label: labelOf(k), value: pct(v.num, v.den) }));
};

export const dailyTrend = (rows: StudentAttRow[]): SeriesPoint[] =>
  trendBy(rows, (d) => d, (k) => formatDate(k).slice(0, 6));

const formatMonthLabel = (k: string): string => {
  const [year, month] = k.split("-");
  if (!year || !month) return k;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mIdx = parseInt(month, 10) - 1;
  if (mIdx < 0 || mIdx > 11) return k;
  return `${months[mIdx]} '${year.slice(2)}`;
};

export const monthlyTrend = (rows: StudentAttRow[]): SeriesPoint[] =>
  trendBy(rows, (d) => d.slice(0, 7), formatMonthLabel);

// ── Group comparison (batch / standard) ──────────────────────────────────────
export const groupComparison = (
  rows: StudentAttRow[],
  groupIdOf: (r: StudentAttRow) => string | undefined,
  nameOf: (id: string) => string,
): GroupStat[] => {
  const map = new Map<string, GroupStat>();
  for (const r of rows) {
    if (!isCounted(r.status)) continue;
    const gid = groupIdOf(r);
    if (!gid) continue;
    let g = map.get(gid);
    if (!g) {
      g = { id: gid, name: nameOf(gid), attendancePct: 0, present: 0, absent: 0, late: 0, total: 0 };
      map.set(gid, g);
    }
    g.total += 1;
    if (r.status === "present") g.present += 1;
    else if (r.status === "absent") g.absent += 1;
    else if (r.status === "late") g.late += 1;
    else if (STUDENT_PRESENTISH.has(r.status)) g.present += 1;
  }
  const out = [...map.values()];
  for (const g of out) g.attendancePct = pct(g.present + g.late, g.total);
  return out.sort((a, b) => b.attendancePct - a.attendancePct);
};

// ── Leaderboards ─────────────────────────────────────────────────────────────
export const topAttendance = (
  agg: Map<string, StudentAgg>,
  roster: Map<string, RosterEntry>,
  limit = 10,
  minDays = 3,
): LeaderboardEntry[] => {
  const out: LeaderboardEntry[] = [];
  for (const [id, a] of agg) {
    if (a.total < minDays) continue;
    const r = roster.get(id);
    out.push({
      studentId: id,
      studentName: r?.name ?? "Student",
      batchName: r?.batchName,
      attendancePct: pct(a.present, a.total),
    });
  }
  return out.sort((x, y) => y.attendancePct - x.attendancePct).slice(0, limit);
};

/** Most improved = second-half attendance % minus first-half. */
export const mostImproved = (
  agg: Map<string, StudentAgg>,
  roster: Map<string, RosterEntry>,
  limit = 10,
  minDays = 4,
): LeaderboardEntry[] => {
  const out: LeaderboardEntry[] = [];
  for (const [id, a] of agg) {
    const counted = a.byDateAsc.filter((d) => isCounted(d.status));
    if (counted.length < minDays) continue;
    const mid = Math.floor(counted.length / 2);
    const first = counted.slice(0, mid);
    const second = counted.slice(mid);
    const firstPct = pct(first.filter((d) => STUDENT_PRESENTISH.has(d.status)).length, first.length);
    const secondPct = pct(second.filter((d) => STUDENT_PRESENTISH.has(d.status)).length, second.length);
    const r = roster.get(id);
    out.push({
      studentId: id,
      studentName: r?.name ?? "Student",
      batchName: r?.batchName,
      attendancePct: secondPct,
      delta: secondPct - firstPct,
    });
  }
  return out.filter((e) => (e.delta ?? 0) > 0).sort((x, y) => (y.delta ?? 0) - (x.delta ?? 0)).slice(0, limit);
};

// ── Heatmap (institute / batch / standard — per-day present %) ────────────────
export interface HeatDay {
  date: string;
  pct: number;
  hasData: boolean;
}

export const dailyPctDays = (rows: StudentAttRow[], from: string, to: string): HeatDay[] => {
  const map = new Map<string, { num: number; den: number }>();
  for (const r of rows) {
    if (!isCounted(r.status)) continue;
    const e = map.get(r.date) ?? { num: 0, den: 0 };
    e.den += 1;
    if (STUDENT_PRESENTISH.has(r.status)) e.num += 1;
    map.set(r.date, e);
  }
  const out: HeatDay[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    const e = map.get(cur);
    out.push({ date: cur, pct: e ? pct(e.num, e.den) : 0, hasData: !!e });
    const d = new Date(`${cur}T00:00:00`);
    d.setDate(d.getDate() + 1);
    cur = d.toISOString().split("T")[0];
    guard += 1;
  }
  return out;
};

// ── Staff aggregation ────────────────────────────────────────────────────────
const STAFF_PRESENTISH = new Set(["present", "late", "half_day"]);

export const staffAttendancePct = (records: StaffAttendanceRecord[]): number => {
  let num = 0;
  let den = 0;
  for (const r of records) {
    den += 1;
    if (STAFF_PRESENTISH.has(r.status)) num += 1;
  }
  return pct(num, den);
};

export interface StaffPerf {
  staffId: string;
  staffName: string;
  role?: string;
  attendancePct: number;
  lateCount: number;
  earlyExitCount: number;
  overtimeMinutes: number;
  avgWorkedMinutes: number;
  days: number;
  firstHalfPct: number;
  secondHalfPct: number;
}

export const staffPerformance = (records: StaffAttendanceRecord[]): StaffPerf[] => {
  const map = new Map<string, StaffAttendanceRecord[]>();
  for (const r of records) map.set(r.staffId, [...(map.get(r.staffId) ?? []), r]);

  const out: StaffPerf[] = [];
  for (const [staffId, recs] of map) {
    recs.sort((a, b) => a.date.localeCompare(b.date));
    let worked = 0;
    let overtime = 0;
    let lateCount = 0;
    let earlyExit = 0;
    for (const r of recs) {
      worked += r.workedMinutes;
      overtime += r.overtimeMinutes;
      if (r.status === "late" || r.lateMinutes > 0) lateCount += 1;
      if (r.status !== "absent" && r.status !== "leave" && r.outTime && r.workedMinutes < r.expectedMinutes) {
        earlyExit += 1;
      }
    }
    const mid = Math.floor(recs.length / 2);
    const firstHalf = recs.slice(0, mid);
    const secondHalf = recs.slice(mid);
    out.push({
      staffId,
      staffName: recs[0]?.staffName ?? "Staff",
      role: recs[0]?.role,
      attendancePct: staffAttendancePct(recs),
      lateCount,
      earlyExitCount: earlyExit,
      overtimeMinutes: overtime,
      avgWorkedMinutes: recs.length > 0 ? Math.round(worked / recs.length) : 0,
      days: recs.length,
      firstHalfPct: staffAttendancePct(firstHalf),
      secondHalfPct: staffAttendancePct(secondHalf),
    });
  }
  return out;
};

export const staffMonthlySeries = (
  records: StaffAttendanceRecord[],
  valueOf: (recs: StaffAttendanceRecord[]) => number,
): SeriesPoint[] => {
  const map = new Map<string, StaffAttendanceRecord[]>();
  for (const r of records) {
    const k = r.date.slice(0, 7);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, recs]) => ({ label: k, value: valueOf(recs) }));
};
