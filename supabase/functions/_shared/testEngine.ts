// ═════════════════════════════════════════════════════════════════════════════
// THE TEST ENGINE — everything that happens after we know who is sitting down.
//
// ┌── WHY THIS IS SHARED AND NOT DUPLICATED ───────────────────────────────┐
// │ There are two ways to reach a test:                                    │
// │                                                                        │
// │   online-test  — a signed-in staff member proctoring, or a parent      │
// │                  launching their own child's assigned test             │
// │   public-test  — anyone holding a link, with no session at all         │
// │                                                                        │
// │ Those two differ in EXACTLY ONE THING: how the taker is identified.    │
// │ Everything downstream — the eligibility check, the frozen question     │
// │ order, autosave, the deadline, grading, idempotency, result visibility │
// │ — must behave identically, because a mark that depends on which link   │
// │ a student used is not a mark.                                          │
// │                                                                        │
// │ So identity resolution lives in the two entry points, and this file    │
// │ holds the rest. A second copy of `submit` is a second set of rules     │
// │ about when an attempt closes.                                          │
// └────────────────────────────────────────────────────────────────────────┘
//
// The public entry point runs with verify_jwt = false, which is why NOTHING in
// here may infer authority from the request. Every function below takes an
// already-resolved `Taker` and trusts only that.
// ═════════════════════════════════════════════════════════════════════════════

import { stampOrg, stampOrgAll } from "./auth.ts";
import {
  gradeAttempt,
  type GradableQuestion,
  type GradableResponse,
  type GradableType,
} from "./grading.ts";

// deno-lint-ignore no-explicit-any
export type Db = any;

/** Autosave drafts per call. A long paper is ~100 questions; 500 is generous. */
export const MAX_DRAFTS = 500;

/** How the taker proved who they are. Recorded on the attempt and its events. */
export type TakerChannel = "staff" | "parent" | "public_link";

/**
 * A resolved taker.
 *
 * Every field is derived server-side. `organizationId` is the tenant boundary
 * for every query below, and `participantKey` is the identity the attempt
 * limit and the one-attempt-at-a-time index are enforced against.
 *
 * `studentId` is null for a guest arriving through a public link who is not a
 * student of the organization. That is why mcq_attempts.student_id is nullable
 * — see 20261016.
 */
export interface Taker {
  organizationId: string;
  studentId: string | null;
  studentName: string | null;
  batchId: string | null;
  batchName: string | null;
  participantKey: string;
  channel: TakerChannel;
  guest?: { name: string | null; email: string | null; mobile: string | null };
}

export interface EngineError {
  error: string;
  status: number;
}

export const isError = (v: unknown): v is EngineError =>
  !!v && typeof v === "object" && "error" in (v as Record<string, unknown>);

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY KEYS
// ─────────────────────────────────────────────────────────────────────────────
/** A stable key for a guest, so their attempts can be counted and limited. */
export async function guestParticipantKey(
  examId: string,
  identity: { email?: string | null; mobile?: string | null; name?: string | null },
): Promise<string> {
  // Hashed, not stored raw in the key: participant_key ends up in an index and
  // in logs, and an email address does not need to be in either. Salted with
  // the exam id so the same person sitting two tests is not linkable across
  // them by comparing keys.
  const basis = [
    examId,
    (identity.email ?? "").trim().toLowerCase(),
    (identity.mobile ?? "").replace(/\D/g, ""),
    (identity.name ?? "").trim().toLowerCase(),
  ].join("|");
  const bytes = new TextEncoder().encode(basis);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `guest:${hex}`;
}

export const studentParticipantKey = (studentId: string): string =>
  `student:${studentId}`;

// ─────────────────────────────────────────────────────────────────────────────
// LOADING THE PAPER
// ─────────────────────────────────────────────────────────────────────────────
export interface LoadedQuestion extends GradableQuestion {
  questionText: string;
  explanation: string | null;
  imageUrl: string | null;
  marksOverride: number | null;
  sortOrder: number;
  difficulty: string;
  hasFormula: boolean;
}

