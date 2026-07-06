import { useMemo } from "react";
import { Award } from "lucide-react";
import {
  BarChart,
  DataReportTable,
  PresetPicker,
  ReportChartCard,
  ReportFiltersBar,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
} from "../components";
import {
  useExamResultRows,
  useExamSummaryRows,
  useStudentsBasic,
} from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { avg, percent } from "../utils/reportCalc";
import { passFloorPercent } from "@/features/exams/utils";
import type { ExportColumn } from "../types/reports.types";

interface Row {
  studentId: string;
  studentName: string;
  examsTaken: number;
  avgPct: number;
  rank?: number;
  grade?: string;
}

const StudentExamSummaryPage = () => {
  const page = useReportPage<Row>({
    reportKey: "student_exam_summary",
    title: "Student Exam Summary Report",
  });
  const { data: students = [] } = useStudentsBasic();
  const { data: results = [], isLoading } = useExamResultRows({});
  const { data: exams = [] } = useExamSummaryRows({});

  const sName = new Map(students.map((s) => [s.id, s.name]));
  const examInRange = (id?: string) => {
    if (!id) return true;
    const ex = exams.find((e) => e.id === id);
    if (!ex?.examDate) return true;
    if (page.filters.from && ex.examDate < page.filters.from) return false;
    if (page.filters.to && ex.examDate > page.filters.to) return false;
    return true;
  };

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, { takes: number[]; rank: number[]; grade?: string }>();
    for (const r of results) {
      if (!r.studentId || !examInRange(r.examId)) continue;
      const e = map.get(r.studentId) ?? { takes: [], rank: [], grade: undefined };
      e.takes.push(r.percentage);
      if (r.rank != null) e.rank.push(r.rank);
      if (r.grade) e.grade = r.grade;
      map.set(r.studentId, e);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({
        studentId: id,
        studentName: sName.get(id) ?? "Student",
        examsTaken: v.takes.length,
        avgPct: avg(v.takes),
        rank: v.rank.length ? Math.min(...v.rank) : undefined,
        grade: v.grade,
      }))
      .sort((a, b) => b.avgPct - a.avgPct);
  }, [results, sName, page.filters.from, page.filters.to]);

  const cols: ExportColumn<Row>[] = [
    { header: "Student", value: (r) => r.studentName },
    { header: "Exams", value: (r) => r.examsTaken, align: "right" },
    { header: "Avg %", value: (r) => r.avgPct, align: "right" },
    { header: "Best rank", value: (r) => r.rank ?? "—", align: "right" },
    { header: "Grade", value: (r) => r.grade ?? "—" },
  ];

  // Pass line follows the configured grading scheme instead of a hard-coded 35%.
  const passFloor = passFloorPercent();

  const top10 = rows.slice(0, 10).map((r) => ({ label: r.studentName, value: r.avgPct }));
  const kpis = [
    { key: "stu", label: "Students with results", value: rows.length, tone: "default" as const },
    { key: "avg", label: "Class average", value: `${avg(rows.map((r) => r.avgPct))}%`, tone: "info" as const },
    {
      key: "pass",
      label: "Pass %",
      value: `${percent(rows.filter((r) => r.avgPct >= passFloor).length, rows.length)}%`,
      tone: "positive" as const,
    },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Per-student exam summary — averages, ranks, grades, toppers."
      icon={<Award className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={3} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportChartCard title="Top 10"><BarChart data={top10} color="#22c55e" /></ReportChartCard>
        <ReportChartCard title="Score distribution">
          <BarChart
            data={[
              { label: "<40", value: rows.filter((r) => r.avgPct < 40).length, color: "#ef4444" },
              { label: "40–60", value: rows.filter((r) => r.avgPct >= 40 && r.avgPct < 60).length, color: "#f59e0b" },
              { label: "60–80", value: rows.filter((r) => r.avgPct >= 60 && r.avgPct < 80).length, color: "#0ea5e9" },
              { label: "80+", value: rows.filter((r) => r.avgPct >= 80).length, color: "#22c55e" },
            ]}
          />
        </ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar value={page.filters} onChange={page.setFilters} enabled={["dateRange", "batch", "search"]} />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.studentId} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default StudentExamSummaryPage;
