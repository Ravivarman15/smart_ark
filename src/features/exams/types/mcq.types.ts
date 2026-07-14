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
  // ── Auto-evaluable ─────────────────────────────────────────────────────────
  | "single" // single correct option
  | "multiple" // multiple correct options
  | "true_false" // true / false
  | "assertion_reason" // assertion + reason, one correct interpretation
  | "numerical" // free numeric answer with tolerance
  | "fill_ups" // blank(s) completed with an exact string
  | "one_word" // one-word answer, matched against the key
  | "match_following" // two-column matching, scored pair-by-pair
  // ── Teacher-evaluated (routed to Smart Mark Entry) ─────────────────────────
  | "short_answer"
  | "long_answer"
  | "paragraph"
  | "case_study"
  | "diagram"
  | "programming"
  | "essay";

/** Types the grading engine can score without a human. */
export const AUTO_EVALUABLE_TYPES: McqQuestionType[] = [
  "single", "multiple", "true_false", "assertion_reason",
  "numerical", "fill_ups", "one_word", "match_following",
];

export const isAutoEvaluable = (t: McqQuestionType): boolean =>
  AUTO_EVALUABLE_TYPES.includes(t);

/** Bloom's taxonomy level — detected by the AI importer, used to balance papers. */
export type BloomLevel =
  | "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";

export const BLOOM_LEVELS: { value: BloomLevel; label: string }[] = [
  { value: "remember", label: "Remember" },
  { value: "understand", label: "Understand" },
  { value: "apply", label: "Apply" },
  { value: "analyze", label: "Analyze" },
  { value: "evaluate", label: "Evaluate" },
  { value: "create", label: "Create" },
];

/** One row of a match-the-following question. */
export interface MatchPair { left: string; right: string }

/** A nested part of a multi-part question (a)(b)(c). */
export interface SubQuestion { label: string; text: string; marks: number }

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
  { value: "fill_ups", label: "Fill in the Blanks" },
  { value: "one_word", label: "One Word Answer" },
  { value: "match_following", label: "Match the Following" },
  { value: "short_answer", label: "Short Answer" },
  { value: "long_answer", label: "Long Answer" },
  { value: "paragraph", label: "Paragraph" },
  { value: "case_study", label: "Case Study" },
  { value: "diagram", label: "Diagram" },
  { value: "programming", label: "Programming" },
  { value: "essay", label: "Essay" },
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
  // ── AI-importer metadata ──────────────────────────────────────────────────
  bloomLevel?: BloomLevel;
  tags?: string[];
  board?: string;
  standardId?: string;
  answerText?: string;
  matchPairs?: MatchPair[];
  subQuestions?: SubQuestion[];
  /** false ⇒ routed to teacher evaluation instead of the auto-grader. */
  autoEvaluable?: boolean;
  sourceImportId?: string;
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
  // ── Added by the AI paper importer; optional for hand-authored questions ──
  bloomLevel?: BloomLevel | null;
  tags?: string[];
  board?: string | null;
  standardId?: string | null;
  /** Answer key for fill_ups / one_word / short_answer / essay / … */
  answerText?: string | null;
  matchPairs?: MatchPair[];
  subQuestions?: SubQuestion[];
  /** false ⇒ graded by a teacher in Smart Mark Entry, not by the engine. */
  autoEvaluable?: boolean;
  /** Normalised-text hash — powers "reuse existing question if duplicate". */
  textHash?: string | null;
  /** The uploaded paper this question was extracted from. */
  sourceImportId?: string | null;
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
  /**
   * Spread the picks across Bloom levels and question types instead of taking
   * whatever the bank happens to return first. Applied WITHIN each difficulty
   * band, so it never fights the difficulty mix — a blueprint that asks for
   * 20/50/30 still gets exactly 20/50/30.
   */
  balanceBloom?: boolean;
  balanceTypes?: boolean;
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
  /** Typed answer — fill_ups / one_word and every teacher-graded type. */
  textValue?: string | null;
}

/** The centrally-scored result of one response. */
export interface ScoredAnswer {
  questionId: string;
  awarded: number;
  maxMarks: number;
  correct: boolean;
  attempted: boolean;
  /**
   * true ⇒ this question CANNOT be auto-graded (essay, long answer, diagram…)
   * and is waiting for a teacher in Smart Mark Entry. `awarded` is 0 only
   * because nobody has marked it yet — it is NOT a zero the student earned.
   * Consumers must not present a pending answer as a wrong one.
   */
  pendingReview?: boolean;
}

/** Aggregate score of a full attempt. */
export interface AttemptScore {
  totalAwarded: number;
  totalMax: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  /** Marks locked up in questions still awaiting teacher evaluation. */
  pendingMarks: number;
  /** true while any answer is pendingReview — the score is not final. */
  awaitingEvaluation: boolean;
  answers: ScoredAnswer[];
}
