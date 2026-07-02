import { BaseService } from "@/shared/services";
import { buildAiSummary } from "@/features/students/utils/student360";
import { assignRanks } from "../utils/grading";
import {
  gradeSpread,
  groupComparison,
  heatMap,
  monthTrend,
  rankDistribution,
  schoolStats,
  studentAggregates,
  topStudents,
  bottomStudents,
  mostImproved,
  performanceDrops,
  riskStudents,
  scholarshipCandidates,
  type ComparisonRow,
  type HeatMap,
  type RankBucket,
  type SchoolStats,
  type ScoredRow,
  type StudentAggregate,
} from "../utils/analytics";
import { examService } from "./exam.service";
import { examResultsService } from "./examResults.service";
import type { Exam, GradeDistributionItem } from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Exam Insights — the read-side analytics ENGINE reused by the Analytics
// Dashboard (Phase 5), the Management Dashboard (Phase 11), the Enterprise
// Registers (Phase 13) and the AI Insights.
//
// It gathers a filtered set of manual exams + results ONCE (batched), grades
// every row through the central grading layer, then hands the flat `ScoredRow[]`
// to the pure analytics helpers. Nothing computes marks itself, so every figure
// is consistent with marks entry. Filters (year/term/month/class) bound the set
// so the same engine scales from one class to the whole school.
// ─────────────────────────────────────────────────────────────────────────────

export interface InsightsFilters {
  academicYearId?: string;
  term?: string;
  month?: string;
  standardId?: string;
  batchId?: string;
  subjectId?: string;
}

export interface ExamAnalyticsBundle {
  filters: InsightsFilters;
  examCount: number;
  studentCount: number;
  school: SchoolStats;
  bySubject: ComparisonRow[];
  byFaculty: ComparisonRow[];
  byClass: ComparisonRow[];
  bySection: ComparisonRow[];
  byMonth: ComparisonRow[];
  byYear: ComparisonRow[];
  gradeDistribution: GradeDistributionItem[];
  rankDistribution: RankBucket[];
  heatMap: HeatMap;
  topStudents: StudentAggregate[];
  bottomStudents: StudentAggregate[];
  mostImproved: StudentAggregate[];
  performanceDrops: StudentAggregate[];
  riskStudents: StudentAggregate[];
  scholarshipCandidates: StudentAggregate[];
  strongSubjects: ComparisonRow[];
  weakSubjects: ComparisonRow[];
  generatedAt: string;
}

export interface DashboardCards {
  totalExams: number;
  pendingExams: number; // scheduled / draft
  pendingMarksEntry: number; // no results yet
  completedExams: number;
  publishedResults: number;
  needVerification: number; // completed with marks but not published
  pendingPublications: number;
  upcomingExams: number;
  studentsAppeared: number;
  studentsAbsent: number;
  averagePercentage: number;
  passRate: number;
  failRate: number;
  highestPercentage: number;
  lowestPercentage: number;
  topFaculty?: string;
  topSubject?: string;
  weakSubject?: string;
  topClass?: string;
  lowestClass?: string;
}

export interface AiInsightsBundle {
  academicHealthScore: number; // 0-100
  classHealth: { label: string; score: number; risk: string }[];
  subjectInsights: string[];
  facultyInsights: string[];
  managementInsights: string[];
  attendanceImpact: string;
  suggestedImprovements: string[];
}

class ExamInsightsService extends BaseService {
  /** Gather + grade every result for the filtered exam set (one batched pass). */
  async gather(filters: InsightsFilters = {}): Promise<{ exams: Exam[]; rows: ScoredRow[] }> {
    const exams = await examService.list({ mode: "manual", ...filters });
    const resultsByExam = await Promise.all(
      exams.map((e) => examResultsService.listForExam(e.id)),
    );
    const rows: ScoredRow[] = [];
    exams.forEach((exam, i) => {
      const scored = assignRanks(exam, resultsByExam[i]);
      for (const r of scored) {
        rows.push({
          examId: exam.id,
          examTitle: exam.title,
          examType: exam.examType,
          academicYearId: exam.academicYearId,
          academicYearName: exam.academicYearName,
          term: exam.term,
          month: exam.month,
          standardId: exam.standardId,
          standardName: exam.standardName,
          batchId: exam.batchId,
          batchName: exam.batchName,
          subjectId: exam.subjectId,
          subjectName: exam.subjectName,
          facultyId: exam.facultyId,
          facultyName: exam.facultyName,
          examDate: exam.examDate,
          studentId: r.studentId,
          studentName: r.studentName ?? "—",
          marks: r.marks,
          percentage: r.percentage,
          grade: r.grade ?? "—",
          passed: r.passed,
          isAbsent: r.isAbsent,
          rank: r.rank,
        });
      }
    });
    return { exams, rows };
  }

