import { describe, it, expect } from "vitest";
import {
  parsePaper, parseMeta, extractAnswerKey, detectType, detectBloom, inferDifficulty,
} from "../utils/paperParser";

// ════════════════════════════════════════════════════════════════════════════
// The local question-paper parser.
//
// These tests are the specification. The parser replaces a paid LLM, so its
// behaviour has to be pinned down — especially the confidence score, which is
// what decides whether a teacher ever looks at a question.
// ════════════════════════════════════════════════════════════════════════════

const PAPER = `
ARK PUBLIC SCHOOL
Half Yearly Examination : Science
Class: X          Subject: Physics
Board: CBSE       Time: 2 Hours 30 Minutes
Maximum Marks: 40

General Instructions:
All questions are compulsory. Draw diagrams where necessary.

PART A

1. What is the SI unit of force? [1]
   (a) Joule
   (b) Newton
   (c) Watt
   (d) Pascal

2. Fill in the blank: The process by which plants make food is called ________. [1]

3. State whether true or false: Light travels faster than sound. [1]

PART B

4. Calculate the acceleration of a body of mass 5 kg acted on by a force of 20 N. (3 marks)

5. Explain the process of refraction with a diagram. [5]

ANSWER KEY
1. B
2. photosynthesis
3. True
4. 4
`;

describe("parseMeta", () => {
  const meta = parseMeta(PAPER);

  it("reads the header fields the paper actually states", () => {
    expect(meta.subject).toMatch(/Physics/i);
    expect(meta.board).toBe("CBSE");
    expect(meta.totalMarks).toBe(40);
  });

  it("converts a mixed hours+minutes duration to minutes", () => {
    expect(meta.durationMinutes).toBe(150);
  });

  it("captures the general instructions", () => {
    expect(meta.instructions).toMatch(/All questions are compulsory/i);
  });
});

describe("extractAnswerKey", () => {
  it("lifts the key out of the body so it is never parsed as a question", () => {
    const { body, key } = extractAnswerKey(PAPER);
    expect(body).not.toMatch(/photosynthesis/);
    expect(key.get("1")).toBe("B");
    expect(key.get("2")).toBe("photosynthesis");
  });

  it("handles several answers on one line", () => {
    const { key } = extractAnswerKey("Answers\n1. A  2. C  3. D");
    expect(key.get("1")).toBe("A");
    expect(key.get("3")).toBe("D");
  });
});

describe("detectType", () => {
  it("recognises true/false from a two-option pair", () => {
    expect(detectType("Light travels fast. (a) True (b) False", 2, 1).type).toBe("true_false");
  });
  it("recognises a blank as fill-in-the-blanks", () => {
    expect(detectType("Water boils at ______ degrees.", 0, 1).type).toBe("fill_ups");
  });
  it("recognises multiple-correct from the instruction", () => {
    expect(detectType("Select all that apply.", 4, 2).type).toBe("multiple");
  });
  it("recognises assertion-reason", () => {
    expect(detectType("Assertion: X. Reason: Y.", 4, 1).type).toBe("assertion_reason");
  });
  it("flags a bare prose question as an unconfident guess", () => {
    const v = detectType("Discuss the causes.", 0, 4);
    expect(v.confident).toBe(false);
  });
});

describe("Bloom + difficulty heuristics", () => {
  it("maps the action verb to a Bloom level", () => {
    expect(detectBloom("Define osmosis.").level).toBe("remember");
    expect(detectBloom("Justify the decision.").level).toBe("evaluate");
    expect(detectBloom("Calculate the force.").level).toBe("apply");
  });

  it("reports when no verb matched, so confidence can reflect it", () => {
    expect(detectBloom("Osmosis, briefly.").matched).toBe(false);
  });

  it("scales difficulty with marks and cognitive load", () => {
    expect(inferDifficulty(1, "remember")).toBe("easy");
    expect(inferDifficulty(3, "understand")).toBe("medium");
    expect(inferDifficulty(5, "understand")).toBe("hard");
    expect(inferDifficulty(1, "evaluate")).toBe("hard");
  });
});

describe("parsePaper — end to end", () => {
  const { questions } = parsePaper(PAPER);

  it("finds every question and no phantom ones", () => {
    expect(questions).toHaveLength(5);
    expect(questions.map((q) => q.questionNo)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("keeps section headers with their questions", () => {
    expect(questions[0].section).toBe("Part A");
    expect(questions[3].section).toBe("Part B");
  });

  it("reads options and ticks the correct one from the answer key", () => {
    const q1 = questions[0];
    expect(q1.questionType).toBe("single");
    expect(q1.options.map((o) => o.text)).toEqual(["Joule", "Newton", "Watt", "Pascal"]);
    expect(q1.options.filter((o) => o.isCorrect).map((o) => o.text)).toEqual(["Newton"]);
    expect(q1.marks).toBe(1);
  });

  it("strips the marks marker out of the question text", () => {
    expect(questions[0].questionText).not.toMatch(/\[1\]/);
    expect(questions[0].questionText).toMatch(/SI unit of force/i);
  });

  it("resolves a fill-in-the-blank answer from the key", () => {
    const q2 = questions[1];
    expect(q2.questionType).toBe("fill_ups");
    expect(q2.answerText).toBe("photosynthesis");
  });

  it("reads '(3 marks)' as well as '[3]'", () => {
    expect(questions[3].marks).toBe(3);
  });

  it("scores a fully-resolved question at high confidence (no human needed)", () => {
    expect(questions[0].confidence).toBeGreaterThanOrEqual(90);
  });

  it("does NOT penalise a teacher-graded question for having no answer key", () => {
    // Q5 asks for an explanation with a diagram — it is marked by a human, so
    // a missing key is expected, not a defect. Docking it would send perfectly
    // good questions to review for no reason.
    const q5 = questions[4];
    expect(q5.questionType).toBe("diagram");
    expect(q5.confidence).toBeGreaterThanOrEqual(90);
  });

  it("never invents an answer it could not find", () => {
    const q5 = questions[4];
    expect(q5.answerText).toBe("");
    expect(q5.options.some((o) => o.isCorrect)).toBe(false);
  });
});

describe("parsePaper — messy input", () => {
  it("sends an auto-gradable question with no answer key to review", () => {
    // An MCQ the engine is supposed to grade, but with no key anywhere: this
    // is the case that MUST reach a human, or students get graded against a
    // question that has no correct answer.
    const { questions } = parsePaper(
      "1. What is the capital of France? [1]\n(a) Lyon\n(b) Paris\n(c) Nice",
    );
    expect(questions[0].questionType).toBe("single");
    expect(questions[0].options.some((o) => o.isCorrect)).toBe(false);
    expect(questions[0].confidence).toBeLessThan(75);
  });

  it("penalises confidence when marks are absent", () => {
    const { questions } = parsePaper("1. Define inertia.");
    expect(questions[0].marks).toBe(1);          // assumed
    expect(questions[0].confidence).toBeLessThan(75); // and said so
  });

  it("returns nothing rather than guessing when there are no questions", () => {
    const { questions } = parsePaper("This is a syllabus document with no numbered items.");
    expect(questions).toHaveLength(0);
  });

  it("does not mistake an option line for a new question", () => {
    const { questions } = parsePaper("1. Pick one. [1]\n(a) First\n(b) Second");
    expect(questions).toHaveLength(1);
    expect(questions[0].options).toHaveLength(2);
  });
});
