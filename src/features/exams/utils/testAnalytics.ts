// ═════════════════════════════════════════════════════════════════════════════
// PARTICIPATION, DISTRIBUTION, COMPARISON
//
// The layer `mcqExamAnalytics.service.ts` does not already cover. That service
// answers "how did the people who sat it do?" — averages, accuracy, toppers,
// per-question difficulty. It cannot answer "how many did NOT sit it", because
// nothing there knows who was assigned.
//
// ┌── THE NUMBER THAT IS ALWAYS WRONG IF YOU GUESS ────────────────────────┐
// │ Average score over SUBMITTED attempts is not the class's average. A    │
// │ test where eight strong students turned up and thirty did not shows a  │
// │ splendid mean and hides the actual result, which is that most of the   │
// │ class did not take it.                                                 │
// │                                                                        │
// │ So participation is reported first and separately, and every average   │
// │ here says out loud which population it is over. Nothing is inferred    │
// │ from an attempt count alone.                                           │
// └────────────────────────────────────────────────────────────────────────┘
//
// Pure functions over rows the caller already has. No fabricated figures: a
// statistic with no data behind it returns null, never 0 — "nobody has sat this
// yet" and "everybody scored nothing" are opposite facts.
// ═════════════════════════════════════════════════════════════════════════════

export interface AnalyticsAttempt {
  studentId?: string | null;
  status: string;
  percentage?: number | null;
  totalScore?: number | null;
  timeSpentSeconds?: number | null;
  awaitingEvaluation?: boolean | null;
  batchName?: string | null;
}

export interface Participation {
  /** Students the test was assigned to. null when it is a public link. */
  assigned: number | null;
  started: number;
  submitted: number;
  /** Started but never submitted — the ones worth chasing. */
  inProgress: number;
  /** Assigned and never opened it. null when the audience is unknown. */
  notStarted: number | null;
  /** 0-100, or null when there is no denominator. */
  participationRate: number | null;
  /** Of those who started, how many finished. */
  completionRate: number | null;
}

const pct = (n: number, d: number): number | null =>
  d > 0 ? Math.round(((n / d) * 100 + Number.EPSILON) * 10) / 10 : null;

const isSubmitted = (a: AnalyticsAttempt) =>
  a.status === "submitted" || a.status === "auto_submitted";

/**
 * Who turned up.
 *
 * `assignedCount` of null means the audience genuinely cannot be counted — a
 * public link is open to people who are not on any roster. Reporting 0 there
 * would make participation read as infinite or as a divide-by-zero dash; null
 * makes the UI say "not applicable" instead of inventing a rate.
 */
export const participation = (
  attempts: AnalyticsAttempt[],
  assignedCount: number | null,
): Participation => {
  // One student, many attempts, still one participant. Counting rows would
  // overstate turnout on any multi-attempt test.
  const starters = new Set<string>();
  const finishers = new Set<string>();
  let anonStarted = 0;
  let anonSubmitted = 0;

  for (const a of attempts) {
    if (a.studentId) {
      starters.add(a.studentId);
      if (isSubmitted(a)) finishers.add(a.studentId);
    } else {
      anonStarted += 1;
      if (isSubmitted(a)) anonSubmitted += 1;
    }
  }

  const started = starters.size + anonStarted;
  const submitted = finishers.size + anonSubmitted;

  return {
    assigned: assignedCount,
    started,
    submitted,
    inProgress: Math.max(0, started - submitted),
    notStarted: assignedCount == null ? null : Math.max(0, assignedCount - started),
    participationRate: assignedCount == null ? null : pct(started, assignedCount),
    completionRate: pct(submitted, started),
  };
};

export interface ScoreBand {
  label: string;
  /** Inclusive lower bound, exclusive upper — except the top band. */
  min: number;
  max: number;
  count: number;
}

/**
 * Score distribution in fixed 20-point bands.
 *
 * Fixed rather than computed from the data's own range: bands that move with
 * the results make two tests incomparable, and a cohort where everyone scored
 * between 61 and 68 would render as a dramatic spread across five buckets.
 *
 * Attempts still awaiting a teacher's marks are EXCLUDED — placing a paper in
 * the 0-20 band because its essays are unmarked would libel the student.
 */
export const scoreDistribution = (attempts: AnalyticsAttempt[]): ScoreBand[] => {
  const bands: ScoreBand[] = [
    { label: "0–20%", min: 0, max: 20, count: 0 },
    { label: "20–40%", min: 20, max: 40, count: 0 },
    { label: "40–60%", min: 40, max: 60, count: 0 },
    { label: "60–80%", min: 60, max: 80, count: 0 },
    { label: "80–100%", min: 80, max: 100, count: 0 },
  ];

  for (const a of attempts) {
    if (!isSubmitted(a)) continue;
    if (a.awaitingEvaluation) continue;
    const p = Number(a.percentage ?? 0);
    const band =
      bands.find((b) => p >= b.min && p < b.max) ?? bands[bands.length - 1];
    band.count += 1;
  }
  return bands;
};

