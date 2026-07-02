// ─────────────────────────────────────────────────────────────────────────────
// EXAM ANALYTICS — pure aggregation layer (Phase 5 / 11 / 13 / AI).
//
// Every advanced-analytics figure (comparisons, distributions, heat maps, risk,
// scholarship, prediction) is derived here from a flat list of already-scored
// rows (`ScoredRow`). No I/O — the service gathers the rows and grades them via
// the central grading layer, then these pure functions crunch them, so every
// dashboard/register number is consistent with marks entry and trivially
// unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_GRADE_SCHEME, mean, median, round2, stdDev } from "./grading";
import type { GradeDistributionItem } from "../types/exam.types";

/** One graded result enriched with its exam's session/context metadata. */
export interface ScoredRow {
  examId: string;
  examTitle: string;
  examType: string;
  academicYearId?: string;
  academicYearName?: string;
  term?: string;
  month?: string;
  standardId?: string;
  standardName?: string;
  batchId?: string;
  batchName?: string;
  subjectId?: string;
  subjectName?: string;
  facultyId?: string;
  facultyName?: string;
  examDate?: string;
  studentId: string;
  studentName: string;
  marks: number | null;
  percentage: number; // 0 when absent
  grade: string;
  passed: boolean;
  isAbsent: boolean;
  rank?: number; // per-exam dense rank (from the grading layer)
}

const present = (rows: ScoredRow[]): ScoredRow[] =>
  rows.filter((r) => !r.isAbsent && r.marks != null);

// ── School-wide stats ────────────────────────────────────────────────────────
export interface SchoolStats {
  totalResults: number;
  appeared: number;
  absent: number;
  passed: number;
  failed: number;
  passRate: number;
  failRate: number;
  averagePercentage: number;
  medianPercentage: number;
  stdDeviation: number;
  highestPercentage: number;
  lowestPercentage: number;
}

export const schoolStats = (rows: ScoredRow[]): SchoolStats => {
  const app = present(rows);
  const pct = app.map((r) => r.percentage);
  const passed = app.filter((r) => r.passed).length;
  const appeared = app.length;
  return {
    totalResults: rows.length,
    appeared,
    absent: rows.length - appeared,
    passed,
    failed: appeared - passed,
    passRate: appeared ? round2((passed / appeared) * 100) : 0,
    failRate: appeared ? round2(((appeared - passed) / appeared) * 100) : 0,
    averagePercentage: mean(pct),
    medianPercentage: median(pct),
    stdDeviation: stdDev(pct),
    highestPercentage: pct.length ? Math.max(...pct) : 0,
    lowestPercentage: pct.length ? Math.min(...pct) : 0,
  };
};

// ── Grouped comparison (subject / faculty / class / section / month / year) ────
export interface ComparisonRow {
  key: string;
  label: string;
  avgPercentage: number;
  passRate: number;
  appeared: number;
  highest: number;
  lowest: number;
}

export const groupComparison = (
  rows: ScoredRow[],
  keyOf: (r: ScoredRow) => string | undefined,
  labelOf: (r: ScoredRow) => string | undefined,
): ComparisonRow[] => {
  const map = new Map<string, ScoredRow[]>();
  for (const r of present(rows)) {
    const k = keyOf(r);
    if (!k) continue;
    (map.get(k) ?? map.set(k, []).get(k)!).push(r);
  }
  const out: ComparisonRow[] = [];
  for (const [key, group] of map) {
    const pct = group.map((r) => r.percentage);
    const passed = group.filter((r) => r.passed).length;
    out.push({
      key,
      label: labelOf(group[0]) ?? key,
      avgPercentage: mean(pct),
      passRate: round2((passed / group.length) * 100),
      appeared: group.length,
      highest: Math.max(...pct),
      lowest: Math.min(...pct),
    });
  }
  return out.sort((a, b) => b.avgPercentage - a.avgPercentage);
};

// Calendar order for month grouping (April-start academic year).
const MONTH_ORDER = [
  "april", "may", "june", "july", "august", "september",
  "october", "november", "december", "january", "february", "march",
];
export const monthTrend = (rows: ScoredRow[]): ComparisonRow[] =>
  groupComparison(rows, (r) => r.month, (r) => r.month).sort(
    (a, b) => MONTH_ORDER.indexOf(a.key) - MONTH_ORDER.indexOf(b.key),
  );

// ── Grade distribution over the whole set ─────────────────────────────────────
export const gradeSpread = (rows: ScoredRow[]): GradeDistributionItem[] => {
  const counts = new Map<string, number>(DEFAULT_GRADE_SCHEME.map((b) => [b.grade, 0]));
  for (const r of present(rows)) counts.set(r.grade, (counts.get(r.grade) ?? 0) + 1);
  return DEFAULT_GRADE_SCHEME.map((b) => ({ grade: b.grade, count: counts.get(b.grade) ?? 0 }));
};

// ── Rank distribution (top-band buckets, per-exam ranks) ──────────────────────
export interface RankBucket {
  band: string;
  count: number;
}
/** Buckets each result's per-exam rank into 1 / 2 / 3 / 4-10 / 10+ bands. */
export const rankDistribution = (rows: ScoredRow[]): RankBucket[] => {
  const bands = [
    { band: "Rank 1", test: (n: number) => n === 1 },
    { band: "Rank 2", test: (n: number) => n === 2 },
    { band: "Rank 3", test: (n: number) => n === 3 },
    { band: "Rank 4–10", test: (n: number) => n >= 4 && n <= 10 },
    { band: "Rank 10+", test: (n: number) => n > 10 },
  ];
  return bands.map((b) => ({
    band: b.band,
    count: rows.filter((r) => r.rank != null && b.test(r.rank)).length,
  }));
};

