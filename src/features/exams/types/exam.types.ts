// ─────────────────────────────────────────────────────────────────────────────
// Domain types for the Exam feature module (Manual Exam phase).
//
// App-facing camelCase shapes. Services map snake_case DB rows onto these so no
// other layer ever touches raw columns. The `mode` field reserves the model for
// the MCQ phase without a rebuild.
// ─────────────────────────────────────────────────────────────────────────────

export type ExamMode = "manual" | "mcq";

export type ExamType =
  | "unit_test"
  | "midterm"
  | "final"
  | "practical"
  | "assignment"
  | "weekly_test"
  | "monthly_test"
  | "mock_test"
  | "neet_test"
  | "jee_test"
  | "revision_test"
  | "other";

export type ExamStatus =
  | "draft"
  | "scheduled"
  | "ongoing"
  | "completed"
  | "cancelled";

/** Lifecycle of an exam's marks. */
export type ResultsStatus = "pending" | "published" | "locked";

/** Terms of an academic year — the mid-level of the exam session hierarchy. */
export type Term = "term_1" | "term_2" | "term_3";

/** Academic-calendar months (April-start, matching Indian academic years). */
export type ExamMonth =
  | "april"
  | "may"
  | "june"
  | "july"
  | "august"
  | "september"
  | "october"
  | "november"
  | "december"
  | "january"
  | "february"
  | "march";

/**
 * Per-student attendance for an exam. Supersedes the legacy `isAbsent` boolean
 * (kept in sync by the service: any non-"present" status ⇒ isAbsent=true).
 */
export type AttendanceStatus = "present" | "absent" | "medical" | "malpractice";

export const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: "unit_test", label: "Unit Test" },
  { value: "midterm", label: "Mid-term" },
  { value: "final", label: "Final Exam" },
  { value: "practical", label: "Practical" },
  { value: "assignment", label: "Assignment" },
  { value: "weekly_test", label: "Weekly Test" },
  { value: "monthly_test", label: "Monthly Test" },
  { value: "mock_test", label: "Mock Test" },
  { value: "neet_test", label: "NEET Test" },
  { value: "jee_test", label: "JEE Test" },
  { value: "revision_test", label: "Revision Test" },
  { value: "other", label: "Other" },
];

export const TERMS: { value: Term; label: string }[] = [
  { value: "term_1", label: "Term 1" },
  { value: "term_2", label: "Term 2" },
  { value: "term_3", label: "Term 3" },
];

export const EXAM_MONTHS: { value: ExamMonth; label: string; term: Term }[] = [
  { value: "april", label: "April", term: "term_1" },
  { value: "may", label: "May", term: "term_1" },
  { value: "june", label: "June", term: "term_1" },
  { value: "july", label: "July", term: "term_1" },
  { value: "august", label: "August", term: "term_2" },
  { value: "september", label: "September", term: "term_2" },
  { value: "october", label: "October", term: "term_2" },
  { value: "november", label: "November", term: "term_2" },
  { value: "december", label: "December", term: "term_3" },
  { value: "january", label: "January", term: "term_3" },
  { value: "february", label: "February", term: "term_3" },
  { value: "march", label: "March", term: "term_3" },
];

export const examTypeLabel = (t: string): string =>
  EXAM_TYPES.find((x) => x.value === t)?.label ?? t;
export const termLabel = (t?: string | null): string =>
  TERMS.find((x) => x.value === t)?.label ?? "";
export const monthLabel = (m?: string | null): string =>
  EXAM_MONTHS.find((x) => x.value === m)?.label ?? "";

// ── Grading ──────────────────────────────────────────────────────────────────
/** One band of a grading scheme — inclusive percentage range. */
export interface GradeBand {
  grade: string;
  minPct: number;
  maxPct: number;
}

