import { describe, it, expect } from "vitest";
import {
  applyMapping,
  autoMap,
  normaliseHeader,
  previewRows,
  validateMapping,
  type ColumnMapping,
} from "../utils/columnMapping";
import {
  blockingReason,
  hasUsableAnswer,
  reviewQuestion,
  summariseReview,
  type ReviewableQuestion,
} from "../utils/reviewStatus";
import { parseCsvGrid } from "../services/sheetReader.service";

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTING QUESTIONS WITHOUT CORRUPTING THE BANK
//
// Two failure modes worth more than the rest:
//   • a question reaching the bank with NO usable answer key, which grades
//     every student zero and looks exactly like a hard question;
//   • an import that rejects a perfectly good file because its header says
//     "Ans" instead of "correct", sending a teacher off to retype 200 rows.
// ─────────────────────────────────────────────────────────────────────────────

const q = (over: Partial<ReviewableQuestion> = {}): ReviewableQuestion => ({
  questionText: "What is 2 + 2?",
  questionType: "single",
  options: [
    { text: "3", isCorrect: false },
    { text: "4", isCorrect: true },
  ],
  marks: 1,
  confidence: 95,
  ...over,
});

// ═════════════════════════════════════════════════════════════════════════════
describe("guessing which column is which", () => {
  it("recognises the obvious headers", () => {
    expect(autoMap(["Question", "Option A", "Option B", "Correct Answer"])).toEqual([
      "question_text",
      "option_a",
      "option_b",
      "correct",
    ]);
  });

  it("ignores punctuation, case and spacing", () => {
    expect(normaliseHeader("Correct  Answer!")).toBe("correctanswer");
    expect(autoMap(["question_text", "OPTION-A", "Ans."])).toEqual([
      "question_text",
      "option_a",
      "correct",
    ]);
  });

  it("handles the shorthand people actually use", () => {
    // "A"/"B" as option headers, "Q" for the question, "Key" for the answer.
    expect(autoMap(["Q", "A", "B", "C", "D", "Key"])).toEqual([
      "question_text",
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "correct",
    ]);
  });

  it("leaves an unrecognised column unmapped rather than guessing", () => {
    // Unmapped is a question the user answers in one dropdown. A wrong guess
    // is silent data corruption.
    expect(autoMap(["Question", "Author notes", "Correct"])).toEqual([
      "question_text",
      null,
      "correct",
    ]);
  });

  it("gives a field to the FIRST column that claims it", () => {
    // Two columns called "Answer" would otherwise silently take the last, and
    // which one won would be a coin toss nobody saw.
    expect(autoMap(["Answer", "Question", "Answer"])).toEqual([
      "correct",
      "question_text",
      null,
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("is the mapping usable", () => {
  const ok: ColumnMapping = ["question_text", "option_a", "option_b", "correct"];

  it("accepts a complete mapping", () => {
    expect(validateMapping(ok)).toEqual([]);
  });

  it("names a missing required field in words", () => {
    const problems = validateMapping(["question_text", "option_a", "option_b"]);
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe("missing_required");
    expect(problems[0].message).toMatch(/correct answer/i);
  });

  it("refuses two columns claiming one field", () => {
    const problems = validateMapping([
      "question_text",
      "correct",
      "correct",
      "option_a",
      "option_b",
    ]);
    expect(problems.some((p) => p.kind === "duplicate")).toBe(true);
  });

  it("warns when no options are mapped at all", () => {
    // "correct: B" with no B is how a bank fills up with unanswerable questions.
    const problems = validateMapping(["question_text", "correct"]);
    expect(problems.some((p) => p.kind === "no_options")).toBe(true);
  });

  it("checks the mapping, not the rows", () => {
    // Row-level validity stays in mcqImportService.analyze(), which already
    // does duplicate detection against the live bank and per-row reporting.
    // Two different questions; two different places.
    expect(validateMapping(ok)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("re-emitting the sheet for the existing importer", () => {
  const mapping: ColumnMapping = ["question_text", null, "option_a", "option_b", "correct"];
  const rows = [
    ["Capital of France?", "ignore me", "Paris", "Rome", "A"],
    ["Capital of Italy?", "junk", "Paris", "Rome", "B"],
  ];

  it("emits only mapped columns, in canonical order", () => {
    const csv = applyMapping(rows, mapping);
    expect(csv.split("\n")[0]).toBe("question_text,option_a,option_b,correct");
  });

  it("keeps the values with their fields", () => {
    const csv = applyMapping(rows, mapping);
    expect(csv.split("\n")[1]).toBe("Capital of France?,Paris,Rome,A");
  });

  it("drops rows with no question text", () => {
    // Blank lines, footers, and the gap someone left between sections. Emitting
    // them produces an "invalid row" for something that was never a question.
    const csv = applyMapping([...rows, ["", "", "", "", ""]], mapping);
    expect(csv.split("\n")).toHaveLength(3);
  });

  it("escapes commas and quotes so one cell cannot become two", () => {
    const csv = applyMapping(
      [['Which, if any, is "correct"?', "", "Paris", "Rome", "A"]],
      mapping,
    );
    expect(csv.split("\n")[1]).toBe('"Which, if any, is ""correct""?",Paris,Rome,A');
    // And it round-trips back to ONE cell.
    expect(parseCsvGrid(csv)[1][0]).toBe('Which, if any, is "correct"?');
  });

  it("previews only the mapped fields", () => {
    const preview = previewRows(rows, mapping, 1);
    expect(preview[0].map((c) => c.field)).toEqual([
      "question_text",
      "option_a",
      "option_b",
      "correct",
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("an answer key the grader can actually use", () => {
  it("accepts one correct option on a single-correct question", () => {
    expect(hasUsableAnswer(q())).toBe(true);
  });

  it("REFUSES two correct options on a single-correct question", () => {
    // The grader compares sets exactly, so this scores every student zero —
    // and it looks like a hard question, not a broken one.
    const bad = q({
      options: [
        { text: "3", isCorrect: true },
        { text: "4", isCorrect: true },
      ],
    });
    expect(hasUsableAnswer(bad)).toBe(false);
    expect(reviewQuestion(bad).status).toBe("answer_unknown");
    expect(reviewQuestion(bad).reasons[0]).toMatch(/every student would score zero/i);
  });

  it("allows several correct options on a multiple-correct question", () => {
    expect(
      hasUsableAnswer(
        q({
          questionType: "multiple",
          options: [
            { text: "3", isCorrect: true },
            { text: "4", isCorrect: true },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("refuses a choice question with nothing marked correct", () => {
    expect(
      hasUsableAnswer(
        q({ options: [{ text: "3", isCorrect: false }, { text: "4", isCorrect: false }] }),
      ),
    ).toBe(false);
  });

  it("checks the right field per type", () => {
    expect(hasUsableAnswer(q({ questionType: "numerical", options: [], numericalAnswer: 4 }))).toBe(true);
    expect(hasUsableAnswer(q({ questionType: "numerical", options: [], numericalAnswer: null }))).toBe(false);
    expect(hasUsableAnswer(q({ questionType: "one_word", options: [], answerText: "Paris" }))).toBe(true);
    expect(hasUsableAnswer(q({ questionType: "one_word", options: [], answerText: "  " }))).toBe(false);
  });

  it("never asks a teacher-graded question for an answer key", () => {
    // An essay has no key by definition; demanding one would make every
    // subjective paper unpublishable.
    expect(hasUsableAnswer(q({ questionType: "essay", options: [] }))).toBe(true);
    expect(reviewQuestion(q({ questionType: "essay", options: [], confidence: 95 })).status).toBe("ready");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the verdict on one extracted question", () => {
  it("is ready when there is nothing to check", () => {
    expect(reviewQuestion(q()).status).toBe("ready");
  });

  it("separates 'could not read' from 'no answer'", () => {
    // Different seriousness, different fix, so they must not share a status.
    expect(reviewQuestion(q({ questionText: "" })).status).toBe("parse_failed");
    expect(reviewQuestion(q({ options: [{ text: "3", isCorrect: false }] })).status).toBe(
      "parse_failed",
    );
  });

  it("flags a low-confidence question without blocking it", () => {
    const v = reviewQuestion(q({ confidence: 40 }));
    expect(v.status).toBe("needs_review");
    expect(v.blocking).toBe(false);
  });

  it("blocks a missing answer no matter how confident the parser was", () => {
    // Confidence is about the WORDING. A 99%-confident question with no key is
    // still unanswerable, and the percentage must not be able to wave it past.
    const v = reviewQuestion(
      q({ confidence: 99, options: [{ text: "3", isCorrect: false }, { text: "4", isCorrect: false }] }),
    );
    expect(v.status).toBe("answer_unknown");
    expect(v.blocking).toBe(true);
  });

  it("mentions guessed marks as a note, not a blocker", () => {
    const v = reviewQuestion(q({ marks: 0 }));
    expect(v.status).toBe("needs_review");
    expect(v.reasons.join(" ")).toMatch(/no marks were printed/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("whether the paper may be published", () => {
  const verdicts = (...qs: ReviewableQuestion[]) => qs.map(reviewQuestion);

  it("allows a clean paper", () => {
    const s = summariseReview(verdicts(q(), q()));
    expect(s.publishable).toBe(true);
    expect(blockingReason(s)).toBeNull();
  });

  it("allows a paper that only needs a look", () => {
    const s = summariseReview(verdicts(q(), q({ confidence: 30 })));
    expect(s.needsReview).toBe(1);
    expect(s.publishable).toBe(true);
  });

  it("refuses a paper with an unanswerable question", () => {
    const s = summariseReview(
      verdicts(q(), q({ options: [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }] })),
    );
    expect(s.publishable).toBe(false);
    expect(blockingReason(s)).toMatch(/no correct answer set/i);
  });

  it("refuses an empty paper", () => {
    // More obvious than a broken one, and just as worth refusing.
    const s = summariseReview([]);
    expect(s.publishable).toBe(false);
    expect(blockingReason(s)).toMatch(/at least one question/i);
  });

  it("names both problems when both are present", () => {
    const s = summariseReview(
      verdicts(
        q({ questionText: "" }),
        q({ options: [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }] }),
      ),
    );
    expect(blockingReason(s)).toMatch(/no correct answer set/i);
    expect(blockingReason(s)).toMatch(/could not be read/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("reading the file", () => {
  it("parses quoted cells containing commas and newlines", () => {
    const grid = parseCsvGrid('a,"b,c",d\n1,2,3');
    expect(grid[0]).toEqual(["a", "b,c", "d"]);
    expect(grid[1]).toEqual(["1", "2", "3"]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsvGrid('"say ""hi""",x')[0]).toEqual(['say "hi"', "x"]);
  });

  it("treats CRLF and LF alike", () => {
    expect(parseCsvGrid("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
