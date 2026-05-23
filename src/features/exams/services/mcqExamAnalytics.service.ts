import { BaseService } from "@/shared/services";
import { round2 } from "../utils/grading";
import { sectionBreakdown, weakChapters } from "../utils/mcqExamScoring";
import { mcqExamService } from "./mcqExam.service";
import { mcqAttemptService } from "./mcqAttempt.service";
import { mcqPaperService } from "./mcqPaper.service";
import type { PaperQuestionView } from "../types/mcq.types";
import type {
  LeaderboardRow,
  McqExam,
  McqExamAnalytics,
  MonitorRow,
  MonitorSnapshot,
  QuestionDifficultyRow,
  ResultAnswerRow,
  StudentExamResult,
  TopperCard,
} from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// MCQ exam analytics — live monitoring, exam-wide analytics, leaderboard and
// the student result view. A pure read/compose layer: every figure comes from
// already-scored attempt rows or the centralised scoring helpers. Nothing here
// re-scores an answer.
// ─────────────────────────────────────────────────────────────────────────────

/** Disconnected if an in-progress attempt has not pinged for this long. */
const STALE_SECONDS = 75;

/** Are an exam's results visible to the student yet? */
export const isResultReleased = (exam: McqExam): boolean => {
  if (exam.resultRelease === "manual") return exam.resultsPublished;
  if (exam.resultRelease === "scheduled") {
    return (
      !!exam.resultReleaseAt &&
      new Date().getTime() >= new Date(exam.resultReleaseAt).getTime()
    );
  }
  return true; // immediate
};

type RawAnswer = {
  attempt_id: string;
  question_id: string;
  selected_option_ids: string[] | null;
  numeric_value: number | null;
  is_correct: boolean | null;
  awarded: number | null;
  max_marks: number | null;
  time_spent_seconds: number | null;
};

class McqExamAnalyticsService extends BaseService {
  /** Raw answer rows for a set of attempts. */
  private async answersFor(attemptIds: string[]): Promise<RawAnswer[]> {
    if (attemptIds.length === 0) return [];
    const { data, error } = await this.db
      .from("mcq_answers")
      .select(
        "attempt_id, question_id, selected_option_ids, numeric_value, is_correct, awarded, max_marks, time_spent_seconds",
      )
      .in("attempt_id", attemptIds);
    if (error) return [];
    return (data as RawAnswer[]) ?? [];
  }

  // ── Live monitoring ─────────────────────────────────────────────────────────
  async monitor(examId: string): Promise<MonitorSnapshot> {
    const [exam, attempts, roster] = await Promise.all([
      mcqExamService.getById(examId),
      mcqAttemptService.listForExam(examId),
      mcqExamService.getById(examId).then((e) =>
        mcqExamService.resolveRoster(e),
      ),
    ]);

    const answers = await this.answersFor(attempts.map((a) => a.id));
    const answeredByAttempt = new Map<string, number>();
    for (const a of answers) {
      const has =
        (a.selected_option_ids?.length ?? 0) > 0 || a.numeric_value != null;
      if (has) {
        answeredByAttempt.set(
          a.attempt_id,
          (answeredByAttempt.get(a.attempt_id) ?? 0) + 1,
        );
      }
    }

    const now = Date.now();
    const rows: MonitorRow[] = attempts.map((a) => {
      const staleSeconds = Math.round(
        (now - new Date(a.lastSeenAt).getTime()) / 1000,
      );
      const isDisconnected =
        a.status === "in_progress" && staleSeconds > STALE_SECONDS;
      return {
        attemptId: a.id,
        studentId: a.studentId,
        studentName: a.studentName ?? "—",
        batchName: a.batchName,
        status: a.status,
        startedAt: a.startedAt,
        lastSeenAt: a.lastSeenAt,
        staleSeconds,
        isDisconnected,
        answeredCount: answeredByAttempt.get(a.id) ?? 0,
        flagsCount: a.flagsCount,
        percentage: a.percentage,
      };
    });

    const completed = rows.filter(
      (r) => r.status === "submitted" || r.status === "auto_submitted",
    ).length;
    const disconnected = rows.filter((r) => r.isDisconnected).length;
    const active =
      rows.filter((r) => r.status === "in_progress").length - disconnected;
    const notStarted = Math.max(0, roster.length - attempts.length);
    const flagged = rows.filter((r) => r.flagsCount > 0).length;

    return {
      exam,
      rows,
      active: Math.max(0, active),
      completed,
      disconnected,
      notStarted,
      flagged,
    };
  }