/** A named, reusable grading scheme staff can pick when creating an exam. */
export interface GradingScheme {
  id: string;
  name: string;
  bands: GradeBand[];
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GradingSchemeInput {
  name: string;
  bands: GradeBand[];
  isDefault?: boolean;
}

export interface ExamAttachment {
  name: string;
  url: string;
}

// ── Exam ─────────────────────────────────────────────────────────────────────
export interface Exam {
  id: string;
  title: string;
  examType: ExamType;
  mode: ExamMode;
  /** Session hierarchy: Academic Year → Term → Month. */
  academicYearId?: string;
  academicYearName?: string;
  term?: Term;
  month?: ExamMonth;
  standardId?: string;
  standardName?: string;
  batchId?: string;
  batchName?: string;
  subjectId?: string;
  subjectName?: string;
  /** Assigned faculty (a staff profile). */
  facultyId?: string;
  facultyName?: string;
  totalMarks: number;
  passMarks: number;
  durationMinutes: number;
  instructions?: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  hall?: string;
  /** Empty → the module default scheme is used. */
  gradingScheme: GradeBand[];
  attachments: ExamAttachment[];
  status: ExamStatus;
  resultsStatus: ResultsStatus;
  campusId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Exam result (per student) ────────────────────────────────────────────────
export interface ExamResult {
  id: string;
  examId: string;
  studentId: string;
  studentName?: string;
  marks: number | null;
  isAbsent: boolean;
  /** Richer than isAbsent; defaults to present/absent when not set. */
  attendanceStatus?: AttendanceStatus;
  grade?: string;
  rank?: number;
  remarks?: string;
  enteredBy?: string;
  enteredAt?: string;
}

/** An ExamResult enriched with derived figures from the grading layer. */
export interface ScoredResult extends ExamResult {
  percentage: number;
  passed: boolean;
}

// ── Audit ────────────────────────────────────────────────────────────────────
export interface ExamAuditEntry {
  id: string;
  examId?: string;
  eventType: string;
  detail?: string;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

// ── Service inputs ───────────────────────────────────────────────────────────
export interface ExamInput {
  title: string;
  examType: ExamType;
  mode?: ExamMode;
  academicYearId?: string | null;
  academicYearName?: string | null;
  term?: Term | null;
  month?: ExamMonth | null;
  standardId?: string | null;
  standardName?: string | null;
  batchId?: string | null;
  batchName?: string | null;
  subjectId?: string | null;
  subjectName?: string | null;
  facultyId?: string | null;
  facultyName?: string | null;
  totalMarks: number;
  passMarks: number;
  durationMinutes: number;
  instructions?: string | null;
  examDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  hall?: string | null;
  gradingScheme?: GradeBand[];
  attachments?: ExamAttachment[];
  status?: ExamStatus;
}

export interface RescheduleInput {
  examDate: string;
  startTime?: string;
  endTime?: string;
  hall?: string;
}

/** One row submitted from the marks-entry grid. */
export interface MarksEntryRow {
  studentId: string;
  studentName?: string;
  marks: number | null;
  isAbsent: boolean;
  attendanceStatus?: AttendanceStatus;
  remarks?: string;
}

// ── Analytics ────────────────────────────────────────────────────────────────
export interface ExamStats {
  totalStudents: number;
  appeared: number;
  absent: number;
  passed: number;
  failed: number;
  passRate: number;
  averageMarks: number;
  averagePercentage: number;
  highestMarks: number;
  lowestMarks: number;
  /** Median mark across appeared students. */
  medianMarks: number;
  topperName?: string;
  /** Division bands over percentage (present students only). */
  distinction: number; // ≥ 75%
  firstClass: number; // 60–74.99%
  secondClass: number; // 50–59.99%
  thirdClass: number; // pass–49.99%
}

export interface GradeDistributionItem {
  grade: string;
  count: number;
}

export interface TopperRow {
  rank: number;
  studentName: string;
  marks: number;
  percentage: number;
  grade: string;
}

export interface ExamAnalytics {
  exam: Exam;
  stats: ExamStats;
  gradeDistribution: GradeDistributionItem[];
  toppers: TopperRow[];
  scored: ScoredResult[];
}

export interface ExamOverview {
  total: number;
  scheduled: number;
  completed: number;
  resultsPending: number;
  resultsPublished: number;
  upcoming: number;
}
