// ═════════════════════════════════════════════════════════════════════════════
// THE GRADER — the one implementation of "what is this answer worth".
//
// ┌── WHY THIS FILE IS HERE AND NOT IN src/ ───────────────────────────────┐
// │ Marks used to be computed in the student's own browser, which then     │
// │ wrote the resulting score straight into mcq_attempts. Whoever holds    │
// │ the tab holds the grader, so the score was self-reported.              │
// │                                                                        │
// │ Grading therefore had to move behind a server. The obvious next step — │
// │ reimplement it in plpgsql, or copy it into the edge function — creates │
// │ TWO graders, and two graders drift. The drift does not announce        │
// │ itself: it surfaces as a handful of students marked wrong on a         │
// │ question they answered correctly, weeks later.                         │
// │                                                                        │
// │ So there is one file, it lives where Deno can reach it, and it has NO  │
// │ IMPORTS AT ALL — that is what lets the browser bundle, the edge        │
// │ function and vitest all load the identical module. Every type it needs │
// │ is declared here. Keep it that way: one `import` line and either the   │
// │ app or the edge function stops being able to load it.                  │
// └────────────────────────────────────────────────────────────────────────┘
//
// Pure functions, no I/O, no Deno globals, no framework. The app re-exports
// these from src/features/exams/utils/mcqScoring.ts so there is exactly one
// implementation reachable under exactly one name.
// ═════════════════════════════════════════════════════════════════════════════

// ── The minimum shape of a question the grader needs ─────────────────────────
// Deliberately structural, not the app's full McqQuestion: the grader must not
// require a field it does not read, and the edge function must be able to build
// one of these straight from a database row.

export type GradableType =
  | "single" | "multiple" | "true_false" | "assertion_reason"
  | "numerical" | "fill_ups" | "one_word" | "match_following"
  | "short_answer" | "long_answer" | "paragraph"
  | "case_study" | "diagram" | "programming" | "essay";

/** Types the grader can settle without a human. Everything else is pending. */
export const AUTO_EVALUABLE: readonly GradableType[] = [
  "single", "multiple", "true_false", "assertion_reason",
  "numerical", "fill_ups", "one_word", "match_following",
];

export const isAutoEvaluableType = (t: string): boolean =>
  (AUTO_EVALUABLE as readonly string[]).includes(t);

export interface GradableOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface GradableQuestion {
  id: string;
  questionType: GradableType;
  marks: number;
  negativeMarks: number;
  options: GradableOption[];
  numericalAnswer?: { value: number; tolerance: number } | null;
  answerText?: string | null;
  matchPairs?: { left: string; right: string }[];
}

/** A student's response to one question. */
export interface GradableResponse {
  questionId: string;
  selectedOptionIds?: string[];
  numericValue?: number | null;
  textValue?: string | null;
}

/** The scored result of one response. */
export interface ScoredAnswerResult {
  questionId: string;
  awarded: number;
  maxMarks: number;
  correct: boolean;
  attempted: boolean;
  /**
   * true means this question CANNOT be auto-graded (essay, long answer,
   * diagram...) and is waiting for a teacher. `awarded` is 0 only because
   * nobody has marked it yet — it is NOT a zero the student earned. Consumers
   * must never present a pending answer as a wrong one.
   */
  pendingReview?: boolean;
}

/** Aggregate score of a full attempt. */
export interface AttemptScoreResult {
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
  answers: ScoredAnswerResult[];
}

// ── Primitives ───────────────────────────────────────────────────────────────
export const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** A question's effective marks inside a paper — an override always wins. */
export const effectiveMarksOf = (
  baseMarks: number,
  override?: number | null,
): number => (override != null && override > 0 ? override : baseMarks);

/**
 * Case / spacing / punctuation-insensitive normalisation.
 *
 * The SAME normalisation backs duplicate detection in the question bank, which
 * is why it lives with the grader rather than being reinvented per call site:
 * if a typed answer and the key count as "the same text" for dedup, they must
 * also count as the same answer for marking.
 */
export const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();

export const correctOptionIdsOf = (options: GradableOption[]): string[] =>
  (options ?? [])
    .map((o, idx) => ({ ...o, id: o?.id || `o${idx + 1}` }))
    .filter((o) => o.isCorrect)
    .map((o) => o.id);

