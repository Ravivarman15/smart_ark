// ─────────────────────────────────────────────────────────────────────────────
// CENTRALISED MCQ SCORING & PAPER-ANALYSIS LAYER
//
// Every MCQ figure the module shows or stores flows through here. No UI
// component and no service computes a paper's marks, difficulty score, chapter
// split or a per-question award on its own.
//
//   • answer scoring   — scoreAnswer / scoreAttempt  (single source for awards,
//                         negative marking included — reused by the MCQ Exam
//                         engine in the next phase for instant scoring)
//   • paper analysis   — paperTotalMarks / estimateDifficultyScore /
//                         chapterDistribution / difficultyDistribution /
//                         estimatedAvgScorePct / paperInsights
//   • auto-generation  — selectQuestionsForGeneration (difficulty + chapter
//                         balancing, randomised)
//
// Pure functions, no I/O — trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from "./grading";
import {
  correctOptionIdsOf,
  normalizeText,
} from "../../../../supabase/functions/_shared/grading.ts";
import { isAutoEvaluable } from "../types/mcq.types";
import type {
  AttemptScore,
  ChapterDistItem,
  DifficultyDistItem,
  GenerationRules,
  McqDifficulty,
  McqOption,
  McqQuestion,
  McqResponse,
  QuestionTypeDistItem,
  ScoredAnswer,
} from "../types/mcq.types";

// ── Difficulty model — one place defines "how hard is hard" ──────────────────
/** Relative weight of each difficulty band. */
export const DIFFICULTY_WEIGHT: Record<McqDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

/** Difficulty band → a 0-100 anchor used for the paper difficulty score. */
const DIFFICULTY_ANCHOR: Record<McqDifficulty, number> = {
  easy: 25,
  medium: 55,
  hard: 85,
};

/** Estimated fraction of an average cohort that answers a band correctly. */
const EXPECTED_CORRECT_RATE: Record<McqDifficulty, number> = {
  easy: 0.8,
  medium: 0.55,
  hard: 0.3,
};

// ── Marks ────────────────────────────────────────────────────────────────────
/** A question's effective marks inside a paper — an override always wins. */
export const effectiveMarks = (
  baseMarks: number,
  override?: number | null,
): number => (override != null && override > 0 ? override : baseMarks);

/** Total marks of a question set. */
export const paperTotalMarks = (
  questions: { effectiveMarks: number }[],
): number => round2(questions.reduce((s, q) => s + (q.effectiveMarks || 0), 0));

// ── Paper difficulty + complexity ────────────────────────────────────────────
/**
 * Estimated paper difficulty, 0-100. Marks-weighted average of each question's
 * difficulty anchor — a paper dominated by hard, heavily-weighted questions
 * scores high.
 */
export const estimateDifficultyScore = (
  questions: { difficulty: McqDifficulty; effectiveMarks: number }[],
): number => {
  if (questions.length === 0) return 0;
  let weighted = 0;
  let totalMarks = 0;
  for (const q of questions) {
    const m = q.effectiveMarks || 1;
    weighted += DIFFICULTY_ANCHOR[q.difficulty] * m;
    totalMarks += m;
  }
  return totalMarks > 0 ? round2(weighted / totalMarks) : 0;
};

/** Human label for a 0-100 difficulty score. */
export const complexityLabel = (score: number): string => {
  if (score <= 0) return "—";
  if (score < 38) return "Easy";
  if (score < 56) return "Balanced";
  if (score < 74) return "Challenging";
  return "Hard";
};

/**
 * Estimated mean score % an average cohort would achieve — sum of
 * (marks × expected-correct-rate), softened slightly when negative marking is
 * on (wrong guesses cost marks).
 */
export const estimatedAvgScorePct = (
  questions: { difficulty: McqDifficulty; effectiveMarks: number }[],
  negativeMarking: boolean,
): number => {
  const total = paperTotalMarks(questions);
  if (total <= 0) return 0;
  let expected = 0;
  for (const q of questions) {
    const rate = EXPECTED_CORRECT_RATE[q.difficulty];
    expected += (q.effectiveMarks || 0) * rate;
  }
  let pct = (expected / total) * 100;
  if (negativeMarking) pct *= 0.92; // wrong attempts shave the expected mean
  return round2(Math.max(0, Math.min(100, pct)));
};

// ── Distributions ────────────────────────────────────────────────────────────
export const chapterDistribution = (
  questions: { chapter?: string; effectiveMarks: number }[],
): ChapterDistItem[] => {
  const map = new Map<string, ChapterDistItem>();
  for (const q of questions) {
    const chapter = (q.chapter || "Unassigned").trim() || "Unassigned";
    const item = map.get(chapter) ?? { chapter, count: 0, marks: 0 };
    item.count += 1;
    item.marks = round2(item.marks + (q.effectiveMarks || 0));
    map.set(chapter, item);
  }
  return Array.from(map.values()).sort((a, b) => b.marks - a.marks);
};

