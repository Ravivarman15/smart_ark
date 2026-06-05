// Pure attendance automation engine. NO React, NO Supabase.
// Risk scoring (0–100), severity mapping and alert builders that turn live
// analytics output into dedupe-keyed alert rows.

import type { DefaulterRow, StaffPerfRow, RiskLevel } from "../../analytics/types/analytics.types";
import type { AlertInput, AlertSeverity } from "../types/automation.types";

// ── Risk engine (0–100) ───────────────────────────────────────────────────────
// Composite score from the four factors the spec calls out:
//   attendance % (lower → higher risk), consecutive absence, late arrivals,
//   and an attendance trend penalty (days missed proxy).
export interface StudentRiskFactors {
  attendancePct: number;
  consecutiveAbsence: number;
  daysMissed: number;
  lateCount?: number;
}

export const computeStudentRiskScore = (f: StudentRiskFactors): number => {
  // Attendance shortfall: up to 50 points (0% → 50, 100% → 0).
  const shortfall = Math.max(0, 100 - f.attendancePct);
  const attendanceComp = Math.min(50, shortfall * 0.5);
  // Consecutive absence: up to 30 points (caps at 10 days).
  const streakComp = Math.min(30, f.consecutiveAbsence * 3);
  // Days missed volume: up to 12 points.
  const missedComp = Math.min(12, f.daysMissed * 1.5);
  // Late arrivals: up to 8 points.
  const lateComp = Math.min(8, (f.lateCount ?? 0) * 2);
  return Math.round(Math.min(100, attendanceComp + streakComp + missedComp + lateComp));
};

export interface StaffRiskFactors {
  attendancePct: number;
  lateCount: number;
  earlyExitCount: number;
}

export const computeStaffRiskScore = (f: StaffRiskFactors): number => {
  const shortfall = Math.max(0, 100 - f.attendancePct);
  const attendanceComp = Math.min(55, shortfall * 0.6);
  const lateComp = Math.min(30, f.lateCount * 4);
  const earlyComp = Math.min(15, f.earlyExitCount * 3);
  return Math.round(Math.min(100, attendanceComp + lateComp + earlyComp));
};

export const riskLevelFromScore = (score: number): RiskLevel => {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
};

const severityFromRisk = (level: RiskLevel): AlertSeverity => level;

// ── Dedupe keys ────────────────────────────────────────────────────────────────
// One open alert per subject + kind + period so repeated scans converge.
export const studentDedupe = (studentId: string, kind: string, period: string): string =>
  `student:${studentId}:${kind}:${period}`;
export const staffDedupe = (staffId: string, kind: string, period: string): string =>
  `staff:${staffId}:${kind}:${period}`;

// ── Student alert builders ─────────────────────────────────────────────────────
const DEFAULTER_BANDS: { type: AlertInput["alertType"]; threshold: number }[] = [
  { type: "defaulter_50", threshold: 50 },
  { type: "defaulter_60", threshold: 60 },
  { type: "defaulter_75", threshold: 75 },
];

const STREAK_BANDS: { type: AlertInput["alertType"]; days: number }[] = [
  { type: "streak_10", days: 10 },
  { type: "streak_7", days: 7 },
  { type: "streak_5", days: 5 },
  { type: "streak_3", days: 3 },
];

/**
 * Build student alerts (defaulter band + consecutive-absence band) from the
 * analytics defaulter rows. Each student raises at most one defaulter alert (the
 * lowest band breached) and one streak alert (the highest band breached).
 */
