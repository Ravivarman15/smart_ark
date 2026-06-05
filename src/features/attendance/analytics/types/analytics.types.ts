// ── Attendance analytics domain types ────────────────────────────────────────
// App-facing shapes the analytics pages render. Computed entirely from live
// attendance data by the analytics services (no dummy data). Designed so the
// Phase-4 Reports module can consume them directly (no duplicate calculations).

import type { StudentAttendanceStatus } from "../../types/attendance.types";

export type RiskLevel = "low" | "medium" | "high" | "critical";

/** Generic chart point (label + value, optional colour). */
export interface SeriesPoint {
  label: string;
  value: number;
  color?: string;
}

/** One cell of the calendar / grid heatmap. */
export interface HeatCell {
  row: string;
  col: string;
  value: number;          // present % (0–100) or count
  status?: StudentAttendanceStatus | "none";
  date?: string;
}

// ── Filters ──────────────────────────────────────────────────────────────────
export interface StudentAnalyticsFilters {
  academicYearId?: string;
  courseTypeId?: string;
  standardId?: string;
  batchId?: string;
  from: string;
  to: string;
}

export interface StaffAnalyticsRange {
  from: string;
  to: string;
  staffId?: string;
}

// ── Student analytics ────────────────────────────────────────────────────────
export interface StudentKpis {
  totalStudents: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  medicalToday: number;
  excusedToday: number;
  halfDayToday: number;
  rangePct: number;     // attendance % over the selected range
  monthPct: number;     // month-to-date
  yearPct: number;      // year-to-date
}

export interface DefaulterRow {
  studentId: string;
  studentName: string;
  rollNumber?: string;
  batchName?: string;
  standardName?: string;
  attendancePct: number;
  daysMissed: number;
  totalDays: number;
  consecutiveAbsence: number;
  riskLevel: RiskLevel;
}

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  batchName?: string;
  attendancePct: number;
  delta?: number; // for "most improved"
}

export interface GroupStat {
  id: string;
  name: string;
  attendancePct: number;
  present: number;
  absent: number;
  late: number;
  total: number;
}

export interface StudentAnalytics {
  kpis: StudentKpis;
  dailyTrend: SeriesPoint[];
  monthlyTrend: SeriesPoint[];
  defaulters: DefaulterRow[];
  consecutiveBuckets: { threshold: number; count: number }[];
  topAttendance: LeaderboardEntry[];
  mostImproved: LeaderboardEntry[];
  batchComparison: GroupStat[];
  standardComparison: GroupStat[];
  heatmap: HeatCell[];
}

// ── Staff analytics ──────────────────────────────────────────────────────────
export interface StaffKpis {
  totalStaff: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  leaveToday: number;
  avgWorkedMinutes: number;
  attendancePct: number;
}

export interface StaffWorkHours {
  expectedMinutes: number;
  workedMinutes: number;
  remainingMinutes: number;
  overtimeMinutes: number;
}

export interface StaffPerfRow {
  staffId: string;
  staffName: string;
  role?: string;
  attendancePct: number;
  lateCount: number;
  earlyExitCount: number;
  overtimeMinutes: number;
  avgWorkedMinutes: number;
  days: number;
}

export interface StaffRankingEntry {
  staffId: string;
  staffName: string;
  value: number;
  unit?: string;
}

export interface StaffAnalytics {
  kpis: StaffKpis;
  workHours: StaffWorkHours;
  performance: StaffPerfRow[];
  bestAttendance: StaffRankingEntry[];
  mostPunctual: StaffRankingEntry[];
  highestHours: StaffRankingEntry[];
  mostImproved: StaffRankingEntry[];
  lateTrend: SeriesPoint[];
  overtimeTrend: SeriesPoint[];
}

// ── Risk analytics ───────────────────────────────────────────────────────────
export interface StudentRiskRow extends DefaulterRow {
  riskScore: number;
  reason: string;
}

export interface StaffRiskRow {
  staffId: string;
  staffName: string;
  role?: string;
  attendancePct: number;
  lateCount: number;
  riskScore: number;
  riskLevel: RiskLevel;
  reason: string;
}

export interface RiskAnalytics {
  studentRisks: StudentRiskRow[];
  staffRisks: StaffRiskRow[];
}
