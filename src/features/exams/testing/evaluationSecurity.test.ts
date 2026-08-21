import { describe, it, expect } from "vitest";
import { readSql, readTs } from "./sourceGate";

// ─────────────────────────────────────────────────────────────────────────────
// MARKING WITHOUT REOPENING THE SCORE-TAMPERING HOLE
//
// Phase B removed every client write policy from mcq_answers and mcq_attempts
// because the browser was writing its own marks. Phase I needs a teacher to
// write a mark — and the obvious implementation, an UPDATE policy scoped to
// staff, hands every signed-in teacher a browser PATCH on any answer in the
// organization, including the auto-graded ones.
//
// These pin the properties that keep the two apart.
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATION = readSql("supabase/migrations/20261017_online_test_evaluation.sql");
const ENGINE = readTs("supabase/functions/_shared/testEngine.ts");
const ENTRY = readTs("supabase/functions/online-test/index.ts");
const PUBLIC_FN = readTs("supabase/functions/public-test/index.ts");

// ═════════════════════════════════════════════════════════════════════════════
describe("evaluation does not reopen client writes", () => {
  it("adds no policy at all", () => {
    expect(MIGRATION).not.toContain("create policy");
  });

  it("asserts the tables are still SELECT-only, rather than assuming it", () => {
    // A later migration that quietly adds a write policy fails HERE, in the
    // migration, rather than being discovered by a student.
    expect(MIGRATION).toContain("cmd <> 'select'");
    expect(MIGRATION).toContain("raise exception");
  });

  it("writes the mark from the edge function under the service role", () => {
    expect(ENGINE).toContain("export async function evaluateAnswer");
    expect(ENTRY).toContain('action === "evaluate"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("who may mark", () => {
  const block = ENTRY.slice(ENTRY.indexOf('action === "marking_queue"'));

  it("requires a verified staff caller", () => {
    expect(block).toContain("requireStaff(db, req)");
  });

  it("takes the organization from the caller, never the body", () => {
    // Otherwise a marker reaches into another tenant's papers by id.
    expect(block).toContain("staff.organizationId");
    expect(block).not.toMatch(/body\.organi[sz]ation/i);
  });

  it("scopes the answer lookup to that organization", () => {
    const fn = ENGINE.slice(
      ENGINE.indexOf("export async function evaluateAnswer"),
      ENGINE.indexOf("export async function settleAttempt"),
    );
    expect(fn).toContain('.eq("organization_id", organizationId)');
  });

  it("is absent from the anonymous endpoint entirely", () => {
    expect(PUBLIC_FN).not.toContain("evaluate");
    expect(PUBLIC_FN).not.toContain("marking_queue");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a mark cannot corrupt an auto-graded answer", () => {
  const fn = ENGINE.slice(
    ENGINE.indexOf("export async function evaluateAnswer"),
    ENGINE.indexOf("export async function settleAttempt"),
  );

  it("refuses an answer the machine already settled", () => {
    expect(fn).toContain("answer.pending_review");
    expect(fn).toContain("marked automatically");
  });

  it("clamps the mark to the question's own maximum", () => {
    // Above the maximum silently breaks every percentage that divides by it;
    // below zero imports the auto-grader's negative-marking rule into a human
    // judgement where it does not belong.
    expect(fn).toContain("Math.min(Math.max(");
  });

  it("clears pending_review so the attempt can settle", () => {
    expect(fn).toContain("pending_review: false");
  });

  it("records who marked it and when", () => {
    // Without provenance a disputed mark has no author, and a human mark is
    // indistinguishable from a machine one.
    expect(fn).toContain("evaluated_by");
    expect(fn).toContain("evaluated_at");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("settling re-sums, and never re-grades", () => {
  const fn = ENGINE.slice(
    ENGINE.indexOf("export async function settleAttempt"),
    ENGINE.indexOf("export async function markingQueue"),
  );

  it("does NOT call the grader", () => {
    // gradeAttempt() recomputes every answer from the answer key, so it would
    // overwrite the mark a human just entered with the zero the machine gives
    // an essay it cannot read.
    expect(fn).not.toContain("gradeAttempt(");
    expect(fn).not.toContain("gradeAndPersist(");
  });

  it("totals the stored per-answer marks instead", () => {
    expect(fn).toContain('.select("awarded, max_marks, pending_review")');
    expect(fn).toContain("Number(a.awarded ?? 0)");
  });

  it("keeps is_pass NULL while anything is unmarked", () => {
    // Declaring a fail on a paper nobody has finished reading is the specific
    // wrong answer here.
    expect(fn).toContain("is_pass: awaiting ? null :");
  });

  it("clears awaiting_evaluation only when nothing is left", () => {
    expect(fn).toContain("stillPending.length > 0");
    expect(fn).toContain("awaiting_evaluation: awaiting");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the queue is fair", () => {
  const fn = ENGINE.slice(ENGINE.indexOf("export async function markingQueue"));

  it("is oldest first", () => {
    // A student waiting three days should not be overtaken by one who
    // submitted this morning, which is what newest-first quietly does.
    expect(fn).toContain('.order("answered_at", { ascending: true })');
  });

  it("only ever returns unmarked answers", () => {
    expect(fn).toContain('.eq("pending_review", true)');
  });

  it("stays inside one organization on every lookup", () => {
    const scoped = (fn.match(/\.eq\("organization_id", organizationId\)/g) ?? []).length;
    // The answers, the attempts, the questions and the exams are four separate
    // reads; every one of them has to be scoped, not just the first.
    expect(scoped).toBeGreaterThanOrEqual(4);
  });

  it("caps how much it returns", () => {
    expect(fn).toContain("Math.min(Math.max(limit, 1), 200)");
  });
});