/** Read a paper's questions, answer keys and all. SERVER SIDE ONLY. */
export async function loadPaper(
  db: Db,
  paperId: string,
  organizationId: string,
): Promise<LoadedQuestion[]> {
  const { data: links } = await db
    .from("mcq_paper_questions")
    .select("question_id, sort_order, marks_override")
    .eq("paper_id", paperId)
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  const rows = links ?? [];
  if (rows.length === 0) return [];

  const { data: questions } = await db
    .from("mcq_questions")
    .select(
      "id, question_text, question_type, marks, negative_marks, options, " +
        "numerical_answer, answer_text, match_pairs, explanation, image_url, " +
        "difficulty, has_formula",
    )
    .in("id", rows.map((r: Db) => r.question_id))
    .eq("organization_id", organizationId);

  const byId = new Map((questions ?? []).map((q: Db) => [q.id, q]));

  return rows
    .map((link: Db) => {
      const q = byId.get(link.question_id);
      if (!q) return null;
      return {
        id: q.id,
        questionText: q.question_text ?? "",
        questionType: (q.question_type ?? "single") as GradableType,
        marks: Number(q.marks ?? 1),
        negativeMarks: Number(q.negative_marks ?? 0),
        options: Array.isArray(q.options) ? q.options : [],
        numericalAnswer: q.numerical_answer ?? null,
        answerText: q.answer_text ?? null,
        matchPairs: Array.isArray(q.match_pairs) ? q.match_pairs : [],
        explanation: q.explanation ?? null,
        imageUrl: q.image_url ?? null,
        marksOverride: link.marks_override ?? null,
        sortOrder: Number(link.sort_order ?? 0),
        difficulty: q.difficulty ?? "medium",
        hasFormula: !!q.has_formula,
      } as LoadedQuestion;
    })
    .filter(Boolean) as LoadedQuestion[];
}

/**
 * The ONLY shape a question takes on its way to a taker.
 *
 * Note what the return type cannot express: no `isCorrect`, no `answerText`, no
 * `numericalAnswer`, no `explanation`. Built fresh rather than spread-and-delete
 * — a spread works until someone adds a column, whereas constructing a new
 * object makes a NEW answer-key field absent by default rather than leaked by
 * default.
 */
export function publicQuestion(q: LoadedQuestion) {
  const pairs = q.matchPairs ?? [];
  return {
    id: q.id,
    questionText: q.questionText,
    questionType: q.questionType,
    marks: q.marksOverride != null && q.marksOverride > 0 ? q.marksOverride : q.marks,
    negativeMarks: q.negativeMarks,
    difficulty: q.difficulty,
    hasFormula: q.hasFormula,
    imageUrl: q.imageUrl,
    options: (q.options ?? []).map((o) => ({
      id: o.id,
      text: o.text,
      imageUrl: (o as { imageUrl?: string }).imageUrl ?? null,
    })),
    // A matching question is unanswerable without BOTH columns, so withholding
    // the right-hand one is not an option. What must not survive is the
    // PAIRING: sent in pair order, the two arrays ARE the answer key. Sorting
    // by (value + question id) breaks the correspondence deterministically, so
    // the choices are stable across a refresh and never aligned to the prompts.
    matchPrompts: pairs.map((p) => p.left),
    matchChoices: pairs
      .map((p) => p.right)
      .sort((a, b) => (a + q.id).localeCompare(b + q.id)),
  };
}

/** Deterministic shuffle — the same seed always yields the same order. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// ELIGIBILITY, THE WINDOW AND THE CLOCK
// ─────────────────────────────────────────────────────────────────────────────
/**
 * May this student sit this exam?
 *
 * Asked regardless of how the taker arrived, because hiding a card in a portal
 * is not access control. An exam with NO assignments is open to the whole
 * organization — that is the existing meaning of an unassigned exam, and
 * changing it here would silently close exams that are already running.
 *
 * A guest on a public link has no student row, so assignment cannot apply to
 * them; the link itself is their authorisation.
 */
