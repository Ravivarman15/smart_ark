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
  | "other";

export type ExamStatus =
  | "draft"
  | "scheduled"
  | "ongoing"
  | "completed"
  | "cancelled";

/** Lifecycle of an exam's marks. */
export type ResultsStatus = "pending" | "published" | "locked";

export const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: "unit_test", label: "Unit Test" },
  { value: "midterm", label: "Mid-term" },
  { value: "final", label: "Final Exam" },
  { value: "practical", label: "Practical" },
  { value: "assignment", label: "Assignment" },
  { value: "other", label: "Other" },
];

// ── Grading ──────────────────────────────────────────────────────────────────
/** One band of a grading scheme — inclusive percentage range. */
export interface GradeBand {
  grade: string;
  minPct: number;
  maxPct: number;
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
  standardId?: string;
  standardName?: string;
  batchId?: string;
  batchName?: string;
  subjectId?: string;
  subjectName?: string;
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
  standardId?: string | null;
  standardName?: string | null;
  batchId?: string | null;
  batchName?: string | null;
  subjectId?: string | null;
  subjectName?: string | null;
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
  topperName?: string;
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
