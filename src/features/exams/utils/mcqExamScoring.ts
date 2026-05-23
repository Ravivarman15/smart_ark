// ─────────────────────────────────────────────────────────────────────────────
// CENTRALISED MCQ EXAM SCORING — ranking, percentile, section breakdown and the
// deterministic per-attempt shuffle.
//
// Per-answer + per-attempt scoring itself lives in mcqScoring.ts (scoreAnswer /
// scoreAttempt) and is reused as-is. This file adds only the exam-engine layer:
// nothing here is duplicated and no UI component recomputes any of it.
//
// Pure functions, no I/O — trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from "./grading";
import type { SectionPerformance } from "../types/mcqExam.types";

// ── Deterministic RNG — a frozen seed reproduces the same shuffle on resume ──
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A fresh random seed for a new attempt. */
export const newShuffleSeed = (): number =>
  Math.floor(Math.random() * 2_000_000_000) + 1;

/** Deterministic Fisher–Yates shuffle — the same seed always yields the same
 *  order, so a resumed attempt sees identical question / option ordering. */
export const seededShuffle = <T>(arr: T[], seed: number): T[] => {
  const rng = mulberry32(seed || 1);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ── Accuracy ─────────────────────────────────────────────────────────────────
/** Accuracy % = correct ÷ attempted (correct + wrong). */
export const accuracyPct = (correct: number, wrong: number): number => {
  const attempted = correct + wrong;
  return attempted > 0 ? round2((correct / attempted) * 100) : 0;
};

// ── Ranking + percentile ─────────────────────────────────────────────────────
/**
 * Dense-rank a set of attempt scores (highest first) and assign each a
 * percentile = % of attempts scoring strictly below it. Returns a map keyed by
 * the caller's id. Pure — the analytics service feeds it, then persists.
 */
export const rankAndPercentile = (
  items: { id: string; score: number }[],
): Map<string, { rank: number; percentile: number }> => {
  const out = new Map<string, { rank: number; percentile: number }>();
  if (items.length === 0) return out;

  const sorted = [...items].sort((a, b) => b.score - a.score);
  const n = sorted.length;

  let rank = 0;
  let prev: number | null = null;
  for (const it of sorted) {
    if (prev === null || it.score !== prev) {
      rank += 1;
      prev = it.score;
    }
    const below = items.filter((x) => x.score < it.score).length;
    out.set(it.id, {
      rank,
      percentile: round2((below / n) * 100),
    });
  }
  return out;
};

// ── Section (chapter-wise) breakdown ─────────────────────────────────────────
/**
 * Group scored answer rows by chapter into section performance. Used for both
 * a single student's result and the exam-wide section analytics (the caller
 * decides which rows to feed in).
 */
export const sectionBreakdown = (
  rows: {
    chapter?: string;
    awarded: number;
    maxMarks: number;
    correct: boolean;
  }[],
): SectionPerformance[] => {
  const map = new Map<string, SectionPerformance>();
  for (const r of rows) {
    const chapter = (r.chapter || "Unassigned").trim() || "Unassigned";
    const s =
      map.get(chapter) ??
      ({
        chapter,
        questions: 0,
        correct: 0,
        marks: 0,
        awarded: 0,
        accuracy: 0,
      } as SectionPerformance);
    s.questions += 1;
    if (r.correct) s.correct += 1;
    s.marks = round2(s.marks + r.maxMarks);
    s.awarded = round2(s.awarded + r.awarded);
    map.set(chapter, s);
  }
  const list = Array.from(map.values());
  for (const s of list) {
    s.accuracy = s.questions > 0 ? round2((s.correct / s.questions) * 100) : 0;
  }
  return list.sort((a, b) => b.marks - a.marks);
};

/** The weakest chapters — accuracy below `threshold` %, lowest first. */
export const weakChapters = (
  sections: SectionPerformance[],
  threshold = 60,
): SectionPerformance[] =>
  sections
    .filter((s) => s.accuracy < threshold)
    .sort((a, b) => a.accuracy - b.accuracy);
