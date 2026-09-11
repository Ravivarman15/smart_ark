import { describe, it, expect } from "vitest";
import { readSource, readSql, readTs } from "./sourceGate";

const MIGRATION = readSql("supabase/migrations/20261014_online_test_security.sql");
const FN = readTs("supabase/functions/_shared/testEngine.ts");
const ENTRY = readTs("supabase/functions/online-test/index.ts");
const GRADER = readSource("supabase/functions/_shared/grading.ts");
const CLIENT = readTs("src/features/exams/services/onlineTest.service.ts");
const ATTEMPT_SERVICE = readTs("src/features/exams/services/mcqAttempt.service.ts");

// ═════════════════════════════════════════════════════════════════════════════
describe("a student cannot write their own mark", () => {
  it("leaves NO client write policy on the attempt tables", () => {
    // The engine shipped with one `FOR ALL` policy per table whose only test
    // was organization_id — no ownership predicate at all. Every signed-in
    // member of the org could set any score on any attempt.
    expect(MIGRATION).toContain('drop policy if exists "all mcq_attempts"');
    expect(MIGRATION).toContain('drop policy if exists "all mcq_answers"');
    expect(MIGRATION).toContain('drop policy if exists "all mcq_attempt_events"');
  });

  it("recreates them as SELECT only", () => {
    const created = MIGRATION.match(/create policy "[^"]*mcq_(attempts|answers|attempt_events)"[^;]*/g) ?? [];
    expect(created.length).toBeGreaterThanOrEqual(5);
    for (const p of created) expect(p).toContain("for select");
  });

  it("never grants insert, update or delete back to a client role", () => {
    for (const verb of ["for insert", "for update", "for delete", "for all"]) {
      const near = MIGRATION.split("\n").filter(
        (l) => l.includes(verb) && l.includes("mcq_"),
      );
      expect(near, `${verb} reappeared on an attempt table`).toEqual([]);
    }
  });

  it("removes the browser's start / autosave / submit rather than leaving them to fail", () => {
    // This is the important half. An RLS-filtered UPDATE does not raise:
    // PostgREST answers 204 with error null. Left in place, `submit` would have
    // reported success, shown a score, and written nothing at all.
    expect(ATTEMPT_SERVICE).not.toContain("async startOrResume");
    expect(ATTEMPT_SERVICE).not.toContain("async autosave");
    expect(ATTEMPT_SERVICE).not.toContain("async submit");
    expect(ATTEMPT_SERVICE).not.toContain("scoreAttempt(");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the answer key never reaches the taker", () => {
  it("drops every anon policy from the tables that hold it", () => {
    expect(MIGRATION).toContain('drop policy if exists "anon read mcq_questions"');
    expect(MIGRATION).toContain('drop policy if exists "anon read mcq_papers"');
    expect(MIGRATION).toContain('drop policy if exists "anon read mcq_paper_questions"');
  });

  it("builds the taker's question fresh instead of spreading the row", () => {
    // `{ ...q }` minus a few fields works until someone adds a column. Building
    // a new object means a NEW answer-key field is absent by default rather
    // than leaked by default.
    const body = FN.slice(
      FN.indexOf("export function publicQuestion"),
      FN.indexOf("export function seededShuffle"),
    );
    expect(body).not.toContain("...q");
    expect(body).not.toContain("isCorrect");
    expect(body).not.toContain("explanation");
    expect(body).not.toContain("numericalAnswer");
    expect(body).not.toContain("answerText");
  });

  it("shuffles the matching column so the two arrays are not the key", () => {
    // A matching question is unanswerable without both columns, so the right
    // one has to travel. Sent in pair order it IS the answer.
    const body = FN.slice(FN.indexOf("export function publicQuestion"), FN.indexOf("export function seededShuffle"));
    expect(body).toContain("matchChoices");
    expect(body).toContain(".sort(");
  });

  it("has no way to express a key in the type the client receives", () => {
    const iface = CLIENT.slice(
      CLIENT.indexOf("export interface PublicOption"),
      CLIENT.indexOf("export interface OnlineTestAttempt"),
    );
    expect(iface).not.toContain("isCorrect");
    expect(iface).not.toContain("explanation");
    expect(iface).not.toMatch(/\bnumericalAnswer\b/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("there is exactly one grader", () => {
  it("the canonical one has no imports, so both runtimes can load it", () => {
    // One `import` line and either Deno or the browser bundle stops being able
    // to load this file, and the copy-paste starts.
    const imports = GRADER.split("\n").filter((l) => /^\s*import\s/.test(l));
    expect(imports).toEqual([]);
  });

  it("the app re-exports it rather than reimplementing it", () => {
    const scoring = readSource("src/features/exams/utils/mcqScoring.ts");
    expect(scoring).toContain("supabase/functions/_shared/grading.ts");
    expect(scoring).toContain("gradeAnswer as scoreAnswer");
    expect(scoring).toContain("gradeAttempt as scoreAttempt");
  });

  it("the edge function grades with it and not with something of its own", () => {
    expect(FN).toContain('from "./grading.ts"');
    expect(FN).toContain("gradeAttempt(");
    // A second implementation would show up as its own comparison logic.
    expect(FN).not.toContain("o.isCorrect === true &&");
  });

  it("refuses to score a subjective answer zero", () => {
    // An essay is not worth nothing; it is worth nothing YET. Scoring it 0
    // would drag down the percentage of a student who answered in full.
    expect(GRADER).toContain("pendingReview = true");
    expect(GRADER).toContain("isAutoEvaluableType");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the caller never names the tenant, the student or the mark", () => {
  it("derives the organization from the verified identity", () => {
    expect(ENTRY).toContain("resolveCaller(req, db)");
    expect(ENTRY).toContain("caller.organizationId");
    // The one thing that must never appear: an org read off the request.
    expect(ENTRY).not.toMatch(/body\.organi[sz]ation/i);
    expect(ENTRY).not.toMatch(/body\.orgId/);
  });

  it("checks the named student belongs to the caller's own organization", () => {
    const resolver = ENTRY.slice(
      ENTRY.indexOf("async function resolveTaker"),
      ENTRY.indexOf("function channelAllowed"),
    );
    expect(resolver).toContain('.eq("organization_id", caller.organizationId)');
    expect(resolver).toContain("parent_student_links");
  });

  it("gives the same answer for 'no such student' and 'not your student'", () => {
    // Two different messages turn this endpoint into a way to test whether a
    // uuid exists inside another tenant.
    const occurrences = ENTRY.split("That student is not available for this test.").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it("stamps organization_id on every write instead of trusting the column default", () => {
    // The default is current_org_id(), which is NULL under the service role
    // once a second organization exists. stampOrg THROWS instead.
    expect(FN).toContain("stampOrg");
    expect(FN).toContain("stampOrgAll");
  });

  it("re-resolves the taker against the ATTEMPT's own student", () => {
    // Otherwise holding an attempt id would be enough to autosave into someone
    // else's paper.
    expect(ENTRY).toContain("resolveTaker(db, req, attempt.student_id)");
  });

  it("accepts no score, and no elapsed time, from the client", () => {
    expect(ENTRY).not.toMatch(/body\.(totalScore|total_score|score|percentage)/);
    expect(CLIENT).not.toMatch(/timeSpentSeconds:\s*elapsed/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("submitting twice is the same submission", () => {
  it("grades only an attempt that is still in progress", () => {
    // The conditional UPDATE is what makes it idempotent: a double-click, a
    // retry after a dropped response, and the timer racing the button all match
    // zero rows the second time.
    const grade = FN.slice(FN.indexOf("export async function gradeAndPersist"), FN.indexOf("export function visibleResult"));
    expect(grade).toContain('.eq("status", "in_progress")');
  });

  it("answers an already-submitted attempt with its result, not an error", () => {
    // Telling a student their submission failed invites them to submit again.
    expect(FN).toContain("alreadySubmitted: true");
  });

  it("stops two tabs opening two attempts, in the database", () => {
    // The race is between two processes; no amount of care in one can see the
    // other. The loser's answers would autosave into an attempt nobody submits.
    expect(MIGRATION).toContain("create unique index if not exists uq_mcq_attempts_one_in_progress");
    expect(MIGRATION).toContain("where status = 'in_progress'");
    // And the function has to turn that failure back into "resume yours".
    expect(FN).toContain("insErr");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the clock belongs to the server", () => {
  it("recomputes remaining time from started_at", () => {
    expect(FN).toContain("export function remainingSeconds");
    expect(FN).toContain("new Date(startedAt).getTime()");
  });

  it("enforces the deadline on autosave, not only on submit", () => {
    // A tab still autosaving past its time is exactly the case a client-side
    // timer misses.
    const save = FN.slice(FN.indexOf("export async function saveAnswers"), FN.indexOf("export async function submitAttempt"));
    expect(save).toContain("remainingSeconds(");
    expect(save).toContain("auto_submitted");
  });

  it("settles a resumed attempt whose time already ran out", () => {
    expect(FN).toContain("Time expired before resume");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("proctor controls are staff-only", () => {
  it("checks the role on the server, not in the menu", () => {
    const block = ENTRY.slice(ENTRY.indexOf('action === "force_submit"'));
    expect(block).toContain('owner.taker.channel !== "staff"');
    expect(block).toContain("Only staff can do that.");
  });

  it("only lets a save touch questions that are on this attempt's paper", () => {
    // Otherwise a crafted save creates answer rows for arbitrary question ids
    // and moves the marking denominator.
    expect(FN).toContain("const allowed = new Set<string>(attempt.question_order");
    expect(FN).toContain("allowed.has(String(d.questionId))");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("existing exam data is untouched", () => {
  it("writes no rows at all", () => {
    expect(MIGRATION).not.toMatch(/^\s*(insert|update|delete)\s+/m);
  });

  it("does not touch the manual-exam tables", () => {
    // ARK has 335 exams and 1,489 exam_results in them.
    expect(MIGRATION).not.toMatch(/alter table public\.exams\b/);
    expect(MIGRATION).not.toMatch(/alter table public\.exam_results\b/);
  });

  it("is re-runnable", () => {
    expect(MIGRATION).toContain("drop policy if exists");
    expect(MIGRATION).toContain("create unique index if not exists");
    expect(MIGRATION).toContain("create index if not exists");
  });
});
