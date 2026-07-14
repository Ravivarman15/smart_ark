// ─────────────────────────────────────────────────────────────────────────────
// Domain types for the MCQ Exam Engine + Student Attempt System.
//
// An MCQ exam reuses the `exams` row (mode = 'mcq') for scheduling and the
// `mcq_papers` system for content; `mcq_exams` holds the engine config. These
// types extend — never replace — exam.types.ts and mcq.types.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { McqQuestion, PaperQuestionView } from "./mcq.types";

export type LiveStatus = "not_started" | "live" | "paused" | "ended";
export type ResultRelease = "immediate" | "manual" | "scheduled";
export type AttemptStatus =
  | "in_progress"
  | "submitted"
  | "auto_submitted"
  | "abandoned";
export type AssignmentScope = "standard" | "batch" | "subject";

export const RESULT_RELEASE_OPTIONS: { value: ResultRelease; label: string }[] =
  [
    { value: "immediate", label: "Immediately after submission" },
    { value: "manual", label: "Manually released by staff" },
    { value: "scheduled", label: "At a scheduled time" },
  ];

// ── Assignment ───────────────────────────────────────────────────────────────
export interface ExamAssignment {
  id: string;
  examId: string;
  scopeType: AssignmentScope;
  scopeId?: string;
  scopeName?: string;
}

export interface AssignmentDraft {
  scopeType: AssignmentScope;
  scopeId: string;
  scopeName: string;
}

// ── MCQ exam (exams row + mcq_exams config, joined) ──────────────────────────
export interface McqExam {
  id: string; // = exams.id
  title: string;
  standardId?: string;
  standardName?: string;
  batchId?: string;
  batchName?: string;
  subjectId?: string;
  subjectName?: string;
  examDate?: string;
  instructions?: string;
  /** exams.status — draft | scheduled | ongoing | completed | cancelled. */
  status: string;
  // ── mcq_exams config ──
  paperId?: string;
  paperTitle?: string;
  durationMinutes: number;
  attemptLimit: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarking: boolean;
  passPercentage: number;
  windowStart?: string;
  windowEnd?: string;
  resultRelease: ResultRelease;
  resultReleaseAt?: string;
  /** exams.results_status === 'published' — the manual-release flag. */
  resultsPublished: boolean;
  liveStatus: LiveStatus;
  allowResume: boolean;
  // ── derived from the paper ──
  totalMarks: number;
  totalQuestions: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  assignments: ExamAssignment[];
}

export interface McqExamInput {
  title: string;
  paperId: string;
  standardId?: string | null;
  standardName?: string | null;
  batchId?: string | null;
  batchName?: string | null;
  subjectId?: string | null;
  subjectName?: string | null;
  examDate?: string | null;
  instructions?: string | null;
  durationMinutes: number;
  attemptLimit: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarking: boolean;
  passPercentage: number;
  windowStart?: string | null;
  windowEnd?: string | null;
  resultRelease: ResultRelease;
  resultReleaseAt?: string | null;
  allowResume: boolean;
  assignments: AssignmentDraft[];
}

export interface McqExamOverview {
  total: number;
  live: number;
  scheduled: number;
  completed: number;
  attemptsToday: number;
}

// ── Attempts ─────────────────────────────────────────────────────────────────
export interface McqAttempt {
  id: string;
  examId: string;
  studentId: string;
  studentName?: string;
  batchId?: string;
  batchName?: string;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: string;
  lastSeenAt: string;
  submittedAt?: string;
  timeSpentSeconds: number;
  totalScore?: number;
  maxScore?: number;
  percentage?: number;
  accuracy?: number;
  correctCount?: number;
  wrongCount?: number;
  unattemptedCount?: number;
  rank?: number;
  percentile?: number;
  /** undefined while `awaitingEvaluation` — pass/fail isn't decided yet. */
  isPass?: boolean;
  /** Marks locked in subjective questions a teacher has not yet marked. */
  pendingMarks?: number;
  /** true ⇒ the score is provisional; Smart Mark Entry must finish the paper. */
  awaitingEvaluation?: boolean;
  shuffleSeed: number;
  questionOrder: string[];
  flagsCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One stored answer within an attempt. */
export interface McqAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  selectedOptionIds: string[];
  numericValue?: number | null;
  /** Typed answer — fill_ups / one_word / match_following / subjective types. */
  textValue?: string | null;
  isCorrect?: boolean;
  awarded: number;
  maxMarks: number;
  /**
   * true ⇒ subjective; awaiting a teacher in Smart Mark Entry. `awarded` is 0
   * because it is unmarked, NOT because the student got it wrong.
   */
  pendingReview?: boolean;
  markedForReview: boolean;
  timeSpentSeconds: number;
  answeredAt?: string;
}