export const difficultyDistribution = (
  questions: { difficulty: McqDifficulty; effectiveMarks: number }[],
): DifficultyDistItem[] => {
  const total = paperTotalMarks(questions);
  const order: McqDifficulty[] = ["easy", "medium", "hard"];
  return order.map((difficulty) => {
    const rows = questions.filter((q) => q.difficulty === difficulty);
    const marks = round2(rows.reduce((s, q) => s + (q.effectiveMarks || 0), 0));
    return {
      difficulty,
      count: rows.length,
      marks,
      pct: total > 0 ? round2((marks / total) * 100) : 0,
    };
  });
};

export const typeDistribution = (
  questions: { questionType: McqQuestion["questionType"] }[],
): QuestionTypeDistItem[] => {
  const map = new Map<McqQuestion["questionType"], number>();
  for (const q of questions) {
    map.set(q.questionType, (map.get(q.questionType) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([type, count]) => ({ type, count }));
};

/** Narrative complexity insights for a paper — short, actionable bullets. */
export const paperInsights = (
  questions: {
    difficulty: McqDifficulty;
    chapter?: string;
    effectiveMarks: number;
  }[],
  negativeMarking: boolean,
): string[] => {
  if (questions.length === 0) return ["Add questions to see complexity insights."];

  const out: string[] = [];
  const total = paperTotalMarks(questions);
  const diff = difficultyDistribution(questions);
  const hard = diff.find((d) => d.difficulty === "hard");
  const easy = diff.find((d) => d.difficulty === "easy");
  const chapters = chapterDistribution(questions);
  const score = estimateDifficultyScore(questions);

  out.push(
    `Estimated difficulty ${score}/100 — ${complexityLabel(score)}.`,
  );

  if (hard && hard.pct >= 50) {
    out.push(
      `Hard questions carry ${hard.pct}% of the marks — consider easing the balance.`,
    );
  }
  if (easy && easy.count === 0) {
    out.push("No easy questions — weaker students may struggle to start.");
  }
  if (chapters.length === 1) {
    out.push("All questions sit in one chapter — coverage is narrow.");
  } else {
    const top = chapters[0];
    const topPct = total > 0 ? round2((top.marks / total) * 100) : 0;
    if (topPct >= 60) {
      out.push(
        `"${top.chapter}" dominates ${topPct}% of the paper — spread across more chapters.`,
      );
    } else {
      out.push(`Covers ${chapters.length} chapters fairly evenly.`);
    }
  }
  out.push(
    negativeMarking
      ? "Negative marking is ON — discourage blind guessing in instructions."
      : "Negative marking is OFF — every attempt is risk-free for students.",
  );
  return out;
};

// ── Answer key validation ────────────────────────────────────────────────────
/** Correct option ids of a choice-type question. */
export const correctOptionIds = (options: McqOption[]): string[] =>
  correctOptionIdsOf(options);

/**
 * Does this question carry a usable answer key? Used by the editor and by bulk
 * import to reject un-scorable questions before they reach the bank.
 */
export const answerKeyError = (q: {
  questionType: McqQuestion["questionType"];
  options: McqOption[];
  numericalAnswer?: { value: number; tolerance: number } | null;
}): string | null => {
  if (q.questionType === "numerical") {
    if (!q.numericalAnswer || !Number.isFinite(q.numericalAnswer.value)) {
      return "Numerical questions need a correct value.";
    }
    if (q.numericalAnswer.tolerance < 0) return "Tolerance cannot be negative.";
    return null;
  }
  const filled = q.options.filter((o) => o.text.trim().length > 0);
  if (filled.length < 2) return "Add at least two answer options.";
  const correct = correctOptionIds(filled);
  if (correct.length === 0) return "Mark at least one option as correct.";
  if (q.questionType !== "multiple" && correct.length > 1) {
    return "This question type allows only one correct option.";
  }
  return null;
};

// ── Per-answer scoring — RE-EXPORTED, NOT REIMPLEMENTED ─────────────────────
// The grader itself lives in supabase/functions/_shared/grading.ts, because the
// server has to be the one that decides a mark and the server is Deno. Keeping
// a second copy here for the app is exactly how the two would drift, so the app
// imports the same file. See that file's header for the full reasoning.
//
// The names stay `scoreAnswer` / `scoreAttempt` so every existing call site,
// test and barrel export continues to mean the same thing.
export {
  gradeAnswer as scoreAnswer,
  gradeAttempt as scoreAttempt,
} from "../../../../supabase/functions/_shared/grading.ts";

// ── Duplicate detection ──────────────────────────────────────────────────────
/** Normalise question text for duplicate comparison — case/space/punctuation-insensitive. */
export const normalizeQuestionText = (text: string): string =>
  normalizeText(text);

// ── Auto paper generation ────────────────────────────────────────────────────
/** Fisher–Yates shuffle — returns a new array (used for randomisation). */
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Order a bucket so heavily-weighted chapters surface first (random tiebreak). */
const orderByChapterWeight = (
  bucket: McqQuestion[],
  weightage: GenerationRules["chapterWeightage"],
): McqQuestion[] => {
  if (!weightage || weightage.length === 0) return shuffle(bucket);
  const weight = new Map(
    weightage.map((w) => [w.chapter.trim().toLowerCase(), w.weight]),
  );
  return shuffle(bucket).sort(
    (a, b) =>
      (weight.get((b.chapter ?? "").trim().toLowerCase()) ?? 0) -
      (weight.get((a.chapter ?? "").trim().toLowerCase()) ?? 0),
  );
};

/**
 * Round-robin a bucket across the values of `keyOf`, so the picks spread evenly
 * over Bloom levels / question types instead of taking six "remember" MCQs in a
 * row just because that is the order the bank returned.
 *
 * This is a RE-ORDERING, not a filter: every question stays in the bucket, so a
 * bank with only one Bloom level still fills the paper — it just can't spread.
 * That is why balancing can never cause a shortfall.
 */
const roundRobinBy = <T>(bucket: T[], keyOf: (item: T) => string): T[] => {
  const groups = new Map<string, T[]>();
  for (const item of bucket) {
    const k = keyOf(item);
    const g = groups.get(k);
    if (g) g.push(item);
    else groups.set(k, [item]);
  }
  if (groups.size <= 1) return bucket;

  const queues = [...groups.values()];
  const out: T[] = [];
  let i = 0;
  while (out.length < bucket.length) {
    const q = queues[i % queues.length];
    if (q.length > 0) out.push(q.shift()!);
    i += 1;
    // Every queue drained on this pass ⇒ nothing left to take.
    if (i % queues.length === 0 && queues.every((x) => x.length === 0)) break;
  }
  return out;
};

/**
 * Pick questions from a pool to satisfy generation rules — honours the
 * difficulty mix and chapter weightage, randomised, then tops up any shortfall
 * from the remaining pool. Optionally spreads the picks across Bloom levels and
 * question types (the AI blueprint). Pure: the service fetches the pool, this
 * selects.
 */
export const selectQuestionsForGeneration = (
  pool: McqQuestion[],
  rules: GenerationRules,
): { selected: McqQuestion[]; shortfall: number } => {
  const total = Math.max(0, Math.floor(rules.totalQuestions));
  if (total === 0 || pool.length === 0) {
    return { selected: [], shortfall: total };
  }

  // Target count per difficulty band (rounding fixed so the sum hits `total`).
  const mix = rules.difficultyMix;
  const targets: Record<McqDifficulty, number> = {
    easy: Math.round((total * (mix.easy || 0)) / 100),
    medium: Math.round((total * (mix.medium || 0)) / 100),
    hard: Math.round((total * (mix.hard || 0)) / 100),
  };
  // Absorb any rounding drift into the medium band so the targets sum to total.
  const drift = total - (targets.easy + targets.medium + targets.hard);
  targets.medium = Math.max(0, targets.medium + drift);

  const selected: McqQuestion[] = [];
  const used = new Set<string>();
  (["easy", "medium", "hard"] as McqDifficulty[]).forEach((band) => {
    let bucket = orderByChapterWeight(
      pool.filter((q) => q.difficulty === band && !used.has(q.id)),
      rules.chapterWeightage,
    );
    // Blueprint balancing — spread across cognitive levels, then across question
    // types. Types last so it wins the outer interleave, giving a paper that
    // alternates MCQ / short / long rather than clumping by format.
    if (rules.balanceBloom) {
      bucket = roundRobinBy(bucket, (q) => q.bloomLevel ?? "unspecified");
    }
    if (rules.balanceTypes) {
      bucket = roundRobinBy(bucket, (q) => q.questionType);
    }
    for (const q of bucket) {
      if (selected.filter((s) => s.difficulty === band).length >= targets[band])
        break;
      selected.push(q);
      used.add(q.id);
    }
  });

  // Top up any shortfall (a band ran dry) from whatever remains.
  if (selected.length < total) {
    for (const q of shuffle(pool)) {
      if (selected.length >= total) break;
      if (!used.has(q.id)) {
        selected.push(q);
        used.add(q.id);
      }
    }
  }

  return {
    selected: selected.slice(0, total),
    shortfall: Math.max(0, total - selected.length),
  };
};
