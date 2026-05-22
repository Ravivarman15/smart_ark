// ─────────────────────────────────────────────────────────────────────────────
// Domain types for the MCQ Paper phase of the Exam module.
//
// App-facing camelCase shapes. Services map the snake_case DB rows onto these
// so no other layer touches raw columns. These types extend — never replace —
// the Manual-Exam types in exam.types.ts.
//
// The `McqResponse` / `ScoredAnswer` / `AttemptScore` shapes at the bottom are
// reserved for the NEXT phase (live MCQ Exam engine) — the centralised scoring
// layer (utils/mcqScoring.ts) already implements against them.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enumerations ─────────────────────────────────────────────────────────────
export type McqQuestionType =
  | "single" // single correct option
  | "multiple" // multiple correct options
  | "true_false" // true / false
  | "assertion_reason" // assertion + reason, one correct interpretation
  | "numerical"; // free numeric answer with tolerance

export type McqDifficulty = "easy" | "medium" | "hard";
export type McqQuestionStatus = "draft" | "published";
export type McqPaperStatus = "draft" | "published" | "archived";
export type McqGenerationMode = "manual" | "auto";

export const MCQ_QUESTION_TYPES: { value: McqQuestionType; label: string }[] = [
  { value: "single", label: "Single Correct" },
  { value: "multiple", label: "Multiple Correct" },
  { value: "true_false", label: "True / False" },
  { value: "assertion_reason", label: "Assertion–Reason" },
  { value: "numerical", label: "Numerical Answer" },
];