export interface ScoreSpread {
  /** null when nothing final has been submitted. */
  average: number | null;
  highest: number | null;
  lowest: number | null;
  median: number | null;
  /** Submitted papers whose marks are not final yet. */
  awaitingEvaluation: number;
  /** How many attempts the figures above are actually over. */
  basis: number;
}

/**
 * The spread, over FINAL results only.
 *
 * `basis` is returned so the UI can say "over 12 of 30 papers" rather than
 * presenting an average as though it covered everyone. An average that quietly
 * excludes half the cohort is the same lie as one that includes unmarked zeros.
 */
export const scoreSpread = (attempts: AnalyticsAttempt[]): ScoreSpread => {
  const submitted = attempts.filter(isSubmitted);
  const awaiting = submitted.filter((a) => a.awaitingEvaluation).length;
  const finals = submitted
    .filter((a) => !a.awaitingEvaluation)
    .map((a) => Number(a.percentage ?? 0))
    .sort((x, y) => x - y);

  if (finals.length === 0) {
    return {
      average: null,
      highest: null,
      lowest: null,
      median: null,
      awaitingEvaluation: awaiting,
      basis: 0,
    };
  }

  const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
  const mid = Math.floor(finals.length / 2);

  return {
    average: round1(finals.reduce((s, n) => s + n, 0) / finals.length),
    highest: round1(finals[finals.length - 1]),
    lowest: round1(finals[0]),
    median: round1(
      finals.length % 2 === 0 ? (finals[mid - 1] + finals[mid]) / 2 : finals[mid],
    ),
    awaitingEvaluation: awaiting,
    basis: finals.length,
  };
};

export interface CohortRow {
  label: string;
  submitted: number;
  average: number | null;
  basis: number;
}

/**
 * Batch-by-batch comparison.
 *
 * Sorted by average DESCENDING, with unrated cohorts last — but a cohort with
 * one finished paper is not "top of the class", so `basis` travels with every
 * row and the UI is expected to show it. A league table built on n=1 is worse
 * than no league table.
 */
export const cohortComparison = (attempts: AnalyticsAttempt[]): CohortRow[] => {
  const groups = new Map<string, AnalyticsAttempt[]>();
  for (const a of attempts) {
    const key = (a.batchName ?? "").trim() || "Unassigned";
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  return [...groups.entries()]
    .map(([label, rows]) => {
      const spread = scoreSpread(rows);
      return {
        label,
        submitted: rows.filter(isSubmitted).length,
        average: spread.average,
        basis: spread.basis,
      };
    })
    .sort((a, b) => {
      if (a.average == null && b.average == null) return a.label.localeCompare(b.label);
      if (a.average == null) return 1;
      if (b.average == null) return -1;
      return b.average - a.average;
    });
};

export interface QuestionOutcome {
  questionId: string;
  attempted: number;
  correct: number;
  /** Attempts where this question was left blank. */
  skipped: number;
  /** 0-100 over ATTEMPTED only, or null when nobody attempted it. */
  accuracy: number | null;
}

export interface AnalyticsAnswer {
  questionId: string;
  isCorrect?: boolean | null;
  attempted: boolean;
  pendingReview?: boolean | null;
}

/**
 * Per-question outcomes across every attempt.
 *
 * Accuracy is over ATTEMPTED answers, not over everyone. A question thirty
 * students skipped and two answered correctly is 100% accurate and almost
 * certainly a disaster — which is why `skipped` is reported beside it rather
 * than folded in.
 *
 * Answers still awaiting a teacher are counted as attempted but not as correct
 * or incorrect: they have no verdict yet, and guessing one either way would
 * move the number in a direction nobody chose.
 */
export const questionOutcomes = (answers: AnalyticsAnswer[]): QuestionOutcome[] => {
  const byQuestion = new Map<string, QuestionOutcome>();

  for (const a of answers) {
    const row =
      byQuestion.get(a.questionId) ??
      { questionId: a.questionId, attempted: 0, correct: 0, skipped: 0, accuracy: null };

    if (a.attempted) {
      row.attempted += 1;
      if (a.isCorrect === true) row.correct += 1;
    } else {
      row.skipped += 1;
    }
    byQuestion.set(a.questionId, row);
  }

  for (const row of byQuestion.values()) {
    row.accuracy = pct(row.correct, row.attempted);
  }
  return [...byQuestion.values()];
};

/** The questions most people got wrong. Excludes ones nobody attempted. */
export const hardestQuestions = (
  outcomes: QuestionOutcome[],
  limit = 5,
): QuestionOutcome[] =>
  outcomes
    .filter((o) => o.attempted > 0)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .slice(0, limit);

/** The questions most people skipped. Often a wording problem, not a hard one. */
export const mostSkipped = (
  outcomes: QuestionOutcome[],
  limit = 5,
): QuestionOutcome[] =>
  outcomes.filter((o) => o.skipped > 0).sort((a, b) => b.skipped - a.skipped).slice(0, limit);
