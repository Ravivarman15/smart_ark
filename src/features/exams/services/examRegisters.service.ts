import { BaseService } from "@/shared/services";
import {
  exportCsv,
  exportExcel,
  exportPdf,
} from "@/features/reports/utils/exportEngine";
import type { ExportColumn } from "@/features/reports/types/reports.types";
import {
  groupComparison,
  monthTrend,
  schoolStats,
  studentAggregates,
  type ScoredRow,
} from "../utils/analytics";
import { termLabel, monthLabel, examTypeLabel } from "../types/exam.types";
import { examInsightsService, type InsightsFilters } from "./examInsights.service";

// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Registers (Phase 13). Each register is a row set derived from the
// SAME analytics engine (examInsightsService.gather) and delivered through the
// SHARED report export engine (exportCsv / exportExcel / exportPdf / print) —
// no bespoke export code, no duplicate aggregation.
// ─────────────────────────────────────────────────────────────────────────────

export type RegisterType =
  | "academic"
  | "exam"
  | "subject"
  | "monthly"
  | "term"
  | "annual"
  | "student_progress"
  | "topper"
  | "failure"
  | "subject_analysis"
  | "faculty_performance"
  | "attendance_vs_marks";

type Row = Record<string, string | number>;

export interface RegisterResult {
  reportKey: string;
  title: string;
  subtitle: string;
  columns: ExportColumn<Row>[];
  rows: Row[];
}

export const REGISTER_TYPES: { value: RegisterType; label: string }[] = [
  { value: "academic", label: "Academic Register" },
  { value: "exam", label: "Exam Register" },
  { value: "subject", label: "Subject Register" },
  { value: "monthly", label: "Monthly Register" },
  { value: "term", label: "Term Register" },
  { value: "annual", label: "Annual Register" },
  { value: "student_progress", label: "Student Progress Register" },
  { value: "topper", label: "Topper Register" },
  { value: "failure", label: "Failure Register" },
  { value: "subject_analysis", label: "Subject Analysis Report" },
  { value: "faculty_performance", label: "Faculty Performance Report" },
  { value: "attendance_vs_marks", label: "Attendance vs Marks Report" },
];

const col = (header: string, key: string, align?: ExportColumn<Row>["align"]): ExportColumn<Row> => ({
  header,
  align,
  value: (r) => r[key] ?? "",
});