export const MCQ_DIFFICULTIES: { value: McqDifficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

// ── Question bank ────────────────────────────────────────────────────────────
/** One answer option of a choice-type question. `id` is stable within the question. */
export interface McqOption {
  id: string;
  text: string;
  isCorrect: boolean;
  imageUrl?: string;
}

/** Answer key for a numerical question — correct within ± tolerance. */
export interface NumericalAnswer {
  value: number;
  tolerance: number;
}

export interface McqQuestion {
  id: string;
  questionText: string;
  questionType: McqQuestionType;
  subjectId?: string;
  subjectName?: string;
  chapter?: string;
  topic?: string;
  difficulty: McqDifficulty;
  marks: number;
  negativeMarks: number;
  /** Choice options — empty for numerical questions. */
  options: McqOption[];
  /** Answer key for numerical questions — null for choice types. */
  numericalAnswer?: NumericalAnswer | null;
  explanation?: string;
  imageUrl?: string;
  hasFormula: boolean;
  status: McqQuestionStatus;
  isGlobal: boolean;
  usageCount: number;
  lastUsedAt?: string;
  ownerId?: string;
  ownerName?: string;
  /** Derived per-viewer — merged client-side from mcq_question_favorites. */
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface McqQuestionInput {
  questionText: string;
  questionType: McqQuestionType;
  subjectId?: string | null;
  subjectName?: string | null;
  chapter?: string | null;
  topic?: string | null;
  difficulty: McqDifficulty;
  marks: number;
  negativeMarks: number;
  options: McqOption[];
  numericalAnswer?: NumericalAnswer | null;
  explanation?: string | null;
  imageUrl?: string | null;
  hasFormula?: boolean;
  status?: McqQuestionStatus;
  isGlobal?: boolean;
}

/** Where a question-bank query draws from. */
export type QuestionScope = "all" | "mine" | "global" | "favorites" | "recent";

export interface QuestionBankFilters {
  search?: string;
  subjectId?: string;
  chapter?: string;
  topic?: string;
  difficulty?: McqDifficulty;
  questionType?: McqQuestionType;
  status?: McqQuestionStatus;
  scope?: QuestionScope;
}

// ── MCQ paper ────────────────────────────────────────────────────────────────
/** Auto-generation rules — persisted on the paper so a paper can be regenerated. */
export interface GenerationRules {
  totalQuestions: number;
  /** Percentage split — should sum to ~100. */
  difficultyMix: { easy: number; medium: number; hard: number };
  /** Per-chapter weighting (percentage). Empty = no chapter constraint. */
  chapterWeightage: { chapter: string; weight: number }[];
  marksPerQuestion: number;
  subjectId?: string | null;
  includeTypes?: McqQuestionType[];
}

export interface McqPaper {
  id: string;
  title: string;
  subjectId?: string;
  subjectName?: string;
  standardId?: string;
  standardName?: string;
  description?: string;
  instructions?: string;
  totalMarks: number;
  totalQuestions: number;
  durationMinutes: number;
  negativeMarking: boolean;
  /** Estimated difficulty 0-100 — written by the centralised scoring layer. */
  difficultyScore: number;
  setCount: number;
  randomize: boolean;
  generationMode: McqGenerationMode;
  generationRules?: GenerationRules | null;
  status: McqPaperStatus;
  version: number;
  usageCount: number;
  ownerId?: string;
  ownerName?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface McqPaperInput {
  title: string;
  subjectId?: string | null;
  subjectName?: string | null;
  standardId?: string | null;
  standardName?: string | null;
  description?: string | null;
  instructions?: string | null;
  durationMinutes: number;
  negativeMarking: boolean;
  setCount: number;
  randomize: boolean;
  generationMode?: McqGenerationMode;
  generationRules?: GenerationRules | null;
  status?: McqPaperStatus;
}

/** Junction row — a question's placement inside a paper. */
export interface McqPaperQuestion {
  id: string;
  paperId: string;
  questionId: string;
  setLabel: string;
  sortOrder: number;
  marksOverride?: number | null;
}

/** A paper question joined with its full question record — what the builder
 *  and the preview render. `effectiveMarks` already resolves the override. */
export interface PaperQuestionView extends McqQuestion {
  paperQuestionId: string;
  setLabel: string;
  sortOrder: number;
  marksOverride?: number | null;
  effectiveMarks: number;
}

/** One row submitted from the paper builder when saving the question set. */
export interface PaperQuestionDraft {
  questionId: string;
  setLabel?: string;
  sortOrder: number;
  marksOverride?: number | null;
}

export interface McqPaperVersion {
  id: string;
  paperId: string;
  version: number;
  summary?: string;
  changedByName?: string;
  createdAt: string;
  snapshot: unknown;
}

export interface McqAuditEntry {
  id: string;
  entityType: "paper" | "question";
  entityId?: string;
  eventType: string;
  detail?: string;
  actorName?: string;
  createdAt: string;
}

export interface McqPaperOverview {
  totalPapers: number;
  draft: number;
  published: number;
  archived: number;
  bankQuestions: number;
}

// ── Analytics ────────────────────────────────────────────────────────────────
export interface ChapterDistItem {
  chapter: string;
  count: number;
  marks: number;
}

export interface DifficultyDistItem {
  difficulty: McqDifficulty;
  count: number;
  marks: number;
  pct: number;
}

export interface QuestionTypeDistItem {
  type: McqQuestionType;
  count: number;
}

export interface McqPaperAnalytics {
  paper: McqPaper;
  totalQuestions: number;
  totalMarks: number;
  /** 0-100 — estimated paper difficulty. */
  difficultyScore: number;
  complexityLabel: string;
  /** Estimated mean score % an average cohort would achieve. */
  estimatedAvgScorePct: number;
  chapterDistribution: ChapterDistItem[];
  difficultyDistribution: DifficultyDistItem[];
  typeDistribution: QuestionTypeDistItem[];
  insights: string[];
}

// ── Bulk import ──────────────────────────────────────────────────────────────
export interface BulkImportRow {
  rowNumber: number;
  raw: Record<string, string>;
  question?: McqQuestionInput;
  errors: string[];
  isDuplicate: boolean;
}

export interface BulkImportReport {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  rows: BulkImportRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// NEXT-PHASE RESERVATIONS — MCQ Exam engine (live exam-taking, instant scoring).
// The scoring layer in utils/mcqScoring.ts already implements against these so
// the exam engine plugs in without a rebuild.
// ─────────────────────────────────────────────────────────────────────────────
/** A student's response to one question. */
export interface McqResponse {
  questionId: string;
  /** Selected option ids — choice types. */
  selectedOptionIds?: string[];
  /** Entered value — numerical questions. */
  numericValue?: number | null;
}

/** The centrally-scored result of one response. */
export interface ScoredAnswer {
  questionId: string;
  awarded: number;
  maxMarks: number;
  correct: boolean;
  attempted: boolean;
}

/** Aggregate score of a full attempt. */
export interface AttemptScore {
  totalAwarded: number;
  totalMax: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  answers: ScoredAnswer[];
}