export async function isEligible(
  db: Db,
  examId: string,
  organizationId: string,
  studentId: string | null,
): Promise<boolean> {
  const { data: rows } = await db
    .from("mcq_exam_assignments")
    .select("scope_type, scope_id")
    .eq("exam_id", examId)
    .eq("organization_id", organizationId);

  const assignments = rows ?? [];
  if (assignments.length === 0) return true;
  if (assignments.some((a: Db) => a.scope_type === "all")) return true;
  if (!studentId) return false;

  const { data: student } = await db
    .from("students")
    .select("id, batch_id, standard_id")
    .eq("id", studentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!student) return false;

  return assignments.some((a: Db) => {
    if (a.scope_type === "student") return a.scope_id === student.id;
    if (a.scope_type === "batch") return a.scope_id === student.batch_id;
    if (a.scope_type === "standard") return a.scope_id === student.standard_id;
    return false;
  });
}

/** Server-truth remaining seconds. Never trust a timer that lived in a tab. */
export function remainingSeconds(startedAt: string, durationMinutes: number): number {
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  return Math.max(0, Math.floor(durationMinutes * 60 - elapsed));
}

/** Is the exam open right now? Returns the reason it is not, or null. */
export function windowError(exam: Db): string | null {
  if (exam.live_status === "ended") return "This test has ended.";
  if (exam.window_start && new Date(exam.window_start).getTime() > Date.now()) {
    return "This test has not opened yet.";
  }
  if (exam.window_end && new Date(exam.window_end).getTime() < Date.now()) {
    return "This test has closed.";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────────────────────
/** Append an attempt event. Best-effort: a missing trail must not fail a submit. */
export async function logEvent(
  db: Db,
  attempt: Db,
  eventType: string,
  detail: string,
  severity = "info",
) {
  try {
    // stampOrg rather than a literal: it THROWS on a missing tenant instead of
    // letting the column DEFAULT resolve, and that default is current_org_id(),
    // which is NULL under the service role.
    await db.from("mcq_attempt_events").insert(
      stampOrg(
        { attempt_id: attempt.id, event_type: eventType, detail, severity },
        attempt.organization_id,
        "attempt event",
      ),
    );
  } catch {
    // Intentionally swallowed.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADING
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Grade an attempt and write the result.
 *
 * Separate from the `submit` action because auto-submission on timeout takes
 * exactly this path: a deadline that produced a different score from a button
 * press would be a second grader by another name.
 */
export async function gradeAndPersist(
  db: Db,
  attempt: Db,
  exam: Db,
  questions: LoadedQuestion[],
  status: "submitted" | "auto_submitted",
) {
  const { data: answerRows } = await db
    .from("mcq_answers")
    .select("id, question_id, selected_option_ids, numeric_value, text_value")
    .eq("attempt_id", attempt.id)
    .eq("organization_id", attempt.organization_id);

  const answers = answerRows ?? [];
  const responses: GradableResponse[] = answers.map((a: Db) => ({
    questionId: a.question_id,
    selectedOptionIds: a.selected_option_ids ?? [],
    numericValue: a.numeric_value ?? null,
    textValue: a.text_value ?? null,
  }));

  const overrides: Record<string, number | null> = {};
  for (const q of questions) overrides[q.id] = q.marksOverride;

  const result = gradeAttempt(questions, responses, !!exam.negative_marking, overrides);

  const scored = new Map(result.answers.map((a) => [a.questionId, a]));
  await Promise.all(
    answers.map((a: Db) => {
      const s = scored.get(a.question_id);
      if (!s) return Promise.resolve();
      return db
        .from("mcq_answers")
        .update({
          is_correct: s.correct,
          awarded: s.awarded,
          max_marks: s.maxMarks,
          pending_review: !!s.pendingReview,
        })
        .eq("id", a.id);
    }),
  );

  // An unmarked essay makes the percentage provisional, so pass/fail cannot be
  // decided yet. Reporting "failed" on work nobody has read would be wrong, so
  // it stays NULL until a teacher finishes the paper.
  const isPass = result.awaitingEvaluation
    ? null
    : result.percentage >= Number(exam.pass_percentage ?? 35);

  const elapsed = Math.floor(
    (Date.now() - new Date(attempt.started_at).getTime()) / 1000,
  );

  const { data: updated } = await db
    .from("mcq_attempts")
    .update({
      status,
      submitted_at: new Date().toISOString(),
      time_spent_seconds: Math.max(0, elapsed),
      total_score: result.totalAwarded,
      max_score: result.totalMax,
      percentage: result.percentage,
      correct_count: result.correctCount,
      wrong_count: result.wrongCount,
      unattempted_count: result.unattemptedCount,
      is_pass: isPass,
      pending_marks: result.pendingMarks,
      awaiting_evaluation: result.awaitingEvaluation,
    })
    .eq("id", attempt.id)
    // Only an in-progress attempt may be graded. This is what makes submission
    // idempotent: a double-click, a retry after a dropped connection and the
    // timer racing the button all match zero rows the second time.
    .eq("status", "in_progress")
    .select("*")
    .maybeSingle();

  return { result, attempt: updated };
}

/** What a taker may know about their own result, and when. */
export function visibleResult(attempt: Db, exam: Db) {
  const release = exam.result_release ?? "immediate";
  const published = exam.results_status === "published";
  const due =
    release === "immediate" ||
    published ||
    (release === "scheduled" &&
      exam.result_release_at &&
      new Date(exam.result_release_at).getTime() <= Date.now());

  if (!due) {
    return {
      released: false,
      message:
        "Your test has been submitted successfully. Results will be published later.",
    };
  }

  return {
    released: true,
    totalScore: Number(attempt.total_score ?? 0),
    maxScore: Number(attempt.max_score ?? 0),
    percentage: Number(attempt.percentage ?? 0),
    correctCount: Number(attempt.correct_count ?? 0),
    wrongCount: Number(attempt.wrong_count ?? 0),
    unattemptedCount: Number(attempt.unattempted_count ?? 0),
    isPass: attempt.is_pass,
    awaitingEvaluation: !!attempt.awaiting_evaluation,
    pendingMarks: Number(attempt.pending_marks ?? 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ACTIONS
// ─────────────────────────────────────────────────────────────────────────────
/** Load the mcq_exams config row joined to its exams parent. */
export async function loadExam(db: Db, examId: string, organizationId: string) {
  const { data } = await db
    .from("mcq_exams")
    .select(
      "*, exams!inner(id, title, instructions, status, results_status, organization_id)",
    )
    .eq("exam_id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return null;
  return { ...data, results_status: data.exams?.results_status };
}

/** Open a new attempt, or hand back the one already in progress. */
export async function startAttempt(
  db: Db,
  taker: Taker,
  examId: string,
): Promise<EngineError | Record<string, unknown>> {
  const exam = await loadExam(db, examId, taker.organizationId);
  if (!exam) return { error: "Test not found.", status: 404 };
  if (!exam.paper_id) {
    return { error: "This test has no question paper attached.", status: 409 };
  }

  const closed = windowError(exam);
  if (closed) return { error: closed, status: 409 };

  if (!(await isEligible(db, examId, taker.organizationId, taker.studentId))) {
    return { error: "This test has not been assigned to you.", status: 403 };
  }

  const questions = await loadPaper(db, exam.paper_id, taker.organizationId);
  if (questions.length === 0) {
    return { error: "The attached paper has no questions.", status: 409 };
  }

  const { data: prior } = await db
    .from("mcq_attempts")
    .select("*")
    .eq("exam_id", examId)
    .eq("organization_id", taker.organizationId)
    .eq("participant_key", taker.participantKey)
    .order("attempt_number", { ascending: false });

  const existing = prior ?? [];
  let attempt = existing.find((a: Db) => a.status === "in_progress");

  if (attempt) {
    // Resuming a timed-out attempt must not hand back a fresh paper — the
    // deadline already passed, so settle it instead of extending it.
    if (remainingSeconds(attempt.started_at, Number(exam.duration_minutes ?? 60)) <= 0) {
      await gradeAndPersist(db, attempt, exam, questions, "auto_submitted");
      await logEvent(db, attempt, "auto_submit", "Time expired before resume");
      return {
        error: "Your time for this test has expired and it has been submitted.",
        status: 409,
      };
    }
    await logEvent(db, attempt, "reconnect", `Resumed via ${taker.channel}`);
  } else {
    const used = existing.filter((a: Db) => a.status !== "abandoned").length;
    const limit = Number(exam.attempt_limit ?? 1);
    if (used >= limit) {
      return { error: `Attempt limit reached (${limit}).`, status: 409 };
    }

    const seed = Math.floor(Math.random() * 2147483647) + 1;
    const ids = questions.map((q) => q.id);
    const order = exam.shuffle_questions ? seededShuffle(ids, seed) : ids;

    const { data: created, error: insErr } = await db
      .from("mcq_attempts")
      .insert(
        stampOrg(
          {
            exam_id: examId,
            student_id: taker.studentId,
            student_name: taker.studentName,
            batch_id: taker.batchId,
            batch_name: taker.batchName,
            participant_key: taker.participantKey,
            access_mode: taker.channel,
            guest_name: taker.guest?.name ?? null,
            guest_email: taker.guest?.email ?? null,
            guest_mobile: taker.guest?.mobile ?? null,
            attempt_number: used + 1,
            status: "in_progress",
            shuffle_seed: seed,
            question_order: order,
            max_score: questions.reduce(
              (s, q) =>
                s + (q.marksOverride != null && q.marksOverride > 0 ? q.marksOverride : q.marks),
              0,
            ),
          },
          taker.organizationId,
          "attempt",
        ),
      )
      .select("*")
      .single();

    if (insErr) {
      // uq_mcq_attempts_participant_in_progress fired: another tab opened an
      // attempt between our read and our write. Its attempt is the real one,
      // so hand that back rather than reporting a failure.
      const { data: raced } = await db
        .from("mcq_attempts")
        .select("*")
        .eq("exam_id", examId)
        .eq("organization_id", taker.organizationId)
        .eq("participant_key", taker.participantKey)
        .eq("status", "in_progress")
        .maybeSingle();
      if (!raced) return { error: "Could not start this test.", status: 500 };
      attempt = raced;
    } else {
      attempt = created;
      await logEvent(db, attempt, "started", `Started via ${taker.channel}`);
    }
  }

  const ordered = (attempt.question_order ?? [])
    .map((id: string) => questions.find((q) => q.id === id))
    .filter(Boolean) as LoadedQuestion[];

  const { data: saved } = await db
    .from("mcq_answers")
    .select("question_id, selected_option_ids, numeric_value, text_value, marked_for_review")
    .eq("attempt_id", attempt.id)
    .eq("organization_id", attempt.organization_id);

  return {
    attempt: {
      id: attempt.id,
      examId: attempt.exam_id,
      studentId: attempt.student_id,
      studentName: attempt.student_name ?? attempt.guest_name,
      batchName: attempt.batch_name,
      attemptNumber: attempt.attempt_number,
      startedAt: attempt.started_at,
      status: attempt.status,
    },
    exam: {
      id: examId,
      title: exam.exams?.title ?? "",
      instructions: exam.exams?.instructions ?? "",
      durationMinutes: Number(exam.duration_minutes ?? 60),
      shuffleOptions: !!exam.shuffle_options,
      allowResume: exam.allow_resume ?? true,
      passPercentage: Number(exam.pass_percentage ?? 35),
    },
    remainingSeconds: remainingSeconds(
      attempt.started_at,
      Number(exam.duration_minutes ?? 60),
    ),
    questions: (ordered.length > 0 ? ordered : questions).map((q) => {
      const pub = publicQuestion(q);
      return exam.shuffle_options
        ? { ...pub, options: seededShuffle(pub.options, attempt.shuffle_seed ?? 1) }
        : pub;
    }),
    answers: (saved ?? []).map((a: Db) => ({
      questionId: a.question_id,
      selectedOptionIds: a.selected_option_ids ?? [],
      numericValue: a.numeric_value,
      textValue: a.text_value,
      markedForReview: !!a.marked_for_review,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKING WHAT A MACHINE CANNOT
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Record a teacher's mark on one subjective answer, then re-settle the attempt.
 *
 * ┌── WHY THIS DOES NOT CALL gradeAndPersist ──────────────────────────────┐
 * │ Re-grading would be the tidy-looking choice and it would be wrong.     │
 * │ `gradeAttempt()` recomputes EVERY answer from the answer key, so it    │
 * │ would overwrite the mark a human just entered with the zero the        │
 * │ machine assigns to an essay it cannot read. The teacher's decision     │
 * │ would survive exactly until the next essay on the same paper was       │
 * │ marked.                                                                │
 * │                                                                        │
 * │ So the totals are RE-SUMMED from the stored per-answer marks, which is │
 * │ the only representation that holds both kinds of decision at once. The │
 * │ auto-graded answers are already settled and are not touched.           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * `awarded` is clamped to [0, max_marks]: negative marking belongs to the
 * auto-grader's wrong-answer rule, not to a human deciding how good an essay
 * was, and a mark above the maximum silently breaks every percentage that
 * divides by it.
 */
export async function evaluateAnswer(
  db: Db,
  answerId: string,
  organizationId: string,
  evaluatorProfileId: string,
  awarded: number,
  comment: string | null,
): Promise<EngineError | Record<string, unknown>> {
  const { data: answer } = await db
    .from("mcq_answers")
    .select("id, attempt_id, max_marks, pending_review, organization_id")
    .eq("id", answerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!answer) return { error: "That answer is not available to you.", status: 403 };
  if (!answer.pending_review) {
    // Auto-graded answers are settled by the answer key, and a teacher
    // overriding one is a different feature with different rules — it would
    // need to survive a re-grade, which this deliberately does not.
    return {
      error: "That answer was marked automatically and cannot be re-marked here.",
      status: 409,
    };
  }

  const max = Number(answer.max_marks ?? 0);
  const mark = Math.min(Math.max(Number(awarded) || 0, 0), max);

  const { error: upErr } = await db
    .from("mcq_answers")
    .update({
      awarded: mark,
      // The mark is now a fact, so the flag that made it provisional comes off.
      pending_review: false,
      // A subjective answer has no right/wrong: `is_correct` is left NULL so
      // the correct/incorrect counters keep meaning "the machine judged this".
      evaluated_by: evaluatorProfileId,
      evaluated_at: new Date().toISOString(),
      evaluator_comment: comment ? String(comment).slice(0, 2000) : null,
    })
    .eq("id", answerId)
    .eq("organization_id", organizationId);
  if (upErr) return { error: "Could not save that mark.", status: 500 };

  return settleAttempt(db, answer.attempt_id, organizationId);
}

/**
 * Re-sum an attempt from its stored per-answer marks.
 *
 * Called after every evaluation, and it is what finally lets `is_pass` stop
 * being NULL: a pass cannot be decided while marks are missing, so it is
 * settled at the moment the last one arrives — not before, and not by a
 * scheduled job that might never run.
 */
export async function settleAttempt(
  db: Db,
  attemptId: string,
  organizationId: string,
): Promise<Record<string, unknown>> {
  const { data: answers } = await db
    .from("mcq_answers")
    .select("awarded, max_marks, pending_review")
    .eq("attempt_id", attemptId)
    .eq("organization_id", organizationId);

  const rows = answers ?? [];
  const total = rows.reduce((sum: number, a: Db) => sum + Number(a.awarded ?? 0), 0);
  const max = rows.reduce((sum: number, a: Db) => sum + Number(a.max_marks ?? 0), 0);
  const stillPending = rows.filter((a: Db) => a.pending_review === true);
  const pendingMarks = stillPending.reduce(
    (sum: number, a: Db) => sum + Number(a.max_marks ?? 0),
    0,
  );

  const { data: attempt } = await db
    .from("mcq_attempts")
    .select("id, exam_id, organization_id")
    .eq("id", attemptId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!attempt) return { ok: false };

  const exam = await loadExam(db, attempt.exam_id, organizationId);
  const passPct = Number(exam?.pass_percentage ?? 35);
  const percentage = max > 0 ? Math.round(((total / max) * 100 + Number.EPSILON) * 100) / 100 : 0;
  const awaiting = stillPending.length > 0;

  await db
    .from("mcq_attempts")
    .update({
      total_score: Math.round((total + Number.EPSILON) * 100) / 100,
      max_score: Math.round((max + Number.EPSILON) * 100) / 100,
      percentage,
      pending_marks: Math.round((pendingMarks + Number.EPSILON) * 100) / 100,
      awaiting_evaluation: awaiting,
      // Still NULL while anything is unmarked. Declaring a fail on a paper
      // nobody has finished reading is the specific wrong answer here.
      is_pass: awaiting ? null : percentage >= passPct,
    })
    .eq("id", attemptId)
    .eq("organization_id", organizationId);

  return { ok: true, awaitingEvaluation: awaiting, percentage, totalScore: total };
}

/**
 * The marking queue: unmarked subjective answers, oldest first.
 *
 * Oldest first because a student waiting three days for a mark should not be
 * overtaken by one who submitted this morning, which is what any
 * newest-first or grouped-by-exam ordering quietly does.
 */
export async function markingQueue(
  db: Db,
  organizationId: string,
  examId: string | null,
  limit = 50,
): Promise<Record<string, unknown>[]> {
  const { data: pending } = await db
    .from("mcq_answers")
    .select("id, attempt_id, question_id, text_value, max_marks, answered_at")
    .eq("organization_id", organizationId)
    .eq("pending_review", true)
    .order("answered_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 200));

  const rows = pending ?? [];
  if (rows.length === 0) return [];

  const { data: attempts } = await db
    .from("mcq_attempts")
    .select("id, exam_id, student_name, guest_name, batch_name, submitted_at")
    .in("id", Array.from(new Set(rows.map((r: Db) => r.attempt_id))))
    .eq("organization_id", organizationId);
  const attemptById = new Map((attempts ?? []).map((a: Db) => [a.id, a]));

  const { data: questions } = await db
    .from("mcq_questions")
    .select("id, question_text, question_type, marks")
    .in("id", Array.from(new Set(rows.map((r: Db) => r.question_id))))
    .eq("organization_id", organizationId);
  const questionById = new Map((questions ?? []).map((q: Db) => [q.id, q]));

  const { data: exams } = await db
    .from("exams")
    .select("id, title")
    .in(
      "id",
      Array.from(
        new Set((attempts ?? []).map((a: Db) => a.exam_id).filter(Boolean)),
      ),
    )
    .eq("organization_id", organizationId);
  const examById = new Map((exams ?? []).map((e: Db) => [e.id, e]));

  return rows
    // An answer whose attempt is filtered out by the exam filter, or whose
    // question has since been deleted, is dropped rather than rendered as a
    // blank card a teacher cannot act on.
    .filter((r: Db) => {
      const a = attemptById.get(r.attempt_id);
      if (!a) return false;
      if (examId && a.exam_id !== examId) return false;
      return questionById.has(r.question_id);
    })
    .map((r: Db) => {
      const a = attemptById.get(r.attempt_id);
      const q = questionById.get(r.question_id);
      return {
        answerId: r.id,
        attemptId: r.attempt_id,
        examId: a.exam_id,
        examTitle: examById.get(a.exam_id)?.title ?? "",
        studentName: a.student_name ?? a.guest_name ?? "Unnamed",
        batchName: a.batch_name ?? null,
        submittedAt: a.submitted_at,
        questionText: q.question_text ?? "",
        questionType: q.question_type ?? "long_answer",
        maxMarks: Number(r.max_marks ?? q.marks ?? 0),
        answerText: r.text_value ?? "",
      };
    });
}

/** Persist answer drafts. Never scores. Enforces the deadline. */
export async function saveAnswers(
  db: Db,
  attempt: Db,
  exam: Db,
  drafts: Db[],
): Promise<EngineError | Record<string, unknown>> {
  if (attempt.status !== "in_progress") {
    return { error: "This attempt has already been submitted.", status: 409 };
  }
  if (drafts.length > MAX_DRAFTS) {
    return { error: "Too many answers in one save.", status: 413 };
  }

  // Only questions actually on THIS attempt's paper may be written. Without
  // this, a crafted save could create answer rows for arbitrary question ids
  // and move the marking denominator.
  const allowed = new Set<string>(attempt.question_order ?? []);
  const rows = stampOrgAll(
    drafts
      .filter((d: Db) => d && allowed.has(String(d.questionId)))
      .map((d: Db) => ({
        attempt_id: attempt.id,
        question_id: String(d.questionId),
        selected_option_ids: Array.isArray(d.selectedOptionIds)
          ? d.selectedOptionIds.map(String)
          : [],
        numeric_value: typeof d.numericValue === "number" ? d.numericValue : null,
        text_value: typeof d.textValue === "string" ? d.textValue.slice(0, 20000) : null,
        marked_for_review: !!d.markedForReview,
        time_spent_seconds: Number(d.timeSpentSeconds ?? 0),
        answered_at: new Date().toISOString(),
      })),
    attempt.organization_id,
    "answer",
  );

  if (rows.length > 0) {
    const { error } = await db
      .from("mcq_answers")
      .upsert(rows, { onConflict: "attempt_id,question_id" });
    if (error) return { error: "Could not save your answers.", status: 500 };
  }

  await db
    .from("mcq_attempts")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", attempt.id);

  const left = remainingSeconds(attempt.started_at, Number(exam.duration_minutes ?? 60));

  // The deadline is enforced on SAVE, not only on submit: a tab still
  // autosaving past its time is exactly the case a client-side timer misses.
  if (left <= 0) {
    const questions = await loadPaper(db, exam.paper_id, attempt.organization_id);
    await gradeAndPersist(db, attempt, exam, questions, "auto_submitted");
    await logEvent(db, attempt, "auto_submit", "Time expired");
    return { saved: rows.length, remainingSeconds: 0, autoSubmitted: true };
  }

  return { saved: rows.length, remainingSeconds: left };
}

/** Close and grade an attempt. Idempotent. */
export async function submitAttempt(
  db: Db,
  attempt: Db,
  exam: Db,
  channel: TakerChannel,
): Promise<Record<string, unknown>> {
  // Already settled: report success rather than an error. A retry after a
  // dropped response is the SAME submission, and telling the taker it failed
  // would invite them to submit again.
  if (attempt.status !== "in_progress") {
    return { alreadySubmitted: true, result: visibleResult(attempt, exam) };
  }

  const questions = await loadPaper(db, exam.paper_id, attempt.organization_id);
  const timedOut =
    remainingSeconds(attempt.started_at, Number(exam.duration_minutes ?? 60)) <= 0;

  const graded = await gradeAndPersist(
    db,
    attempt,
    exam,
    questions,
    timedOut ? "auto_submitted" : "submitted",
  );

  if (!graded.attempt) {
    // The conditional UPDATE matched nothing, so another request graded it
    // first. Read back what that one wrote instead of grading twice.
    const { data: settled } = await db
      .from("mcq_attempts").select("*").eq("id", attempt.id).maybeSingle();
    return {
      alreadySubmitted: true,
      result: visibleResult(settled ?? attempt, exam),
    };
  }

  await logEvent(
    db,
    graded.attempt,
    timedOut ? "auto_submit" : "submitted",
    timedOut ? "Time expired" : `Submitted via ${channel}`,
  );

  return { result: visibleResult(graded.attempt, exam) };
}
