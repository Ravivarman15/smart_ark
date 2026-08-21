import { isAutoEvaluable } from "../types/mcq.types";
import type { McqQuestionType } from "../types/mcq.types";

// ═════════════════════════════════════════════════════════════════════════════
// IS THIS QUESTION READY?
//
// One verdict per extracted question, shared by every import route — pasted
// text, an uploaded document, a spreadsheet. The review screen groups by it and
// publishing is blocked on it.
//
// ┌── WHY A STATUS AND NOT JUST A CONFIDENCE PERCENTAGE ───────────────────┐
// │ The parser already reports confidence, and the review screen already   │
// │ colours it. But "62%" does not tell a teacher WHAT to look at, and the │
// │ two situations it conflates are not equally serious:                   │
// │                                                                        │
// │   • "the marks were not printed, so I guessed 1"  — a detail to skim   │
// │   • "I could not find the answer key at all"      — unpublishable      │
// │                                                                        │
// │ A question with no answer key is not a low-confidence question. It is  │
// │ an unanswerable one, and it must be impossible to publish it by        │
// │ scrolling past. So `answer_unknown` is its own status and its own      │
// │ blocker, regardless of what the percentage says.                       │
// └────────────────────────────────────────────────────────────────────────┘
//
// THE PARSER NEVER INVENTS AN ANSWER. That contract is upstream of this file;
// this is what makes the gap visible rather than letting a null answer key
// travel quietly into the bank.
// ═════════════════════════════════════════════════════════════════════════════

export type ReviewStatus =
  /** Nothing to check. Safe to publish as-is. */
  | "ready"
  /** Readable, but the parser guessed something it could not read. */
  | "needs_review"
  /** Auto-graded type with no usable answer key. BLOCKS publishing. */
  | "answer_unknown"
  /** Not recoverable as a question at all. BLOCKS publishing. */
  | "parse_failed";

export interface ReviewVerdict {
  status: ReviewStatus;
  /** Plain-language reasons, most serious first. Shown as-is. */
  reasons: string[];
  /** True when this question cannot be part of a published test. */
  blocking: boolean;
}

/** Below this, the parser is telling us it was mostly guessing. */
export const REVIEW_THRESHOLD = 75;

export interface ReviewableQuestion {
  questionText: string;
  questionType: McqQuestionType;
  options: { text: string; isCorrect: boolean }[];
  numericalAnswer?: number | null;
  answerText?: string;
  matchPairs?: { left: string; right: string }[];
  marks?: number;
  confidence?: number;
}

const filledOptions = (q: ReviewableQuestion) =>
  (q.options ?? []).filter((o) => (o.text ?? "").trim().length > 0);

/**
 * Does this question carry an answer the grader could actually use?
 *
 * Mirrors what `gradeAnswer()` in _shared/grading.ts reads for each type. A
 * question that looks complete here but grades to zero for everyone is the
 * failure this is guarding against — and it is silent, because a wrong answer
 * key looks exactly like a hard question.
 */
export const hasUsableAnswer = (q: ReviewableQuestion): boolean => {
  if (!isAutoEvaluable(q.questionType)) return true; // a teacher will mark it

  switch (q.questionType) {
    case "numerical":
      return q.numericalAnswer != null && Number.isFinite(q.numericalAnswer);
    case "fill_ups":
    case "one_word":
      return !!q.answerText && q.answerText.trim().length > 0;
    case "match_following":
      return (
        (q.matchPairs ?? []).length > 0 &&
        (q.matchPairs ?? []).every(
          (p) => p.left.trim().length > 0 && p.right.trim().length > 0,
        )
      );
    default: {
      const opts = filledOptions(q);
      const correct = opts.filter((o) => o.isCorrect);
      if (correct.length === 0) return false;
      // Only "multiple" may have more than one. Two correct answers on a
      // single-correct question means the grader's set-equality check can never
      // match, so every student scores zero on it.
      if (q.questionType !== "multiple" && correct.length > 1) return false;
      return true;
    }
  }
};

/** Judge one extracted question. */
export const reviewQuestion = (q: ReviewableQuestion): ReviewVerdict => {
  const reasons: string[] = [];

  // ── Unrecoverable ────────────────────────────────────────────────────────
  if (!q.questionText || q.questionText.trim().length < 3) {
    return {
      status: "parse_failed",
      reasons: ["No question text could be read from this block."],
      blocking: true,
    };
  }

  const needsOptions =
    isAutoEvaluable(q.questionType) &&
    !["numerical", "fill_ups", "one_word", "match_following"].includes(q.questionType);

  if (needsOptions && filledOptions(q).length < 2) {
    return {
      status: "parse_failed",
      reasons: [
        `A ${q.questionType.replace("_", " ")} question needs at least two options; ${filledOptions(q).length} were found.`,
      ],
      blocking: true,
    };
  }

  // ── Unanswerable ─────────────────────────────────────────────────────────
  if (!hasUsableAnswer(q)) {
    const opts = filledOptions(q);
    const correct = opts.filter((o) => o.isCorrect).length;
    reasons.push(
      correct > 1 && q.questionType !== "multiple"
        ? `${correct} options are marked correct, but this type allows only one. Every student would score zero.`
        : "The correct answer could not be confidently detected. Choose it below.",
    );
    return { status: "answer_unknown", reasons, blocking: true };
  }

  // ── Readable, but guessed at ─────────────────────────────────────────────
  if (typeof q.confidence === "number" && q.confidence < REVIEW_THRESHOLD) {
    reasons.push(
      `The parser was ${Math.round(q.confidence)}% sure of this one — check the wording and the options.`,
    );
  }
  if (!q.marks || q.marks <= 0) {
    reasons.push("No marks were printed for this question, so it was set to 1.");
  }

  return reasons.length > 0
    ? { status: "needs_review", reasons, blocking: false }
    : { status: "ready", reasons: [], blocking: false };
};

export interface ReviewSummary {
  total: number;
  ready: number;
  needsReview: number;
  answerUnknown: number;
  parseFailed: number;
  /** Nothing blocking. The only condition under which publishing is allowed. */
  publishable: boolean;
}

export const summariseReview = (verdicts: ReviewVerdict[]): ReviewSummary => {
  const count = (s: ReviewStatus) => verdicts.filter((v) => v.status === s).length;
  const total = verdicts.length;
  return {
    total,
    ready: count("ready"),
    needsReview: count("needs_review"),
    answerUnknown: count("answer_unknown"),
    parseFailed: count("parse_failed"),
    // An empty paper is not publishable either — a test with no questions is a
    // more obvious mistake than a broken one, and just as worth refusing.
    publishable: total > 0 && !verdicts.some((v) => v.blocking),
  };
};

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  ready: "Ready",
  needs_review: "Needs review",
  answer_unknown: "Answer missing",
  parse_failed: "Could not read",
};

/** Why publishing is blocked, in one sentence — or null when it is not. */
export const blockingReason = (s: ReviewSummary): string | null => {
  if (s.total === 0) return "Add at least one question before publishing.";
  const bits: string[] = [];
  if (s.answerUnknown > 0) {
    bits.push(
      `${s.answerUnknown} question${s.answerUnknown === 1 ? " has" : "s have"} no correct answer set`,
    );
  }
  if (s.parseFailed > 0) {
    bits.push(
      `${s.parseFailed} question${s.parseFailed === 1 ? " could" : "s could"} not be read`,
    );
  }
  if (bits.length === 0) return null;
  return `${bits.join(", and ")}. Fix or remove ${bits.length === 1 ? "it" : "them"} to publish.`;
};
