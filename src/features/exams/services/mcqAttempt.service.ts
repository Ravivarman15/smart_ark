import { BaseService, AppError } from "@/shared/services";
import { round2 } from "../utils/grading";
import { scoreAttempt } from "../utils/mcqScoring";
import {
  accuracyPct,
  newShuffleSeed,
  rankAndPercentile,
  seededShuffle,
} from "../utils/mcqExamScoring";
import { mcqExamService } from "./mcqExam.service";
import { mcqPaperService } from "./mcqPaper.service";
import type { McqQuestion, McqResponse } from "../types/mcq.types";
import type {
  AnswerDraft,
  AttemptEvent,
  AttemptEventType,
  AttemptSession,
  AttemptStatus,
  McqAnswer,
  McqAttempt,
  McqExam,
} from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// MCQ attempt service — the engine's data layer.
//
//   startOrResume  — resume an in-progress attempt, or open a fresh one (with a
//                    frozen, optionally-shuffled question order)
//   autosave       — persist answer drafts + heartbeat (no scoring)
//   submit         — score CENTRALLY via scoreAttempt, persist, re-rank the exam
//   logEvent       — anti-cheat / lifecycle trail; warnings bump flags_count
//   reopen         — staff reopens a submitted attempt
//
// Scoring lives entirely in the centralised scoring layer — this service never
// computes a mark, only orchestrates and persists.
// ─────────────────────────────────────────────────────────────────────────────

type AttemptRow = {
  id: string;
  exam_id: string;
  student_id: string;
  student_name: string | null;
  batch_id: string | null;
  batch_name: string | null;
  attempt_number: number | null;
  status: string | null;
  started_at: string;
  last_seen_at: string;
  submitted_at: string | null;
  time_spent_seconds: number | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  accuracy: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  unattempted_count: number | null;
  rank: number | null;
  percentile: number | null;
  is_pass: boolean | null;
  pending_marks: number | null;
  awaiting_evaluation: boolean | null;
  shuffle_seed: number | null;
  question_order: string[] | null;
  flags_count: number | null;
  created_at: string;
  updated_at: string;
};

type AnswerRow = {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option_ids: string[] | null;
  numeric_value: number | null;
  text_value: string | null;
  is_correct: boolean | null;
  awarded: number | null;
  max_marks: number | null;
  pending_review: boolean | null;
  marked_for_review: boolean | null;
  time_spent_seconds: number | null;
  answered_at: string | null;
};

const normStatus = (s?: string | null): AttemptStatus =>
  s === "submitted" || s === "auto_submitted" || s === "abandoned"
    ? s
    : "in_progress";