  /** Full analytics bundle (Phase 5). */
  async analytics(filters: InsightsFilters = {}): Promise<ExamAnalyticsBundle> {
    const { exams, rows } = await this.gather(filters);
    const aggs = studentAggregates(rows);
    const bySubject = groupComparison(rows, (r) => r.subjectId ?? r.subjectName, (r) => r.subjectName);
    return {
      filters,
      examCount: exams.length,
      studentCount: aggs.length,
      school: schoolStats(rows),
      bySubject,
      byFaculty: groupComparison(rows, (r) => r.facultyId ?? r.facultyName, (r) => r.facultyName),
      byClass: groupComparison(rows, (r) => r.standardId ?? r.standardName, (r) => r.standardName),
      bySection: groupComparison(rows, (r) => r.batchId ?? r.batchName, (r) => r.batchName),
      byMonth: monthTrend(rows),
      byYear: groupComparison(rows, (r) => r.academicYearId ?? r.academicYearName, (r) => r.academicYearName),
      gradeDistribution: gradeSpread(rows),
      rankDistribution: rankDistribution(rows),
      heatMap: heatMap(rows),
      topStudents: topStudents(aggs),
      bottomStudents: bottomStudents(aggs),
      mostImproved: mostImproved(aggs),
      performanceDrops: performanceDrops(aggs),
      riskStudents: riskStudents(aggs),
      scholarshipCandidates: scholarshipCandidates(aggs),
      strongSubjects: bySubject.slice(0, 5),
      weakSubjects: [...bySubject].reverse().slice(0, 5),
      generatedAt: new Date().toISOString(),
    };
  }

  /** Management dashboard cards + quick-action context (Phase 11). */
  async dashboard(filters: InsightsFilters = {}): Promise<DashboardCards> {
    const { exams, rows } = await this.gather(filters);
    const today = new Date().toISOString().slice(0, 10);
    const stats = schoolStats(rows);
    const withResults = new Set(rows.map((r) => r.examId));
    const bySubject = groupComparison(rows, (r) => r.subjectId ?? r.subjectName, (r) => r.subjectName);
    const byFaculty = groupComparison(rows, (r) => r.facultyId ?? r.facultyName, (r) => r.facultyName);
    const byClass = groupComparison(rows, (r) => r.standardId ?? r.standardName, (r) => r.standardName);

    const completed = exams.filter((e) => e.status === "completed");
    const published = exams.filter(
      (e) => e.resultsStatus === "published" || e.resultsStatus === "locked",
    );
    return {
      totalExams: exams.length,
      pendingExams: exams.filter((e) => e.status === "scheduled" || e.status === "draft").length,
      pendingMarksEntry: exams.filter((e) => !withResults.has(e.id)).length,
      completedExams: completed.length,
      publishedResults: published.length,
      needVerification: completed.filter(
        (e) => withResults.has(e.id) && e.resultsStatus === "pending",
      ).length,
      pendingPublications: exams.filter(
        (e) => withResults.has(e.id) && e.resultsStatus === "pending",
      ).length,
      upcomingExams: exams.filter(
        (e) => e.status === "scheduled" && !!e.examDate && e.examDate >= today,
      ).length,
      studentsAppeared: stats.appeared,
      studentsAbsent: stats.absent,
      averagePercentage: stats.averagePercentage,
      passRate: stats.passRate,
      failRate: stats.failRate,
      highestPercentage: stats.highestPercentage,
      lowestPercentage: stats.lowestPercentage,
      topFaculty: byFaculty[0]?.label,
      topSubject: bySubject[0]?.label,
      weakSubject: bySubject[bySubject.length - 1]?.label,
      topClass: byClass[0]?.label,
      lowestClass: byClass[byClass.length - 1]?.label,
    };
  }

