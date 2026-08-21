import { supabase } from "@/integrations/supabase/client";
import { AppError } from "@/shared/services";
import type { McqDifficulty, McqQuestionType } from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// ONLINE TEST — the client half of taking a test.
//
// ┌── WHAT THIS FILE IS NOT ───────────────────────────────────────────────┐
// │ It is not a scoring layer, and it never asks for one. Every method     │
// │ here is a message to the `online-test` edge function, which holds the  │
// │ service role and is the ONLY writer of mcq_attempts / mcq_answers      │
// │ since migration 20261014 removed the client write policies.            │
// │                                                                        │
// │ The engine used to do all of this in the browser — fetch the paper     │
// │ with its answer keys, grade locally, then write the resulting score.   │
// │ Everything that made that possible has been taken away deliberately:   │
// │ a mark the browser computes is a mark the student chooses.             │
// └────────────────────────────────────────────────────────────────────────┘
//
// Note the SHAPE of `PublicQuestion` below. It has no `isCorrect`, no
// `answerText`, no `numericalAnswer` and no `explanation` — not because they
// are stripped on arrival, but because the server never sends them. The type
// is the contract, and it is deliberately impossible to express an answer key
// in it.
// ─────────────────────────────────────────────────────────────────────────────

/** One answer option as a taker sees it. Note the absence of `isCorrect`. */
export interface PublicOption {
  id: string;
  text: string;
  /** An option can BE an image (diagrams, graphs). Not a key, so it travels. */
  imageUrl?: string | null;
}

/** A question as a taker sees it — everything needed to answer, nothing more. */
export interface PublicQuestion {
  id: string;
  questionText: string;
  questionType: McqQuestionType;
  marks: number;
  negativeMarks: number;
  difficulty: McqDifficulty;
  hasFormula: boolean;
  imageUrl: string | null;
  options: PublicOption[];
  /** Left-hand column of a matching question: the prompts. */
  matchPrompts: string[];
  /**
   * Right-hand column, SHUFFLED by the server.
   *
   * A matching question is unanswerable without both columns, so withholding
   * this one is not an option. What must not survive is the correspondence:
   * sent in pair order, `matchPrompts[i]` and `matchChoices[i]` would BE the
   * answer key. The server sorts by (value + question id), which is stable
   * across a refresh and unrelated to the pairing.
   */
  matchChoices: string[];
}

export interface OnlineTestAttempt {
  id: string;
  examId: string;
  studentId: string;
  studentName: string | null;
  batchName: string | null;
  attemptNumber: number;
  startedAt: string;
  status: string;
}

export interface OnlineTestExam {
  id: string;
  title: string;
  instructions: string;
  durationMinutes: number;
  shuffleOptions: boolean;
  allowResume: boolean;
  passPercentage: number;
}

export interface OnlineTestAnswer {
  questionId: string;
  selectedOptionIds: string[];
  numericValue: number | null;
  textValue: string | null;
  markedForReview: boolean;
}

export interface OnlineTestSession {
  attempt: OnlineTestAttempt;
  exam: OnlineTestExam;
  /**
   * Seconds left, AS THE SERVER COUNTS THEM. The engine renders its own ticking
   * clock for responsiveness, but this is the number that decides whether a
   * submission is accepted — a countdown living in a tab can be paused, edited
   * or simply ignored.
   */
  remainingSeconds: number;
  questions: PublicQuestion[];
  answers: OnlineTestAnswer[];
}

/** A result the taker is allowed to see, or the reason they are not. */
export type OnlineTestResult =
  | { released: false; message: string }
  | {
      released: true;
      totalScore: number;
      maxScore: number;
      percentage: number;
      correctCount: number;
      wrongCount: number;
      unattemptedCount: number;
      isPass: boolean | null;
      /** true while a teacher still has essays to mark — the score is not final. */
      awaitingEvaluation: boolean;
      pendingMarks: number;
    };