class ExamRegistersService extends BaseService {
  async build(type: RegisterType, filters: InsightsFilters = {}): Promise<RegisterResult> {
    const { exams, rows } = await examInsightsService.gather(filters);
    const subtitle = [
      filters.academicYearId ? "Year filtered" : "All years",
      filters.month ? monthLabel(filters.month) : "All months",
      filters.standardId ? "Class filtered" : "All classes",
    ].join(" · ");

    const wrap = (
      reportKey: string,
      title: string,
      columns: ExportColumn<Row>[],
      data: Row[],
    ): RegisterResult => ({ reportKey, title, subtitle, columns, rows: data });

    switch (type) {
      case "academic": {
        const data: Row[] = rows.map((r) => ({
          Student: r.studentName,
          Class: r.standardName ?? "",
          Section: r.batchName ?? "",
          Subject: r.subjectName ?? "",
          Exam: r.examTitle,
          Month: monthLabel(r.month),
          Marks: r.isAbsent ? "AB" : r.marks ?? "",
          "%": r.isAbsent ? "" : r.percentage,
          Grade: r.grade,
        }));
        return wrap("academic_register", "Academic Register",
          [col("Student", "Student"), col("Class", "Class"), col("Section", "Section"),
           col("Subject", "Subject"), col("Exam", "Exam"), col("Month", "Month"),
           col("Marks", "Marks", "right"), col("%", "%", "right"), col("Grade", "Grade")], data);
      }

      case "exam": {
        const data: Row[] = exams.map((e) => {
          const er = rows.filter((r) => r.examId === e.id);
          const s = schoolStats(er);
          return {
            Exam: e.title,
            Type: examTypeLabel(e.examType),
            Class: e.standardName ?? "",
            Subject: e.subjectName ?? "",
            Faculty: e.facultyName ?? "",
            Date: e.examDate ?? "",
            Appeared: s.appeared,
            Absent: s.absent,
            "Avg %": s.averagePercentage,
            "Pass %": s.passRate,
          };
        });
        return wrap("exam_register", "Exam Register",
          [col("Exam", "Exam"), col("Type", "Type"), col("Class", "Class"),
           col("Subject", "Subject"), col("Faculty", "Faculty"), col("Date", "Date"),
           col("Appeared", "Appeared", "right"), col("Absent", "Absent", "right"),
           col("Avg %", "Avg %", "right"), col("Pass %", "Pass %", "right")], data);
      }

      case "subject":
      case "subject_analysis": {
        const cmp = groupComparison(rows, (r) => r.subjectId ?? r.subjectName, (r) => r.subjectName);
        const data: Row[] = cmp.map((c) => ({
          Subject: c.label, "Avg %": c.avgPercentage, "Pass %": c.passRate,
          Appeared: c.appeared, Highest: c.highest, Lowest: c.lowest,
        }));
        return wrap("subject_register", type === "subject" ? "Subject Register" : "Subject Analysis Report",
          [col("Subject", "Subject"), col("Avg %", "Avg %", "right"), col("Pass %", "Pass %", "right"),
           col("Appeared", "Appeared", "right"), col("Highest", "Highest", "right"), col("Lowest", "Lowest", "right")], data);
      }

      case "monthly": {
        const data: Row[] = monthTrend(rows).map((c) => ({
          Month: monthLabel(c.key), "Avg %": c.avgPercentage, "Pass %": c.passRate, Appeared: c.appeared,
        }));
        return wrap("monthly_register", "Monthly Register",
          [col("Month", "Month"), col("Avg %", "Avg %", "right"), col("Pass %", "Pass %", "right"), col("Appeared", "Appeared", "right")], data);
      }

      case "term": {
        const cmp = groupComparison(rows, (r) => r.term, (r) => termLabel(r.term));
        const data: Row[] = cmp.map((c) => ({
          Term: c.label, "Avg %": c.avgPercentage, "Pass %": c.passRate, Appeared: c.appeared,
        }));
        return wrap("term_register", "Term Register",
          [col("Term", "Term"), col("Avg %", "Avg %", "right"), col("Pass %", "Pass %", "right"), col("Appeared", "Appeared", "right")], data);
      }

      case "annual":
      case "student_progress": {
        const aggs = studentAggregates(rows);
        const data: Row[] = aggs
          .sort((a, b) => b.averagePercentage - a.averagePercentage)
          .map((a) => ({
            Student: a.studentName, Class: a.standardName ?? "", Exams: a.examsCount,
            "Avg %": a.averagePercentage, "Pass %": a.passRate, Fails: a.fails,
            Trend: a.trendDelta, "Predicted %": a.predictedNext, Risk: a.risk.toUpperCase(),
          }));
        return wrap(type === "annual" ? "annual_register" : "student_progress_register",
          type === "annual" ? "Annual Register" : "Student Progress Register",
          [col("Student", "Student"), col("Class", "Class"), col("Exams", "Exams", "right"),
           col("Avg %", "Avg %", "right"), col("Pass %", "Pass %", "right"), col("Fails", "Fails", "right"),
           col("Trend", "Trend", "right"), col("Predicted %", "Predicted %", "right"), col("Risk", "Risk")], data);
      }

      case "topper": {
        const aggs = studentAggregates(rows).sort((a, b) => b.averagePercentage - a.averagePercentage);
        const data: Row[] = aggs.slice(0, 50).map((a, i) => ({
          Rank: i + 1, Student: a.studentName, Class: a.standardName ?? "",
          "Avg %": a.averagePercentage, Exams: a.examsCount,
        }));
        return wrap("topper_register", "Topper Register",
          [col("Rank", "Rank", "right"), col("Student", "Student"), col("Class", "Class"),
           col("Avg %", "Avg %", "right"), col("Exams", "Exams", "right")], data);
      }

      case "failure": {
        const data: Row[] = studentAggregates(rows)
          .filter((a) => a.fails > 0)
          .sort((a, b) => b.fails - a.fails)
          .map((a) => ({
            Student: a.studentName, Class: a.standardName ?? "", Fails: a.fails,
            "Avg %": a.averagePercentage, Risk: a.risk.toUpperCase(),
          }));
        return wrap("failure_register", "Failure Register",
          [col("Student", "Student"), col("Class", "Class"), col("Fails", "Fails", "right"),
           col("Avg %", "Avg %", "right"), col("Risk", "Risk")], data);
      }

      case "faculty_performance": {
        const cmp = groupComparison(rows, (r) => r.facultyId ?? r.facultyName, (r) => r.facultyName);
        const data: Row[] = cmp.map((c) => ({
          Faculty: c.label, "Avg %": c.avgPercentage, "Pass %": c.passRate,
          Appeared: c.appeared, Highest: c.highest,
        }));
        return wrap("faculty_performance", "Faculty Performance Report",
          [col("Faculty", "Faculty"), col("Avg %", "Avg %", "right"), col("Pass %", "Pass %", "right"),
           col("Appeared", "Appeared", "right"), col("Highest", "Highest", "right")], data);
      }

      case "attendance_vs_marks": {
        const byStudent = new Map<string, ScoredRow[]>();
        for (const r of rows) (byStudent.get(r.studentId) ?? byStudent.set(r.studentId, []).get(r.studentId)!).push(r);
        const data: Row[] = [...byStudent.values()].map((all) => {
          const appeared = all.filter((r) => !r.isAbsent && r.marks != null);
          const attendancePct = all.length ? Math.round((appeared.length / all.length) * 100) : 0;
          const avg = schoolStats(all).averagePercentage;
          return {
            Student: all[0].studentName, Class: all[0].standardName ?? "",
            "Attendance %": attendancePct, "Avg Marks %": avg,
            Correlation: attendancePct >= 75 && avg >= 60 ? "Aligned" : attendancePct < 75 && avg < 50 ? "Both low" : "Mixed",
          };
        }).sort((a, b) => Number(b["Attendance %"]) - Number(a["Attendance %"]));
        return wrap("attendance_vs_marks", "Attendance vs Marks Report",
          [col("Student", "Student"), col("Class", "Class"), col("Attendance %", "Attendance %", "right"),
           col("Avg Marks %", "Avg Marks %", "right"), col("Correlation", "Correlation")], data);
      }

      default:
        return wrap("register", "Register", [], []);
    }
  }

  /** Build + deliver a register through the shared export engine. */
  async generate(
    type: RegisterType,
    filters: InsightsFilters,
    format: "csv" | "xlsx" | "pdf" | "print",
  ): Promise<RegisterResult> {
    const reg = await this.build(type, filters);
    const req = {
      reportKey: reg.reportKey,
      title: reg.title,
      subtitle: reg.subtitle,
      columns: reg.columns,
      rows: reg.rows,
    };
    if (format === "csv") exportCsv(req);
    else if (format === "xlsx") exportExcel(req);
    else exportPdf(req); // pdf + print share the print dialog
    return reg;
  }
}

export const examRegistersService = new ExamRegistersService();