  /** Rule-based AI insights + health scores (Phase 10/AI — no LLM). */
  async aiInsights(filters: InsightsFilters = {}): Promise<AiInsightsBundle> {
    const { rows } = await this.gather(filters);
    const stats = schoolStats(rows);
    const aggs = studentAggregates(rows);
    const bySubject = groupComparison(rows, (r) => r.subjectId ?? r.subjectName, (r) => r.subjectName);
    const byClass = groupComparison(rows, (r) => r.standardId ?? r.standardName, (r) => r.standardName);
    const byFaculty = groupComparison(rows, (r) => r.facultyId ?? r.facultyName, (r) => r.facultyName);

    // Academic health = blend of average %, pass rate and low-risk share.
    const lowRiskShare = aggs.length
      ? (aggs.filter((a) => a.risk !== "red").length / aggs.length) * 100
      : 100;
    const academicHealthScore = Math.round(
      stats.averagePercentage * 0.5 + stats.passRate * 0.3 + lowRiskShare * 0.2,
    );

    const classHealth = byClass.map((c) => ({
      label: c.label,
      score: Math.round(c.avgPercentage * 0.6 + c.passRate * 0.4),
      risk: c.avgPercentage >= 60 ? "green" : c.avgPercentage >= 45 ? "yellow" : "red",
    }));

    const subjectInsights: string[] = [];
    if (bySubject.length) {
      subjectInsights.push(`Strongest subject: ${bySubject[0].label} (${bySubject[0].avgPercentage}%).`);
      const weak = bySubject[bySubject.length - 1];
      subjectInsights.push(`Weakest subject: ${weak.label} (${weak.avgPercentage}%) — needs focus.`);
    }
    const facultyInsights = byFaculty
      .slice(0, 3)
      .map((f) => `${f.label}: ${f.avgPercentage}% avg, ${f.passRate}% pass.`);

    const managementInsights: string[] = [
      `School average ${stats.averagePercentage}% with a ${stats.passRate}% pass rate.`,
      `${riskStudents(aggs).length} student(s) at risk; ${scholarshipCandidates(aggs).length} scholarship candidate(s).`,
    ];
    if (byClass.length) managementInsights.push(`Top class: ${byClass[0].label}; needs support: ${byClass[byClass.length - 1].label}.`);

    const suggestedImprovements: string[] = [];
    if (bySubject.length) suggestedImprovements.push(`Remedial classes in ${bySubject[bySubject.length - 1].label}.`);
    if (riskStudents(aggs).length) suggestedImprovements.push(`Counselling for ${riskStudents(aggs).length} at-risk students.`);
    if (stats.stdDeviation > 20) suggestedImprovements.push("High score spread — consider differentiated teaching.");
    if (suggestedImprovements.length === 0) suggestedImprovements.push("Maintain current teaching plan.");

    return {
      academicHealthScore,
      classHealth,
      subjectInsights,
      facultyInsights,
      managementInsights,
      attendanceImpact: `${stats.absent} absence(s) across ${stats.totalResults} result rows.`,
      suggestedImprovements,
    };
  }

  /** Narrative summary for the whole filtered set (reuses buildAiSummary). */
  buildManagementSummary(bundle: ExamAnalyticsBundle): ReturnType<typeof buildAiSummary> {
    return buildAiSummary({
      overallPercent: bundle.school.appeared ? bundle.school.averagePercentage : null,
      attendancePercent: bundle.school.totalResults
        ? Math.round((bundle.school.appeared / bundle.school.totalResults) * 100)
        : null,
      commTotal: 0,
      commDelivered: 0,
      strongSubjects: bundle.strongSubjects.map((s) => s.label),
      weakSubjects: bundle.weakSubjects.map((s) => s.label),
    });
  }
}

export const examInsightsService = new ExamInsightsService();