export const buildStudentAlerts = (defaulters: DefaulterRow[], period: string): AlertInput[] => {
  const out: AlertInput[] = [];
  for (const d of defaulters) {
    const riskScore = computeStudentRiskScore({
      attendancePct: d.attendancePct,
      consecutiveAbsence: d.consecutiveAbsence,
      daysMissed: d.daysMissed,
    });
    const riskLevel = riskLevelFromScore(riskScore);

    // Defaulter band — lowest threshold the student is below.
    const band = DEFAULTER_BANDS.find((b) => d.attendancePct < b.threshold);
    if (band) {
      out.push({
        alertType: band.type,
        category: "student",
        severity: severityFromRisk(riskLevel),
        subjectId: d.studentId,
        subjectName: d.studentName,
        batchName: d.batchName,
        title: `${d.studentName} attendance ${d.attendancePct}% (below ${band.threshold}%)`,
        message: `Attendance ${d.attendancePct}% over the period — ${d.daysMissed} day(s) missed.`,
        metricValue: d.attendancePct,
        threshold: band.threshold,
        riskScore,
        riskLevel,
        dedupeKey: studentDedupe(d.studentId, band.type, period),
      });
    }

    // Consecutive-absence band — highest threshold reached.
    const streak = STREAK_BANDS.find((b) => d.consecutiveAbsence >= b.days);
    if (streak) {
      out.push({
        alertType: streak.type,
        category: "student",
        severity: severityFromRisk(riskLevelFromScore(Math.max(riskScore, 50))),
        subjectId: d.studentId,
        subjectName: d.studentName,
        batchName: d.batchName,
        title: `${d.studentName} absent ${d.consecutiveAbsence} days in a row`,
        message: `Consecutive absence of ${d.consecutiveAbsence} day(s).`,
        metricValue: d.consecutiveAbsence,
        threshold: streak.days,
        riskScore: Math.max(riskScore, 50),
        riskLevel: riskLevelFromScore(Math.max(riskScore, 50)),
        dedupeKey: studentDedupe(d.studentId, streak.type, period),
      });
    }
  }
  return out;
};

// ── Staff alert builders ───────────────────────────────────────────────────────
export interface StaffScanThresholds {
  minPct: number;        // attendance % target
  maxLate: number;       // late count that triggers an alert
  maxEarlyExit: number;  // early/short exits that trigger an alert
}

export const buildStaffAlerts = (
  performance: StaffPerfRow[],
  t: StaffScanThresholds,
  period: string,
): AlertInput[] => {
  const out: AlertInput[] = [];
  for (const p of performance) {
    const riskScore = computeStaffRiskScore({
      attendancePct: p.attendancePct,
      lateCount: p.lateCount,
      earlyExitCount: p.earlyExitCount,
    });
    const riskLevel = riskLevelFromScore(riskScore);

    if (p.attendancePct < t.minPct) {
      out.push({
        alertType: "staff_low",
        category: "staff",
        severity: severityFromRisk(riskLevel),
        subjectId: p.staffId,
        subjectName: p.staffName,
        title: `${p.staffName} attendance ${p.attendancePct}% (below ${t.minPct}%)`,
        message: `Staff attendance ${p.attendancePct}% over the period.`,
        metricValue: p.attendancePct,
        threshold: t.minPct,
        riskScore,
        riskLevel,
        dedupeKey: staffDedupe(p.staffId, "staff_low", period),
      });
    }
    if (p.lateCount >= t.maxLate) {
      out.push({
        alertType: "staff_late",
        category: "staff",
        severity: p.lateCount >= t.maxLate * 2 ? "high" : "medium",
        subjectId: p.staffId,
        subjectName: p.staffName,
        title: `${p.staffName} late ${p.lateCount} times`,
        message: `Frequent late arrivals: ${p.lateCount} in the period.`,
        metricValue: p.lateCount,
        threshold: t.maxLate,
        riskScore,
        riskLevel,
        dedupeKey: staffDedupe(p.staffId, "staff_late", period),
      });
    }
    if (p.earlyExitCount >= t.maxEarlyExit) {
      out.push({
        alertType: "staff_early_exit",
        category: "staff",
        severity: "medium",
        subjectId: p.staffId,
        subjectName: p.staffName,
        title: `${p.staffName} ${p.earlyExitCount} early/short exits`,
        message: `Excessive early or short exits: ${p.earlyExitCount}.`,
        metricValue: p.earlyExitCount,
        threshold: t.maxEarlyExit,
        riskScore,
        riskLevel,
        dedupeKey: staffDedupe(p.staffId, "staff_early_exit", period),
      });
    }
  }
  return out;
};

// ── Labels ──────────────────────────────────────────────────────────────────────
export const ALERT_TYPE_LABEL: Record<string, string> = {
  defaulter_75: "Defaulter < 75%",
  defaulter_60: "Defaulter < 60%",
  defaulter_50: "Defaulter < 50%",
  streak_3: "Absent 3+ days",
  streak_5: "Absent 5+ days",
  streak_7: "Absent 7+ days",
  streak_10: "Absent 10+ days",
  staff_late: "Frequent late",
  staff_low: "Low attendance",
  staff_early_exit: "Early/short exits",
  staff_missing_checkout: "Missing check-out",
};

export const SEVERITY_TONE: Record<AlertSeverity, string> = {
  low: "border-slate-500/40 bg-slate-500/10 text-slate-700",
  medium: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  high: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  critical: "border-rose-500/40 bg-rose-500/10 text-rose-700",
};
