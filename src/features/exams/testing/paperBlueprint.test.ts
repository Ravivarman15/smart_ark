import { describe, it, expect } from "vitest";
import { selectQuestionsForGeneration } from "../utils/mcqScoring";
import type {
  BloomLevel, McqDifficulty, McqQuestion, McqQuestionType,
} from "../types/mcq.types";

// ════════════════════════════════════════════════════════════════════════════
// AI Test Blueprint — the generator's selection rules.
//
// The load-bearing invariant: balancing is a RE-ORDERING within each difficulty
// band, never a filter. So turning Bloom/type balancing on must never change how
// many questions come out, and must never break the requested difficulty mix.
// If it ever does, a teacher asking for a 20/50/30 paper silently gets something
// else — which is exactly the kind of quiet wrongness this suite exists to catch.
// ════════════════════════════════════════════════════════════════════════════

let seq = 0;
const q = (
  difficulty: McqDifficulty,
  bloomLevel: BloomLevel,
  questionType: McqQuestionType = "single",
): McqQuestion =>
  ({
    id: `q${++seq}`,
    questionText: `Question ${seq}`,
    questionType,
    difficulty,
    bloomLevel,
    marks: 1,
    negativeMarks: 0,
    options: [],
    hasFormula: false,
    status: "published",
    isGlobal: false,
    usageCount: 0,
    createdAt: "",
    updatedAt: "",
  }) as McqQuestion;

/** A bank deliberately clumped by Bloom level — the worst case for spreading. */
const clumpedPool = (): McqQuestion[] => [
  ...Array.from({ length: 6 }, () => q("easy", "remember")),
  ...Array.from({ length: 6 }, () => q("easy", "understand")),
  ...Array.from({ length: 10 }, () => q("medium", "apply")),
  ...Array.from({ length: 10 }, () => q("medium", "analyze")),
  ...Array.from({ length: 6 }, () => q("hard", "evaluate")),
  ...Array.from({ length: 6 }, () => q("hard", "create")),
];

const rules = (over: Partial<Parameters<typeof selectQuestionsForGeneration>[1]> = {}) => ({
  totalQuestions: 10,
  difficultyMix: { easy: 20, medium: 50, hard: 30 },
  chapterWeightage: [],
  marksPerQuestion: 1,
  ...over,
});

const countBy = <T, K extends string>(xs: T[], keyOf: (x: T) => K) =>
  xs.reduce<Record<string, number>>((acc, x) => {
    const k = keyOf(x);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

describe("selectQuestionsForGeneration — difficulty blueprint", () => {
  it("honours a 20/50/30 mix exactly", () => {
    const { selected, shortfall } = selectQuestionsForGeneration(
      clumpedPool(),
      rules(),
    );
    expect(shortfall).toBe(0);
    expect(selected).toHaveLength(10);

    const byDifficulty = countBy(selected, (s) => s.difficulty);
    expect(byDifficulty).toEqual({ easy: 2, medium: 5, hard: 3 });
  });

  it("still fills the paper when a band runs dry, by topping up", () => {
    // No hard questions at all — the 30% hard target cannot be met.
    const pool = Array.from({ length: 20 }, () => q("easy", "remember"));
    const { selected, shortfall } = selectQuestionsForGeneration(pool, rules());
    expect(selected).toHaveLength(10);
    expect(shortfall).toBe(0);
  });

  it("reports a shortfall when the bank is genuinely too small", () => {
    const pool = Array.from({ length: 4 }, () => q("easy", "remember"));
    const { selected, shortfall } = selectQuestionsForGeneration(pool, rules());
    expect(selected).toHaveLength(4);
    expect(shortfall).toBe(6);
  });
});

describe("selectQuestionsForGeneration — Bloom balancing", () => {
  it("spreads across Bloom levels instead of clumping", () => {
    const { selected } = selectQuestionsForGeneration(
      clumpedPool(),
      rules({ balanceBloom: true }),
    );

    // The medium band takes 5 from a pool that is half `apply`, half `analyze`.
    // Round-robin must draw from BOTH, not five straight `apply`s.
    const medium = selected.filter((s) => s.difficulty === "medium");
    const blooms = new Set(medium.map((m) => m.bloomLevel));
    expect(blooms.size).toBeGreaterThan(1);
  });

  it("does not change the difficulty mix or the total", () => {
    const balanced = selectQuestionsForGeneration(
      clumpedPool(),
      rules({ balanceBloom: true, balanceTypes: true }),
    );
    expect(balanced.selected).toHaveLength(10);
    expect(balanced.shortfall).toBe(0);
    expect(countBy(balanced.selected, (s) => s.difficulty)).toEqual({
      easy: 2, medium: 5, hard: 3,
    });
  });

  it("never causes a shortfall when the bank has only one Bloom level", () => {
    // Balancing has nothing to spread across — it must degrade to a no-op, not
    // starve the paper.
    const pool = Array.from({ length: 20 }, () => q("medium", "remember"));
    const { selected, shortfall } = selectQuestionsForGeneration(
      pool,
      rules({ balanceBloom: true }),
    );
    expect(selected).toHaveLength(10);
    expect(shortfall).toBe(0);
  });
});

describe("selectQuestionsForGeneration — question-type mixing", () => {
  it("alternates question types rather than clumping by format", () => {
    const pool = [
      ...Array.from({ length: 8 }, () => q("medium", "apply", "single")),
      ...Array.from({ length: 8 }, () => q("medium", "apply", "short_answer")),
    ];
    const { selected } = selectQuestionsForGeneration(
      pool,
      rules({
        totalQuestions: 8,
        difficultyMix: { easy: 0, medium: 100, hard: 0 },
        balanceTypes: true,
      }),
    );
    const byType = countBy(selected, (s) => s.questionType);
    // An even bank, evenly drawn — 4 and 4, not 8 and 0.
    expect(byType.single).toBe(4);
    expect(byType.short_answer).toBe(4);
  });
});

describe("selectQuestionsForGeneration — no duplicates", () => {
  it("never selects the same question twice", () => {
    const { selected } = selectQuestionsForGeneration(
      clumpedPool(),
      rules({ totalQuestions: 30, balanceBloom: true, balanceTypes: true }),
    );
    const ids = selected.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