  // ── Exam analytics ──────────────────────────────────────────────────────────
  async analytics(examId: string): Promise<McqExamAnalytics> {
    const [exam, attempts] = await Promise.all([
      mcqExamService.getById(examId),
      mcqAttemptService.listForExam(examId),
    ]);
    const closed = attempts.filter(
      (a) => a.status === "submitted" || a.status === "auto_submitted",
    );

    const empty: McqExamAnalytics = {
      exam,
      attemptCount: attempts.length,
      submittedCount: 0,
      averagePercentage: 0,
      averageAccuracy: 0,
      passRate: 0,
      highestPercentage: 0,
      toppers: [],
      leaderboard: [],
      sectionPerformance: [],
      weakChapters: [],
      questionDifficulty: [],
    };
    if (closed.length === 0) return empty;

    const questions = exam.paperId
      ? await mcqPaperService.getQuestions(exam.paperId)
      : [];
    const qById = new Map<string, PaperQuestionView>(
      questions.map((q) => [q.id, q]),
    );
    const answers = await this.answersFor(closed.map((a) => a.id));

    // ── Aggregates ──
    const pctSum = closed.reduce((s, a) => s + (a.percentage ?? 0), 0);
    const accSum = closed.reduce((s, a) => s + (a.accuracy ?? 0), 0);
    const passes = closed.filter((a) => a.isPass).length;
    const highest = Math.max(...closed.map((a) => a.percentage ?? 0));

    // ── Toppers + leaderboard ──
    const ranked = [...closed].sort(
      (a, b) => (a.rank ?? 9999) - (b.rank ?? 9999),
    );
    const toppers: TopperCard[] = ranked.slice(0, 3).map((a) => ({
      rank: a.rank ?? 0,
      studentName: a.studentName ?? "—",
      score: a.totalScore ?? 0,
      percentage: a.percentage ?? 0,
      accuracy: a.accuracy ?? 0,
    }));
    const leaderboard: LeaderboardRow[] = ranked.map((a) => ({
      rank: a.rank ?? 0,
      percentile: a.percentile ?? 0,
      studentName: a.studentName ?? "—",
      score: a.totalScore ?? 0,
      maxScore: a.maxScore ?? exam.totalMarks,
      percentage: a.percentage ?? 0,
      accuracy: a.accuracy ?? 0,
      timeSpentSeconds: a.timeSpentSeconds,
      isPass: !!a.isPass,
    }));

    // ── Section performance (chapter-wise, exam-wide) ──
    const sectionRows = answers.map((a) => {
      const q = qById.get(a.question_id);
      return {
        chapter: q?.chapter,
        awarded: Number(a.awarded ?? 0),
        maxMarks: Number(a.max_marks ?? 0),
        correct: !!a.is_correct,
      };
    });
    const sectionPerformance = sectionBreakdown(sectionRows);

    // ── Question-wise difficulty ──
    const byQuestion = new Map<
      string,
      { attempts: number; correct: number; time: number }
    >();
    for (const a of answers) {
      const acc = byQuestion.get(a.question_id) ?? {
        attempts: 0,
        correct: 0,
        time: 0,
      };
      acc.attempts += 1;
      if (a.is_correct) acc.correct += 1;
      acc.time += Number(a.time_spent_seconds ?? 0);
      byQuestion.set(a.question_id, acc);
    }
    const questionDifficulty: QuestionDifficultyRow[] = questions.map((q) => {
      const acc = byQuestion.get(q.id) ?? { attempts: 0, correct: 0, time: 0 };
      return {
        questionId: q.id,
        questionText: q.questionText,
        chapter: q.chapter,
        attempts: acc.attempts,
        correct: acc.correct,
        correctRate:
          acc.attempts > 0
            ? round2((acc.correct / acc.attempts) * 100)
            : 0,
        avgTimeSeconds:
          acc.attempts > 0 ? Math.round(acc.time / acc.attempts) : 0,
      };
    });

    return {
      exam,
      attemptCount: attempts.length,
      submittedCount: closed.length,
      averagePercentage: round2(pctSum / closed.length),
      averageAccuracy: round2(accSum / closed.length),
      passRate: round2((passes / closed.length) * 100),
      highestPercentage: round2(highest),
      toppers,
      leaderboard,
      sectionPerformance,
      weakChapters: weakChapters(sectionPerformance),
      questionDifficulty: questionDifficulty.sort(
        (a, b) => a.correctRate - b.correctRate,
      ),
    };
  }

  /** Live leaderboard — closed attempts ranked, refreshable on a poll. */
  async leaderboard(examId: string): Promise<LeaderboardRow[]> {
    return (await this.analytics(examId)).leaderboard;
  }

  // ── Student result view ─────────────────────────────────────────────────────
  async studentResult(attemptId: string): Promise<StudentExamResult> {
    const attempt = await mcqAttemptService.getAttempt(attemptId);
    const exam = await mcqExamService.getById(attempt.examId);
    const questions = exam.paperId
      ? await mcqPaperService.getQuestions(exam.paperId)
      : [];
    const storedAnswers = await mcqAttemptService.listAnswers(attemptId);
    const ansByQ = new Map(storedAnswers.map((a) => [a.questionId, a]));

    const answers: ResultAnswerRow[] = questions.map((q) => {
      const a = ansByQ.get(q.id);
      const attempted =
        !!a &&
        ((a.selectedOptionIds?.length ?? 0) > 0 || a.numericValue != null);
      return {
        question: q,
        answer: a,
        awarded: a?.awarded ?? 0,
        maxMarks: a?.maxMarks ?? q.effectiveMarks,
        correct: !!a?.isCorrect,
        attempted,
      };
    });

    const sectionPerformance = sectionBreakdown(
      answers.map((r) => ({
        chapter: r.question.chapter,
        awarded: r.awarded,
        maxMarks: r.maxMarks,
        correct: r.correct,
      })),
    );

    return {
      exam,
      attempt,
      released: isResultReleased(exam),
      answers,
      sectionPerformance,
      weakChapters: weakChapters(sectionPerformance),
    };
  }
}

export const mcqExamAnalyticsService = new McqExamAnalyticsService();
