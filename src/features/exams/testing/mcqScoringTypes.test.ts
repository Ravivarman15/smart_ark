import { describe, it, expect } from "vitest";
import { scoreAnswer, scoreAttempt } from "../utils/mcqScoring";
import type { McqQuestion, McqQuestionType } from "../types/mcq.types";

// ════════════════════════════════════════════════════════════════════════════
// Grading of the question types the AI paper importer added.
//
// The regression these guard: widening McqQuestionType without teaching the
// grader about the new types made every subjective question fall into the
// choice-scoring branch, where it scored 0/N and counted as WRONG — silently
// penalising a student for an essay nobody had marked yet.
// ════════════════════════════════════════════════════════════════════════════

const q = (over: Partial<McqQuestion> & { questionType: McqQuestionType }): McqQuestion =>
  ({
    id: "q1",
    questionText: "Q",
    difficulty: "medium",
    marks: 5,
    negativeMarks: 1,
    options: [],
    hasFormula: false,
    status: "published",
    isGlobal: false,
    usageCount: 0,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as McqQuestion;

describe("scoreAnswer — teacher-graded types", () => {
  it("flags an essay as pending review rather than scoring it zero", () => {
    const result = scoreAnswer(
      q({ questionType: "essay" }),
      { questionId: "q1", textValue: "A long, thoughtful answer." },
      true,
    );
    expect(result.pendingReview).toBe(true);
    expect(result.attempted).toBe(true);
    expect(result.correct).toBe(false); // not yet marked — NOT "wrong"
    expect(result.awarded).toBe(0);
  });

  it("never applies negative marking to a teacher-graded answer", () => {
    const result = scoreAnswer(
      q({ questionType: "long_answer", negativeMarks: 2 }),
      { questionId: "q1", textValue: "Something" },
      true,
    );
    expect(result.awarded).toBe(0);
  });
});

describe("scoreAnswer — fill in the blanks / one word", () => {
  const fill = q({ questionType: "fill_ups", answerText: "New Delhi", marks: 2 });

  it("matches the key ignoring case, spacing and punctuation", () => {
    const r = scoreAnswer(fill, { questionId: "q1", textValue: " new delhi. " }, false);
    expect(r.correct).toBe(true);
    expect(r.awarded).toBe(2);
  });

  it("marks a wrong answer wrong and applies negative marking", () => {
    const r = scoreAnswer(fill, { questionId: "q1", textValue: "Mumbai" }, true);
    expect(r.correct).toBe(false);
    expect(r.attempted).toBe(true);
    expect(r.awarded).toBe(-1);
  });

  it("treats an empty answer as unattempted, not wrong", () => {
    const r = scoreAnswer(fill, { questionId: "q1", textValue: "  " }, true);
    expect(r.attempted).toBe(false);
    expect(r.awarded).toBe(0);
  });
});

describe("scoreAnswer — match the following", () => {
  // The contract with ExamQuestionView: the student's answer is the RIGHT-hand
  // column, "|"-joined, in the order of the left-hand items. If the UI and the
  // grader ever disagree on this shape, every match question silently scores 0 —
  // so it is pinned here on purpose.
  const match = q({
    questionType: "match_following",
    marks: 4,
    matchPairs: [
      { left: "Heart", right: "Circulation" },
      { left: "Lungs", right: "Respiration" },
    ],
  });

  it("scores a correctly ordered right-hand column", () => {
    const r = scoreAnswer(
      match,
      { questionId: "q1", textValue: "Circulation|Respiration" },
      false,
    );
    expect(r.correct).toBe(true);
    expect(r.awarded).toBe(4);
  });

  it("is order-sensitive — a swapped pairing is wrong", () => {
    const r = scoreAnswer(
      match,
      { questionId: "q1", textValue: "Respiration|Circulation" },
      false,
    );
    expect(r.correct).toBe(false);
    expect(r.attempted).toBe(true);
  });

  it("normalises case and spacing like every other text answer", () => {
    const r = scoreAnswer(
      match,
      { questionId: "q1", textValue: " circulation | respiration " },
      false,
    );
    expect(r.correct).toBe(true);
  });

  it("treats a partially filled grid as attempted but wrong, not unattempted", () => {
    const r = scoreAnswer(match, { questionId: "q1", textValue: "Circulation|" }, false);
    expect(r.attempted).toBe(true);
    expect(r.correct).toBe(false);
  });
});

describe("scoreAttempt — a mixed paper", () => {
  it("separates pending marks from earned marks and never counts pending as wrong", () => {
    const questions = [
      q({ id: "a", questionType: "single", marks: 1, options: [
        { id: "o1", text: "yes", isCorrect: true },
        { id: "o2", text: "no", isCorrect: false },
      ] }),
      q({ id: "b", questionType: "fill_ups", marks: 2, answerText: "photosynthesis" }),
      q({ id: "c", questionType: "essay", marks: 10 }),
    ];

    const score = scoreAttempt(
      questions,
      [
        { questionId: "a", selectedOptionIds: ["o1"] },
        { questionId: "b", textValue: "Photosynthesis" },
        { questionId: "c", textValue: "An essay…" },
      ],
      false,
    );

    // 1 + 2 auto-marked; the 10-mark essay is still with the teacher.
    expect(score.totalAwarded).toBe(3);
    expect(score.pendingMarks).toBe(10);
    expect(score.awaitingEvaluation).toBe(true);
    expect(score.correctCount).toBe(2);
    expect(score.wrongCount).toBe(0);
  });

  it("reports a fully auto-graded paper as not awaiting evaluation", () => {
    const score = scoreAttempt(
      [q({ id: "a", questionType: "true_false", marks: 1, options: [
        { id: "o1", text: "True", isCorrect: true },
        { id: "o2", text: "False", isCorrect: false },
      ] })],
      [{ questionId: "a", selectedOptionIds: ["o1"] }],
      false,
    );
    expect(score.awaitingEvaluation).toBe(false);
    expect(score.pendingMarks).toBe(0);
  });
});