/** A pending answer the engine autosaves — keyed by question id. */
export interface AnswerDraft {
  questionId: string;
  selectedOptionIds: string[];
  numericValue?: number | null;
  /**
   * Typed answer — fill_ups / one_word and every teacher-graded type. For
   * match_following it is the student's right-hand column, "|"-joined in the
   * order of the left-hand items (the shape mcqScoring.scoreAnswer expects).
   */
  textValue?: string | null;
  markedForReview: boolean;
  timeSpentSeconds: number;
}

export type AttemptEventType =
  | "started"
  | "autosave"
  | "tab_switch"
  | "fullscreen_exit"
  | "fullscreen_enter"
  | "blur"
  | "focus"
  | "copy"
  | "paste"
  | "reconnect"
  | "submit"
  | "auto_submit"
  | "force_submit"
  | "reopen"
  | "pause"
  | "resume";

export interface AttemptEvent {
  id: string;
  attemptId: string;
  eventType: AttemptEventType;
  detail?: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
}

/** Everything the engine needs to run a live attempt. */
export interface AttemptSession {
  exam: McqExam;
  attempt: McqAttempt;
  /** Questions in this attempt's frozen (possibly shuffled) order. */
  questions: PaperQuestionView[];
  answers: McqAnswer[];
}

// ── Live monitoring ──────────────────────────────────────────────────────────
export interface MonitorRow {
  attemptId: string;
  studentId: string;
  studentName: string;
  batchName?: string;
  status: AttemptStatus;
  startedAt: string;
  lastSeenAt: string;
  /** Seconds since last heartbeat — drives the disconnected flag. */
  staleSeconds: number;
  isDisconnected: boolean;
  answeredCount: number;
  flagsCount: number;
  percentage?: number;
}

export interface MonitorSnapshot {
  exam: McqExam;
  rows: MonitorRow[];
  active: number;
  completed: number;
  disconnected: number;
  notStarted: number;
  flagged: number;
}

// ── Analytics ────────────────────────────────────────────────────────────────
export interface TopperCard {
  rank: number;
  studentName: string;
  score: number;
  percentage: number;
  accuracy: number;
}

export interface LeaderboardRow {
  rank: number;
  percentile: number;
  studentName: string;
  score: number;
  maxScore: number;
  percentage: number;
  accuracy: number;
  timeSpentSeconds: number;
  isPass: boolean;
}

export interface SectionPerformance {
  chapter: string;
  questions: number;
  correct: number;
  marks: number;
  awarded: number;
  accuracy: number;
}

export interface QuestionDifficultyRow {
  questionId: string;
  questionText: string;
  chapter?: string;
  attempts: number;
  correct: number;
  correctRate: number;
  avgTimeSeconds: number;
}

export interface McqExamAnalytics {
  exam: McqExam;
  attemptCount: number;
  submittedCount: number;
  averagePercentage: number;
  averageAccuracy: number;
  passRate: number;
  highestPercentage: number;
  toppers: TopperCard[];
  leaderboard: LeaderboardRow[];
  sectionPerformance: SectionPerformance[];
  weakChapters: SectionPerformance[];
  questionDifficulty: QuestionDifficultyRow[];
}

// ── Student result view ──────────────────────────────────────────────────────
export interface ResultAnswerRow {
  question: McqQuestion;
  answer?: McqAnswer;
  awarded: number;
  maxMarks: number;
  correct: boolean;
  attempted: boolean;
}

export interface StudentExamResult {
  exam: McqExam;
  attempt: McqAttempt;
  released: boolean;
  answers: ResultAnswerRow[];
  sectionPerformance: SectionPerformance[];
  weakChapters: SectionPerformance[];
}
