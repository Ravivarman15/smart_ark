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
  is_correct: boolean | null;
  awarded: number | null;
  max_marks: number | null;
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
  isCorrect: r.is_correct ?? undefined,
  awarded: Number(r.awarded ?? 0),
  maxMarks: Number(r.max_marks ?? 0),
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

  /**
   * Resume the student's in-progress attempt, or open a fresh one. A new
   * attempt freezes a (possibly shuffled) question order so a resume is stable.
   */
  async startOrResume(
    examId: string,
    student: AttemptStudent,
  ): Promise<AttemptSession> {
    const exam = await mcqExamService.getById(examId);
    if (exam.liveStatus === "ended") {
      throw AppError.validation("This exam has ended.");
    }
    if (!exam.paperId) {
      throw AppError.validation("This exam has no paper attached.");
    }

    const existingRes = await this.db
      .from("mcq_attempts")
      .select("*")
      .eq("exam_id", examId)
      .eq("student_id", student.id)
      .order("attempt_number", { ascending: false });
    const existing = (existingRes.data as AttemptRow[]) ?? [];

    const inProgress = existing.find((a) => normStatus(a.status) === "in_progress");
    if (inProgress) {
      await this.logEvent(inProgress.id, "reconnect", "Resumed attempt");
      return this.buildSession(toAttempt(inProgress), exam);
    }

    const usedAttempts = existing.filter(
      (a) => normStatus(a.status) !== "abandoned",
    ).length;
    if (usedAttempts >= exam.attemptLimit) {
      throw AppError.validation(
        `Attempt limit reached (${exam.attemptLimit}).`,
      );
    }

    // Freeze the question order for this attempt.
    const paperQuestions = await mcqPaperService.getQuestions(exam.paperId);
    if (paperQuestions.length === 0) {
      throw AppError.validation("The attached paper has no questions.");
    }
    const seed = newShuffleSeed();
    const ids = paperQuestions.map((q) => q.id);
    const order = exam.shuffleQuestions ? seededShuffle(ids, seed) : ids;

    const insertRes = await this.db
      .from("mcq_attempts")
      .insert({
        exam_id: examId,
        student_id: student.id,
        student_name: student.name,
        batch_id: student.batchId ?? null,
        batch_name: student.batchName ?? null,
        attempt_number: usedAttempts + 1,
        status: "in_progress",
        shuffle_seed: seed,
        question_order: order,
        max_score: exam.totalMarks,
      } as never)
      .select("*")
      .single();
    if (insertRes.error) {
      throw AppError.fromSupabase(insertRes.error, "attempt");
    }
    const attempt = toAttempt(insertRes.data as unknown as AttemptRow);
    await this.logEvent(attempt.id, "started", "Attempt started");
    return this.buildSession(attempt, exam);
  }

  /** Persist answer drafts + heartbeat. Never scores — that is submit's job. */
  async autosave(
    attemptId: string,
    drafts: AnswerDraft[],
    timeSpentSeconds: number,
  ): Promise<void> {
    const now = new Date().toISOString();
    if (drafts.length > 0) {
      const payload = drafts.map((d) => ({
        attempt_id: attemptId,
        question_id: d.questionId,
        selected_option_ids: d.selectedOptionIds,
        numeric_value: d.numericValue ?? null,
        marked_for_review: d.markedForReview,
        time_spent_seconds: d.timeSpentSeconds,
        answered_at: now,
      }));
      const { error } = await this.db
        .from("mcq_answers")
        .upsert(payload as never, { onConflict: "attempt_id,question_id" });
      if (error) throw AppError.fromSupabase(error, "answers");
    }
    await this.db
      .from("mcq_attempts")
      .update({
        last_seen_at: now,
        time_spent_seconds: Math.max(0, Math.floor(timeSpentSeconds)),
      } as never)
      .eq("id", attemptId);
  }

  /** Lightweight heartbeat — just refreshes last_seen_at. */
  async heartbeat(attemptId: string): Promise<void> {
    await this.db
      .from("mcq_attempts")
      .update({ last_seen_at: new Date().toISOString() } as never)
      .eq("id", attemptId);
  }

  /** Append an attempt event. Warning/critical events bump flags_count. */
  async logEvent(
    attemptId: string,
    eventType: AttemptEventType,
    detail?: string,
    severity: "info" | "warning" | "critical" = "info",
  ): Promise<void> {
    try {
      await this.db.from("mcq_attempt_events").insert({
        attempt_id: attemptId,
        event_type: eventType,
        detail: detail ?? null,
        severity,
      } as never);
      if (severity !== "info") {
        const { data } = await this.db
          .from("mcq_attempts")
          .select("flags_count")
          .eq("id", attemptId)
          .maybeSingle();
        const current = Number(
          (data as { flags_count: number | null } | null)?.flags_count ?? 0,
        );
        await this.db
          .from("mcq_attempts")
          .update({ flags_count: current + 1 } as never)
          .eq("id", attemptId);
      }
    } catch {
      /* event log is best-effort */
    }
  }

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
   * Score + close an attempt. Runs every answer through the centralised
   * scoring layer, persists per-answer + attempt figures, then re-ranks the
   * whole exam. `kind` records HOW it closed (manual / timeout / staff).
   */
  async submit(
    attemptId: string,
    kind: "submit" | "auto_submit" | "force_submit" = "submit",
    timeSpentSeconds?: number,
  ): Promise<McqAttempt> {
    const session = await this.getSession(attemptId);
    const { exam, attempt, questions, answers } = session;

    const responses: McqResponse[] = answers.map((a) => ({
      questionId: a.questionId,
      selectedOptionIds: a.selectedOptionIds,
      numericValue: a.numericValue ?? null,
    }));
    const overrides: Record<string, number | null | undefined> = {};
    for (const q of questions) overrides[q.id] = q.marksOverride;

    const result = scoreAttempt(
      questions as McqQuestion[],
      responses,
      exam.negativeMarking,
      overrides,
    );

    // Persist per-answer scoring onto the rows that exist.
    const scoredById = new Map(result.answers.map((a) => [a.questionId, a]));
    await Promise.all(
      answers.map((a) => {
        const s = scoredById.get(a.questionId);
        if (!s) return Promise.resolve();
        return this.db
          .from("mcq_answers")
          .update({
            is_correct: s.correct,
            awarded: s.awarded,
            max_marks: s.maxMarks,
          } as never)
          .eq("id", a.id);
      }),
    );

    const status: AttemptStatus =
      kind === "submit" ? "submitted" : "auto_submitted";
    const accuracy = accuracyPct(result.correctCount, result.wrongCount);
    const isPass = result.percentage >= exam.passPercentage;

    const updRes = await this.db
      .from("mcq_attempts")
      .update({
        status,
        submitted_at: new Date().toISOString(),
        time_spent_seconds:
          timeSpentSeconds != null
            ? Math.max(0, Math.floor(timeSpentSeconds))
            : attempt.timeSpentSeconds,
        total_score: result.totalAwarded,
        max_score: result.totalMax,
        percentage: result.percentage,
        accuracy,
        correct_count: result.correctCount,
        wrong_count: result.wrongCount,
        unattempted_count: result.unattemptedCount,
        is_pass: isPass,
      } as never)
      .eq("id", attemptId)
      .select("*")
      .single();
    if (updRes.error) throw AppError.fromSupabase(updRes.error, "attempt");

    await this.logEvent(
      attemptId,
      kind === "submit" ? "submit" : kind === "force_submit" ? "force_submit" : "auto_submit",
      `Scored ${result.totalAwarded}/${result.totalMax}`,
      kind === "force_submit" ? "warning" : "info",
    );
    await this.recomputeRanks(exam.id);

    return this.getAttempt(attemptId);
  }

  /** Re-rank + re-percentile every closed attempt of an exam. */
  async recomputeRanks(examId: string): Promise<void> {
    const { data, error } = await this.db
      .from("mcq_attempts")
      .select("id, total_score, status")
      .eq("exam_id", examId)
      .in("status", ["submitted", "auto_submitted"]);
    if (error) return;
    const rows = (data as { id: string; total_score: number | null }[]) ?? [];
    if (rows.length === 0) return;
    const ranked = rankAndPercentile(
      rows.map((r) => ({ id: r.id, score: Number(r.total_score ?? 0) })),
    );
    await Promise.all(
      Array.from(ranked.entries()).map(([id, rp]) =>
        this.db
          .from("mcq_attempts")
          .update({ rank: rp.rank, percentile: rp.percentile } as never)
          .eq("id", id),
      ),
    );
  }

  async getAttempt(attemptId: string): Promise<McqAttempt> {
    return toAttempt(await this.rawAttempt(attemptId));
  }

  /** Staff reopens a closed attempt so a student can continue. */
  async reopen(attemptId: string): Promise<void> {
    const { error } = await this.db
      .from("mcq_attempts")
      .update({ status: "in_progress", submitted_at: null } as never)
      .eq("id", attemptId);
    if (error) throw AppError.fromSupabase(error, "attempt");
    await this.logEvent(attemptId, "reopen", "Attempt reopened by staff", "warning");
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
}

export const mcqAttemptService = new McqAttemptService();