export interface OnlineTestDraft {
  questionId: string;
  selectedOptionIds?: string[];
  numericValue?: number | null;
  textValue?: string | null;
  markedForReview?: boolean;
  timeSpentSeconds?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SHARE LINK (staff side)
// ─────────────────────────────────────────────────────────────────────────────
/** What an anonymous taker must supply before a public test starts. */
export type IdentityField = "name" | "email" | "mobile";

export interface TestLink {
  /** null until a link has ever been issued. */
  token: string | null;
  accessMode: string;
  issuedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  requiresPin: boolean;
  identityFields: IdentityField[];
  /** Issued, public, not revoked and not expired — i.e. it works right now. */
  active: boolean;
}

export interface TestLinkOptions {
  /**
   * Mint a NEW token, invalidating the one already shared.
   *
   * Off by default, and that default is the important part: a share panel that
   * regenerated on open would break the link every student is already holding,
   * possibly mid-test. Rotating has to be something a person chose.
   */
  rotate?: boolean;
  expiresAt?: string | null;
  pin?: string | null;
  identityFields?: IdentityField[];
}

/** The URL a student opens. Built from the app's own origin, never hardcoded. */
export const publicTestUrl = (token: string): string =>
  `${window.location.origin}/test/${token}`;

const FUNCTION = "online-test";

/**
 * One call, one error convention.
 *
 * `supabase.functions.invoke` reports a non-2xx as a transport-shaped error
 * whose message is "Edge Function returned a non-2xx status code" — useless to
 * show a student mid-test. The real reason ("This test has closed", "Attempt
 * limit reached") is in the response body, so it is read back explicitly.
 */
async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FUNCTION, {
    body: payload,
  });

  if (error) {
    let detail = "";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        detail = typeof body?.error === "string" ? body.error : "";
      } catch {
        // Body already consumed or not JSON — fall through to the generic text.
      }
    }
    throw AppError.validation(detail || "Could not reach the test server.");
  }

  if (data && typeof data === "object" && "error" in data) {
    throw AppError.validation(String((data as { error: unknown }).error));
  }
  return data as T;
}

class OnlineTestService {
  /**
   * Open or resume an attempt.
   *
   * `studentId` names WHO is sitting the test, not who may. The server checks
   * the caller is either staff in that student's organization (proctoring) or
   * a parent of that specific child, and refuses otherwise — passing a
   * stranger's id gets the same answer as passing a nonexistent one.
   */
  start(examId: string, studentId: string): Promise<OnlineTestSession> {
    return call<OnlineTestSession>({ action: "start", examId, studentId });
  }

  /**
   * Persist answer drafts. Never scores.
   *
   * Returns the server's remaining seconds so a tab that has drifted, slept or
   * been reopened re-synchronises on every autosave rather than on submit —
   * when it would be too late to tell the student anything useful.
   */
  save(
    attemptId: string,
    drafts: OnlineTestDraft[],
  ): Promise<{ saved: number; remainingSeconds: number; autoSubmitted?: boolean }> {
    return call({ action: "save", attemptId, drafts });
  }

  /**
   * Close and grade an attempt.
   *
   * Idempotent by design: submitting an already-submitted attempt returns that
   * attempt's result with `alreadySubmitted`, not an error. A double-click, a
   * retry after a dropped connection, and the timer firing as the button is
   * pressed are all the SAME submission — reporting failure would invite the
   * student to submit again.
   */
  submit(
    attemptId: string,
  ): Promise<{ result: OnlineTestResult; alreadySubmitted?: boolean }> {
    return call({ action: "submit", attemptId });
  }

  /** The taker's own result, subject to the exam's result-visibility setting. */
  result(attemptId: string): Promise<{ result: OnlineTestResult }> {
    return call({ action: "result", attemptId });
  }

  /**
   * Record an anti-cheat or lifecycle event.
   *
   * On the server for the same reason as everything else here: a client that
   * can write its own events can also decline to, and a log the watched party
   * controls is not a log. Best-effort by design — a failed event must never
   * interrupt a student mid-question.
   */
  async event(
    attemptId: string,
    eventType: string,
    detail?: string,
    severity: "info" | "warning" | "critical" = "info",
  ): Promise<void> {
    try {
      await call({ action: "event", attemptId, eventType, detail, severity });
    } catch {
      /* intentionally swallowed */
    }
  }

  // ── The share link ─────────────────────────────────────────────────────────
  /** Read the current link without changing it. */
  async linkStatus(examId: string): Promise<TestLink> {
    const { link } = await call<{ link: TestLink }>({ action: "link_status", examId });
    return link;
  }

  /**
   * Create the link, or update its settings.
   *
   * Reuses the existing token unless `rotate` is set, so opening the share
   * panel — or changing the PIN, or the expiry — never silently invalidates a
   * link students already have.
   */
  async issueLink(examId: string, options: TestLinkOptions = {}): Promise<TestLink> {
    const { link } = await call<{ link: TestLink }>({
      action: "issue_link",
      examId,
      ...options,
    });
    return link;
  }

  /** Turn the link off. The token is kept so "was this shared?" stays answerable. */
  async revokeLink(examId: string): Promise<TestLink> {
    const { link } = await call<{ link: TestLink }>({ action: "revoke_link", examId });
    return link;
  }

  /** Proctor control: close a running attempt. Staff only, enforced server-side. */
  forceSubmit(attemptId: string): Promise<{ ok?: boolean }> {
    return call({ action: "force_submit", attemptId });
  }

  /** Proctor control: reopen a closed attempt. Staff only, enforced server-side. */
  reopen(attemptId: string): Promise<{ ok?: boolean }> {
    return call({ action: "reopen", attemptId });
  }
}

export const onlineTestService = new OnlineTestService();
