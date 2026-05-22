import { BaseService } from "@/shared/services";
import {
  assignRanks,
  computeStats,
  gradeDistribution,
} from "../utils/grading";
import { examService } from "./exam.service";
import { examResultsService } from "./examResults.service";
import type {
  ExamAnalytics,
  ExamOverview,
  TopperRow,
} from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Exam analytics — the read-side reporting layer.
//
// Composes the exam + results services and the grading layer; it never queries
// or computes marks itself, so every figure is consistent with what marks entry
// produced. `forExam` powers the per-exam analytics dashboard; `overview` powers
// the Manage page headline tiles.
// ─────────────────────────────────────────────────────────────────────────────

class ExamAnalyticsService extends BaseService {
  /** Full analytics for one exam — stats, grade mix, toppers, ranked rows. */
  async forExam(examId: string): Promise<ExamAnalytics> {
    const [exam, results] = await Promise.all([
      examService.getById(examId),
      examResultsService.listForExam(examId),
    ]);

    const scored = assignRanks(exam, results);
    const stats = computeStats(scored);
    const distribution = gradeDistribution(scored, exam.gradingScheme);

    const toppers: TopperRow[] = scored
      .filter((r) => !r.isAbsent && r.marks != null && r.rank != null)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .slice(0, 5)
      .map((r) => ({
        rank: r.rank ?? 0,
        studentName: r.studentName ?? "—",
        marks: Number(r.marks ?? 0),
        percentage: r.percentage,
        grade: r.grade ?? "—",
      }));

    return { exam, stats, gradeDistribution: distribution, toppers, scored };
  }

  /** Headline counts across all manual exams — for the Manage dashboard. */
  async overview(): Promise<ExamOverview> {
    const exams = await examService.list({ mode: "manual" });
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: exams.length,
      scheduled: exams.filter((e) => e.status === "scheduled").length,
      completed: exams.filter((e) => e.status === "completed").length,
      resultsPending: exams.filter((e) => e.resultsStatus === "pending").length,
      resultsPublished: exams.filter(
        (e) => e.resultsStatus === "published" || e.resultsStatus === "locked",
      ).length,
      upcoming: exams.filter(
        (e) =>
          e.status === "scheduled" && !!e.examDate && e.examDate >= today,
      ).length,
    };
  }
}

export const examAnalyticsService = new ExamAnalyticsService();