// ── Per-answer scoring ───────────────────────────────────────────────────────
/**
 * Score one response against its question.
 *
 * Every branch returns `base` untouched when the student left the question
 * alone, so an unattempted question is never negatively marked — penalising a
 * blank would punish admitting you do not know.
 */
export const gradeAnswer = (
  q: GradableQuestion,
  response: GradableResponse | undefined,
  negativeMarking: boolean,
  marksOverride?: number | null,
): ScoredAnswerResult => {
  const maxMarks = effectiveMarksOf(q.marks, marksOverride);
  const base: ScoredAnswerResult = {
    questionId: q.id,
    awarded: 0,
    maxMarks,
    correct: false,
    attempted: false,
  };

  // Subjective types (essay, long answer, diagram, programming...) cannot be
  // machine-graded. They are NOT worth zero — they are worth nothing YET.
  if (!isAutoEvaluableType(q.questionType)) {
    base.attempted = !!response?.textValue?.trim();
    base.pendingReview = true;
    return base;
  }

  if (q.questionType === "numerical") {
    const v = response?.numericValue;
    if (v == null || !Number.isFinite(v)) return base;
    base.attempted = true;
    const key = q.numericalAnswer;
    base.correct =
      !!key && Math.abs(v - key.value) <= Math.max(0, key.tolerance);
  } else if (q.questionType === "fill_ups" || q.questionType === "one_word") {
    const typed = response?.textValue?.trim();
    if (!typed) return base;
    base.attempted = true;
    const key = q.answerText?.trim();
    base.correct = !!key && normalizeText(typed) === normalizeText(key);
  } else if (q.questionType === "match_following") {
    // Scored all-or-nothing on the ordered right-hand column the student built.
    const typed = response?.textValue?.trim();
    const pairs = q.matchPairs ?? [];
    if (!typed || pairs.length === 0) return base;
    base.attempted = true;
    const expected = pairs.map((p) => normalizeText(p.right)).join("|");
    const given = typed.split("|").map((s) => normalizeText(s)).join("|");
    base.correct = expected === given;
  } else {
    const picked = (response?.selectedOptionIds ?? []).filter(Boolean);
    if (picked.length === 0) return base;
    base.attempted = true;
    const normalizedOptions = (q.options ?? []).map((o, idx) => ({
      ...o,
      id: o?.id || `o${idx + 1}`,
    }));
    const correct = new Set(correctOptionIdsOf(normalizedOptions));
    const chosen = new Set(picked);
    // All-or-nothing: the chosen set must equal the correct set exactly.
    base.correct =
      correct.size === chosen.size && [...correct].every((id) => chosen.has(id));
  }

  if (base.correct) {
    base.awarded = maxMarks;
  } else if (base.attempted && negativeMarking) {
    base.awarded = -Math.abs(q.negativeMarks || 0);
  }
  return base;
};

/** Score a full attempt — aggregate of gradeAnswer over every paper question. */
export const gradeAttempt = (
  questions: GradableQuestion[],
  responses: GradableResponse[],
  negativeMarking: boolean,
  overrides: Record<string, number | null | undefined> = {},
): AttemptScoreResult => {
  const byId = new Map(responses.map((r) => [r.questionId, r]));
  const answers = questions.map((q) =>
    gradeAnswer(q, byId.get(q.id), negativeMarking, overrides[q.id]),
  );
  const totalAwarded = round2(answers.reduce((s, a) => s + a.awarded, 0));
  const totalMax = round2(answers.reduce((s, a) => s + a.maxMarks, 0));
  const pending = answers.filter((a) => a.pendingReview);
  const pendingMarks = round2(pending.reduce((s, a) => s + a.maxMarks, 0));

  return {
    totalAwarded,
    totalMax,
    percentage: totalMax > 0 ? round2((totalAwarded / totalMax) * 100) : 0,
    correctCount: answers.filter((a) => a.correct).length,
    // A question waiting for a teacher is not a wrong answer.
    wrongCount: answers.filter(
      (a) => a.attempted && !a.correct && !a.pendingReview,
    ).length,
    unattemptedCount: answers.filter((a) => !a.attempted).length,
    pendingMarks,
    awaitingEvaluation: pending.length > 0,
    answers,
  };
};