const toAttempt = (r: AttemptRow): McqAttempt => ({
  id: r.id,
  examId: r.exam_id,
  studentId: r.student_id,
  studentName: r.student_name ?? undefined,
  batchId: r.batch_id ?? undefined,
  batchName: r.batch_name ?? undefined,
  attemptNumber: Number(r.attempt_number ?? 1),
  status: normStatus(r.status),
  startedAt: r.started_at,
  lastSeenAt: r.last_seen_at,
  submittedAt: r.submitted_at ?? undefined,
  timeSpentSeconds: Number(r.time_spent_seconds ?? 0),
  totalScore: r.total_score == null ? undefined : Number(r.total_score),
  maxScore: r.max_score == null ? undefined : Number(r.max_score),
  percentage: r.percentage == null ? undefined : Number(r.percentage),
  accuracy: r.accuracy == null ? undefined : Number(r.accuracy),
  correctCount: r.correct_count ?? undefined,
  wrongCount: r.wrong_count ?? undefined,
  unattemptedCount: r.unattempted_count ?? undefined,
  rank: r.rank ?? undefined,
  percentile: r.percentile == null ? undefined : Number(r.percentile),
  isPass: r.is_pass ?? undefined,
  pendingMarks: Number(r.pending_marks ?? 0),
  awaitingEvaluation: r.awaiting_evaluation ?? false,
  shuffleSeed: Number(r.shuffle_seed ?? 0),
  questionOrder: Array.isArray(r.question_order) ? r.question_order : [],
  flagsCount: Number(r.flags_count ?? 0),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toAnswer = (r: AnswerRow): McqAnswer => ({
  id: r.id,
  attemptId: r.attempt_id,
  questionId: r.question_id,
  selectedOptionIds: Array.isArray(r.selected_option_ids)
    ? r.selected_option_ids
    : [],
  numericValue: r.numeric_value == null ? null : Number(r.numeric_value),
  textValue: r.text_value ?? null,
  isCorrect: r.is_correct ?? undefined,
  awarded: Number(r.awarded ?? 0),
  maxMarks: Number(r.max_marks ?? 0),
  pendingReview: r.pending_review ?? false,
  markedForReview: !!r.marked_for_review,
  timeSpentSeconds: Number(r.time_spent_seconds ?? 0),
  answeredAt: r.answered_at ?? undefined,
});

export interface AttemptStudent {
  id: string;
  name: string;
  batchId?: string;
  batchName?: string;
}

class McqAttemptService extends BaseService {
  private async rawAttempt(attemptId: string): Promise<AttemptRow> {
    const res = await this.db
      .from("mcq_attempts")
      .select("*")
      .eq("id", attemptId)
      .single();
    return this.guard(res, "attempt") as unknown as AttemptRow;
  }

  /** Answers stored for an attempt. */
  async listAnswers(attemptId: string): Promise<McqAnswer[]> {
    const res = await this.db
      .from("mcq_answers")
      .select("*")
      .eq("attempt_id", attemptId);
    const rows = this.guardList(res, "mcq_answers") as unknown as AnswerRow[];
    return rows.map(toAnswer);
  }

  /** Compose the full session an engine needs from an attempt row. */
  private async buildSession(
    attempt: McqAttempt,
    exam: McqExam,
  ): Promise<AttemptSession> {
    const paperQuestions = exam.paperId
      ? await mcqPaperService.getQuestions(exam.paperId)
      : [];
    const byId = new Map(paperQuestions.map((q) => [q.id, q]));
    const order =
      attempt.questionOrder.length > 0
        ? attempt.questionOrder
        : paperQuestions.map((q) => q.id);
    const questions = order
      .map((qid) => byId.get(qid))
      .filter((q): q is (typeof paperQuestions)[number] => !!q);
    const answers = await this.listAnswers(attempt.id);
    return { exam, attempt, questions, answers };
  }

  async getSession(attemptId: string): Promise<AttemptSession> {
    const attempt = toAttempt(await this.rawAttempt(attemptId));
    const exam = await mcqExamService.getById(attempt.examId);
    return this.buildSession(attempt, exam);
  }

  // ── REMOVED: startOrResume / autosave / submit ────────────────────────────
  // These three wrote mcq_attempts and mcq_answers from the browser, and
  // `submit` graded the paper there too. Migration 20261014 removed every
  // client write policy from those tables, so all three now live in the
  // `online-test` edge function — see onlineTest.service.ts.
  //
  // They were DELETED rather than left to fail, and that distinction matters:
  // an RLS-filtered UPDATE does not raise. PostgREST answers 204 with
  // `error: null`, so `submit` would have reported success, shown the student a
  // score, and written nothing. A method that silently loses a submitted paper
  // is worse than one that is missing.

  /** Anti-cheat / lifecycle events for an attempt, newest first. */
  async listEvents(attemptId: string): Promise<AttemptEvent[]> {
    const { data, error } = await this.db
      .from("mcq_attempt_events")
      .select("*")
      .eq("attempt_id", attemptId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (
      (data as {
        id: string;
        attempt_id: string;
        event_type: string;
        detail: string | null;
        severity: string | null;
        created_at: string;
      }[]) ?? []
    ).map((r) => ({
      id: r.id,
      attemptId: r.attempt_id,
      eventType: r.event_type as AttemptEventType,
      detail: r.detail ?? undefined,
      severity:
        r.severity === "warning" || r.severity === "critical"
          ? r.severity
          : "info",
      createdAt: r.created_at,
    }));
  }

  /**
   * Staff reopens a closed attempt so a student can continue.
   *
   * Delegated, not deleted: this one has a real staff caller (the live monitor)
   * and the authorisation lives on the server, where "is this person staff in
   * this student's organization" can actually be answered.
   */
  async reopen(attemptId: string): Promise<void> {
    await onlineTestService.reopen(attemptId);
  }

  /** All attempts for an exam (monitoring + analytics feed). */
  async listForExam(examId: string): Promise<McqAttempt[]> {
    const res = await this.db
      .from("mcq_attempts")
      .select("*")
      .eq("exam_id", examId)
      .order("started_at", { ascending: false });
    const rows = this.guardList(res, "mcq_attempts") as unknown as AttemptRow[];
    return rows.map(toAttempt);
  }

  /**
   * Closed (scored) attempts across many exams in ONE query — the cross-exam
   * feed for the Examination Dashboard / analytics so MCQ exams fold into the
   * same figures as manual ones. Degrades to [] if the table is unavailable.
   */
  async listClosedForExams(examIds: string[]): Promise<McqAttempt[]> {
    if (examIds.length === 0) return [];
    const { data, error } = await this.db
      .from("mcq_attempts")
      .select("*")
      .in("exam_id", examIds)
      .in("status", ["submitted", "auto_submitted"]);
    if (error) return [];
    return ((data as unknown as AttemptRow[]) ?? []).map(toAttempt);
  }
}

export const mcqAttemptService = new McqAttemptService();
