import { describe, it, expect } from "vitest";
import {
  cohortComparison,
  hardestQuestions,
  mostSkipped,
  participation,
  questionOutcomes,
  scoreDistribution,
  scoreSpread,
  type AnalyticsAttempt,
} from "../utils/testAnalytics";

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS THAT DO NOT FLATTER
//
// Every assertion here is about a number that is easy to compute WRONG in a way
// that looks right: an average over the people who turned up, a distribution
// that files unmarked essays as failures, a league table built on one paper.
// ─────────────────────────────────────────────────────────────────────────────

const a = (over: Partial<AnalyticsAttempt> = {}): AnalyticsAttempt => ({
  studentId: "s1",
  status: "submitted",
  percentage: 50,
  awaitingEvaluation: false,
  ...over,
});

// ═════════════════════════════════════════════════════════════════════════════
describe("who actually turned up", () => {
  it("counts students, not attempt rows", () => {
    // One student with three attempts is one participant. Counting rows
    // overstates turnout on every multi-attempt test.
    const p = participation(
      [a({ studentId: "s1" }), a({ studentId: "s1" }), a({ studentId: "s2" })],
      10,
    );
    expect(p.started).toBe(2);
    expect(p.submitted).toBe(2);
  });

  it("reports who never opened it", () => {
    const p = participation([a({ studentId: "s1" })], 30);
    expect(p.notStarted).toBe(29);
    expect(p.participationRate).toBeCloseTo(3.3, 1);
  });

  it("separates started-but-unfinished from submitted", () => {
    const p = participation(
      [a({ studentId: "s1", status: "in_progress" }), a({ studentId: "s2" })],
      2,
    );
    expect(p.started).toBe(2);
    expect(p.submitted).toBe(1);
    expect(p.inProgress).toBe(1);
    expect(p.completionRate).toBe(50);
  });

  it("returns null rather than 0 when the audience is unknowable", () => {
    // A public link is open to people on no roster. Reporting 0 assigned makes
    // participation read as infinite or as a divide-by-zero dash.
    const p = participation([a({ studentId: null })], null);
    expect(p.assigned).toBeNull();
    expect(p.notStarted).toBeNull();
    expect(p.participationRate).toBeNull();
    expect(p.started).toBe(1);
  });

  it("counts anonymous takers individually", () => {
    // They have no id to de-duplicate on, so each attempt is a person.
    const p = participation([a({ studentId: null }), a({ studentId: null })], null);
    expect(p.started).toBe(2);
  });

  it("never reports negative not-started", () => {
    // More attempts than assigned happens with a public link on an assigned
    // test, and "-3 students have not started" helps nobody.
    expect(participation([a({ studentId: "s1" }), a({ studentId: "s2" })], 1).notStarted).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the spread, over final results only", () => {
  it("excludes papers still awaiting a teacher", () => {
    // Averaging in a paper whose essays are unmarked reports a mark nobody gave.
    const s = scoreSpread([
      a({ percentage: 80 }),
      a({ percentage: 10, awaitingEvaluation: true }),
    ]);
    expect(s.average).toBe(80);
    expect(s.basis).toBe(1);
    expect(s.awaitingEvaluation).toBe(1);
  });

  it("says how many papers the average is over", () => {
    // An average that quietly covers half the cohort is the same lie as one
    // that includes unmarked zeros.
    expect(scoreSpread([a(), a(), a()]).basis).toBe(3);
  });

  it("ignores attempts that were never submitted", () => {
    expect(scoreSpread([a({ status: "in_progress", percentage: 0 })]).basis).toBe(0);
  });

  it("returns null, not 0, when nothing is final", () => {
    // "Nobody has sat this yet" and "everybody scored nothing" are opposite
    // facts and must not render identically.
    const s = scoreSpread([]);
    expect(s.average).toBeNull();
    expect(s.highest).toBeNull();
    expect(s.lowest).toBeNull();
  });

  it("computes a median that survives an even count", () => {
    const s = scoreSpread([a({ percentage: 10 }), a({ percentage: 20 }), a({ percentage: 30 }), a({ percentage: 40 })]);
    expect(s.median).toBe(25);
    expect(s.lowest).toBe(10);
    expect(s.highest).toBe(40);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("score distribution", () => {
  it("uses fixed bands so two tests stay comparable", () => {
    const bands = scoreDistribution([a({ percentage: 5 }), a({ percentage: 85 })]);
    expect(bands.map((b) => b.label)).toEqual([
      "0–20%",
      "20–40%",
      "40–60%",
      "60–80%",
      "80–100%",
    ]);
    expect(bands[0].count).toBe(1);
    expect(bands[4].count).toBe(1);
  });

  it("puts a perfect score in the top band, not off the end", () => {
    expect(scoreDistribution([a({ percentage: 100 })])[4].count).toBe(1);
  });

  it("leaves unmarked papers out entirely", () => {
    // Filing them in 0–20% because the essays are unmarked libels the student.
    const bands = scoreDistribution([a({ percentage: 0, awaitingEvaluation: true })]);
    expect(bands.reduce((s, b) => s + b.count, 0)).toBe(0);
  });

  it("counts a boundary score once, in the upper band", () => {
    expect(scoreDistribution([a({ percentage: 60 })])[3].count).toBe(1);
    expect(scoreDistribution([a({ percentage: 60 })])[2].count).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("comparing cohorts", () => {
  it("ranks by average but carries the sample size", () => {
    // A batch with one finished paper is not top of the class, and a league
    // table built on n=1 is worse than no league table.
    const rows = cohortComparison([
      a({ batchName: "A", percentage: 90 }),
      a({ batchName: "B", percentage: 70 }),
      a({ batchName: "B", percentage: 80 }),
    ]);
    expect(rows[0].label).toBe("A");
    expect(rows[0].basis).toBe(1);
    expect(rows[1].basis).toBe(2);
  });

  it("groups the batchless under one honest heading", () => {
    expect(cohortComparison([a({ batchName: null })])[0].label).toBe("Unassigned");
    expect(cohortComparison([a({ batchName: "  " })])[0].label).toBe("Unassigned");
  });

  it("puts cohorts with no final result last, not first", () => {
    const rows = cohortComparison([
      a({ batchName: "Marked", percentage: 40 }),
      a({ batchName: "Unmarked", awaitingEvaluation: true }),
    ]);
    expect(rows[0].label).toBe("Marked");
    expect(rows[1].average).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("per-question outcomes", () => {
  const answers = [
    { questionId: "q1", attempted: true, isCorrect: true },
    { questionId: "q1", attempted: true, isCorrect: false },
    { questionId: "q1", attempted: false },
    { questionId: "q2", attempted: false },
    { questionId: "q2", attempted: false },
    { questionId: "q2", attempted: true, isCorrect: true },
  ];

  it("measures accuracy over ATTEMPTED, and reports skips separately", () => {
    // A question 30 people skipped and 2 answered correctly is 100% accurate
    // and almost certainly a disaster. Folding skips in would hide that; so
    // would leaving them out entirely.
    const out = questionOutcomes(answers);
    const q2 = out.find((o) => o.questionId === "q2")!;
    expect(q2.accuracy).toBe(100);
    expect(q2.skipped).toBe(2);
    expect(q2.attempted).toBe(1);
  });

  it("gives a question nobody attempted a null accuracy, not 0", () => {
    const out = questionOutcomes([{ questionId: "q9", attempted: false }]);
    expect(out[0].accuracy).toBeNull();
  });

  it("does not count an unmarked answer as wrong", () => {
    // It has no verdict yet. Calling it incorrect moves the number in a
    // direction nobody chose.
    const out = questionOutcomes([
      { questionId: "q1", attempted: true, isCorrect: null, pendingReview: true },
    ]);
    expect(out[0].attempted).toBe(1);
    expect(out[0].correct).toBe(0);
  });

  it("finds the hardest, ignoring ones nobody tried", () => {
    const out = questionOutcomes([
      ...answers,
      { questionId: "q3", attempted: false },
    ]);
    const hardest = hardestQuestions(out, 3);
    expect(hardest.map((h) => h.questionId)).not.toContain("q3");
    expect(hardest[0].questionId).toBe("q1"); // 50% vs q2's 100%
  });

  it("finds the most skipped", () => {
    expect(mostSkipped(questionOutcomes(answers), 1)[0].questionId).toBe("q2");
  });
});