// ── Per-student aggregate (overall % across the set) ──────────────────────────
export interface StudentAggregate {
  studentId: string;
  studentName: string;
  standardName?: string;
  examsCount: number;
  averagePercentage: number;
  passRate: number;
  fails: number;
  trendDelta: number; // latest % minus earliest %
  predictedNext: number; // least-squares projection
  risk: "green" | "yellow" | "red";
}

const chronological = (rows: ScoredRow[]): ScoredRow[] =>
  [...rows].sort((a, b) => {
    const da = a.examDate ?? "";
    const db = b.examDate ?? "";
    if (da && db && da !== db) return da < db ? -1 : 1;
    return MONTH_ORDER.indexOf(a.month ?? "") - MONTH_ORDER.indexOf(b.month ?? "");
  });

/** Least-squares slope of y over index; used for the next-exam projection. */
const slope = (ys: number[]): number => {
  const n = ys.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - xm) * (y - ym);
    den += (x - xm) ** 2;
  });
  return den === 0 ? 0 : num / den;
};

export const studentAggregates = (rows: ScoredRow[]): StudentAggregate[] => {
  const byStudent = new Map<string, ScoredRow[]>();
  for (const r of present(rows)) {
    (byStudent.get(r.studentId) ?? byStudent.set(r.studentId, []).get(r.studentId)!).push(r);
  }
  const out: StudentAggregate[] = [];
  for (const [studentId, all] of byStudent) {
    const ordered = chronological(all);
    const pct = ordered.map((r) => r.percentage);
    const avg = mean(pct);
    const passRate = round2((all.filter((r) => r.passed).length / all.length) * 100);
    const fails = all.filter((r) => !r.passed).length;
    const trendDelta = pct.length >= 2 ? round2(pct[pct.length - 1] - pct[0]) : 0;
    const predictedNext = round2(
      Math.max(0, Math.min(100, avg + slope(pct) * ((pct.length - 1) / 2 + 1))),
    );
    const risk: StudentAggregate["risk"] =
      avg >= 60 && fails === 0 ? "green" : avg >= 40 ? "yellow" : "red";
    out.push({
      studentId,
      studentName: ordered[0].studentName,
      standardName: ordered[0].standardName,
      examsCount: all.length,
      averagePercentage: avg,
      passRate,
      fails,
      trendDelta,
      predictedNext,
      risk,
    });
  }
  return out;
};

export const topStudents = (aggs: StudentAggregate[], n = 10): StudentAggregate[] =>
  [...aggs].sort((a, b) => b.averagePercentage - a.averagePercentage).slice(0, n);

export const bottomStudents = (aggs: StudentAggregate[], n = 10): StudentAggregate[] =>
  [...aggs].sort((a, b) => a.averagePercentage - b.averagePercentage).slice(0, n);

export const mostImproved = (aggs: StudentAggregate[], n = 10): StudentAggregate[] =>
  [...aggs].filter((a) => a.trendDelta > 0).sort((a, b) => b.trendDelta - a.trendDelta).slice(0, n);

export const performanceDrops = (aggs: StudentAggregate[], n = 10): StudentAggregate[] =>
  [...aggs].filter((a) => a.trendDelta < 0).sort((a, b) => a.trendDelta - b.trendDelta).slice(0, n);

export const riskStudents = (aggs: StudentAggregate[]): StudentAggregate[] =>
  aggs.filter((a) => a.risk === "red").sort((a, b) => a.averagePercentage - b.averagePercentage);

export const scholarshipCandidates = (aggs: StudentAggregate[]): StudentAggregate[] =>
  aggs
    .filter((a) => a.averagePercentage >= 85 && a.fails === 0)
    .sort((a, b) => b.averagePercentage - a.averagePercentage);

// ── Heat map: section (row) × subject (col) → average % ───────────────────────
export interface HeatMap {
  rows: string[]; // section/class labels
  cols: string[]; // subject labels
  cells: number[][]; // avg % (rows × cols), -1 = no data
}

export const heatMap = (rows: ScoredRow[]): HeatMap => {
  const rowKeys = new Map<string, string>(); // key → label
  const colKeys = new Map<string, string>();
  const bucket = new Map<string, number[]>(); // `${rowKey}|${colKey}` → pct[]
  for (const r of present(rows)) {
    const rk = r.batchId ?? r.standardId ?? "—";
    const ck = r.subjectId ?? r.subjectName ?? "—";
    rowKeys.set(rk, r.batchName ?? r.standardName ?? "—");
    colKeys.set(ck, r.subjectName ?? "—");
    const key = `${rk}|${ck}`;
    (bucket.get(key) ?? bucket.set(key, []).get(key)!).push(r.percentage);
  }
  const rKeys = [...rowKeys.keys()];
  const cKeys = [...colKeys.keys()];
  const cells = rKeys.map((rk) =>
    cKeys.map((ck) => {
      const arr = bucket.get(`${rk}|${ck}`);
      return arr && arr.length ? mean(arr) : -1;
    }),
  );
  return {
    rows: rKeys.map((k) => rowKeys.get(k)!),
    cols: cKeys.map((k) => colKeys.get(k)!),
    cells,
  };
};
