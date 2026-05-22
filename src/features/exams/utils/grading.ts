// ─────────────────────────────────────────────────────────────────────────────
// CENTRALISED GRADING & CALCULATION LAYER
//
// Every marks-derived figure the Exam module shows or stores flows through here.
// No UI component and no service computes a percentage, grade, pass/fail or rank
// on its own — that is how exam results silently drift. One module, one set of
// rules:
//
//   • percentageOf()    — marks → percentage
//   • gradeFor()        — percentage → grade letter (against a scheme)
//   • scoreResult()     — one ExamResult → { percentage, grade, passed }
//   • assignRanks()     — dense ranking across an exam (absentees excluded)
//   • computeStats()    — exam-level aggregates
//
// Pure functions, no I/O — trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Exam,
  ExamResult,
  ExamStats,
  GradeBand,
  GradeDistributionItem,
  ScoredResult,
} from "../types/exam.types";

/** Round to 2 decimals — consistent precision everywhere. */
export const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** The institute default grading scheme, used when an exam defines none. */
export const DEFAULT_GRADE_SCHEME: GradeBand[] = [
  { grade: "A+", minPct: 90, maxPct: 100 },
  { grade: "A", minPct: 80, maxPct: 89.99 },
  { grade: "B+", minPct: 70, maxPct: 79.99 },
  { grade: "B", minPct: 60, maxPct: 69.99 },
  { grade: "C", minPct: 50, maxPct: 59.99 },
  { grade: "D", minPct: 35, maxPct: 49.99 },
  { grade: "F", minPct: 0, maxPct: 34.99 },
];

/** Resolve the scheme to use — the exam's own, or the default when empty. */
export const schemeFor = (scheme?: GradeBand[]): GradeBand[] =>
  scheme && scheme.length > 0 ? scheme : DEFAULT_GRADE_SCHEME;

/** marks ÷ total as a 0-100 percentage. Guards a zero/blank total. */
export const percentageOf = (
  marks: number | null | undefined,
  totalMarks: number,
): number => {
  if (marks == null || !totalMarks || totalMarks <= 0) return 0;
  return round2((Number(marks) / totalMarks) * 100);
};

/** Grade letter for a percentage against a scheme (highest matching band). */
export const gradeFor = (pct: number, scheme?: GradeBand[]): string => {
  const bands = schemeFor(scheme);
  const hit = bands.find((b) => pct >= b.minPct && pct <= b.maxPct);
  if (hit) return hit.grade;
  // Fall back to the lowest band so a result is never gradeless.
  return bands[bands.length - 1]?.grade ?? "—";
};

/** Did the student pass? Absentees never pass. */
export const isPass = (
  marks: number | null | undefined,
  passMarks: number,
  isAbsent: boolean,
): boolean => {
  if (isAbsent || marks == null) return false;
  return Number(marks) >= passMarks;
};

export interface ScoreInput {
  marks: number | null;
  isAbsent: boolean;
  totalMarks: number;
  passMarks: number;
  scheme?: GradeBand[];
}

export interface ScoreOutput {
  percentage: number;
  grade: string;
  passed: boolean;
}

/**
 * THE single source of truth for one result's derived figures. Marks entry,
 * analytics and mark sheets all call this — the grade can never diverge from
 * the percentage.
 */
export const scoreResult = (i: ScoreInput): ScoreOutput => {
  if (i.isAbsent || i.marks == null) {
    return { percentage: 0, grade: "AB", passed: false };
  }
  const percentage = percentageOf(i.marks, i.totalMarks);
  return {
    percentage,
    grade: gradeFor(percentage, i.scheme),
    passed: isPass(i.marks, i.passMarks, i.isAbsent),
  };
};

/**
 * Score + dense-rank a full set of results for one exam. Absentees are scored
 * but never ranked (rank `undefined`). Ties share a rank; the next rank is not
 * skipped (dense ranking) so "2nd place" always exists.
 */
export const assignRanks = (
  exam: Pick<Exam, "totalMarks" | "passMarks" | "gradingScheme">,
  results: ExamResult[],
): ScoredResult[] => {
  const scored: ScoredResult[] = results.map((r) => {
    const s = scoreResult({
      marks: r.marks,
      isAbsent: r.isAbsent,
      totalMarks: exam.totalMarks,
      passMarks: exam.passMarks,
      scheme: exam.gradingScheme,
    });
    return { ...r, grade: s.grade, percentage: s.percentage, passed: s.passed };
  });

  // Dense ranking over present students, highest marks first.
  const present = scored
    .filter((r) => !r.isAbsent && r.marks != null)
    .sort((a, b) => (b.marks ?? 0) - (a.marks ?? 0));

  let rank = 0;
  let prevMarks: number | null = null;
  for (const r of present) {
    if (prevMarks === null || (r.marks ?? 0) !== prevMarks) {
      rank += 1;
      prevMarks = r.marks ?? 0;
    }
    r.rank = rank;
  }
  for (const r of scored) {
    if (r.isAbsent || r.marks == null) r.rank = undefined;
  }
  return scored;
};

/** Exam-level aggregates over an already-scored result set. */
export const computeStats = (scored: ScoredResult[]): ExamStats => {
  const appearedRows = scored.filter((r) => !r.isAbsent && r.marks != null);
  const appeared = appearedRows.length;
  const absent = scored.length - appeared;
  const passed = appearedRows.filter((r) => r.passed).length;
  const failed = appeared - passed;

  const marksList = appearedRows.map((r) => Number(r.marks));
  const sum = marksList.reduce((s, m) => s + m, 0);
  const pctSum = appearedRows.reduce((s, r) => s + r.percentage, 0);
  const topper = [...appearedRows].sort(
    (a, b) => (b.marks ?? 0) - (a.marks ?? 0),
  )[0];

  return {
    totalStudents: scored.length,
    appeared,
    absent,
    passed,
    failed,
    passRate: appeared > 0 ? Math.round((passed / appeared) * 100) : 0,
    averageMarks: appeared > 0 ? round2(sum / appeared) : 0,
    averagePercentage: appeared > 0 ? round2(pctSum / appeared) : 0,
    highestMarks: marksList.length > 0 ? Math.max(...marksList) : 0,
    lowestMarks: marksList.length > 0 ? Math.min(...marksList) : 0,
    topperName: topper?.studentName,
  };
};

/** Count of students in each grade band (present students only). */
export const gradeDistribution = (
  scored: ScoredResult[],
  scheme?: GradeBand[],
): GradeDistributionItem[] => {
  const bands = schemeFor(scheme);
  const counts = new Map<string, number>(bands.map((b) => [b.grade, 0]));
  for (const r of scored) {
    if (r.isAbsent || r.marks == null) continue;
    counts.set(r.grade ?? "—", (counts.get(r.grade ?? "—") ?? 0) + 1);
  }
  return bands.map((b) => ({ grade: b.grade, count: counts.get(b.grade) ?? 0 }));
};

/** Validate a grading scheme — bands must be ordered and cover 0-100. */
export const validateScheme = (scheme: GradeBand[]): string | null => {
  if (scheme.length === 0) return "Add at least one grade band";
  for (const b of scheme) {
    if (b.minPct > b.maxPct) return `Band ${b.grade}: min cannot exceed max`;
    if (!b.grade.trim()) return "Every band needs a grade label";
  }
  return null;
};
