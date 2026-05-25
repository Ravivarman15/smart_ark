import { useMemo } from "react";
import { Trophy } from "lucide-react";
import {
  BarChart,
  ComparisonChart,
  DataReportTable,
  PercentageIndicator,
  PresetPicker,
  ReportChartCard,
  ReportFiltersBar,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
  TrendChart,
} from "../components";
import {
  useExamResultRows,
  useExamSummaryRows,
  useStudentAttendanceRows,
  useStudentsBasic,
} from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import {
  avg,
  bucketBy,
  groupMonthly,
  pearson,
  percent,
  round2,
} from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

interface Row {
  studentId: string;
  studentName: string;
  examsTaken: number;
  avgPct: number;
  attendancePct: number;
  spi?: number;
}

const StudentPerformanceReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "student_performance",
    title: "Student Performance Report",
    defaultWindowMonths: 6,
  });
  const { data: students = [], isLoading: sLoading } = useStudentsBasic();
  const { data: results = [], isLoading: rLoading } = useExamResultRows({});
  const { data: exams = [] } = useExamSummaryRows(page.filters);
  const { data: attRes } = useStudentAttendanceRows(page.filters);
  const attendance = attRes?.rows ?? [];

  const studentName = new Map(students.map((s) => [s.id, s.name]));
  const studentSpi = new Map(students.map((s) => [s.id, s.spi]));

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, { takes: number[]; att: { p: number; total: number } }>();
    for (const r of results) {
      if (!r.studentId) continue;
      const e = map.get(r.studentId) ?? { takes: [], att: { p: 0, total: 0 } };
      e.takes.push(r.percentage);
      map.set(r.studentId, e);
    }
    for (const a of attendance) {
      if (!a.studentId) continue;
      const e = map.get(a.studentId) ?? { takes: [], att: { p: 0, total: 0 } };
      e.att.total += 1;
      if (a.status === "present" || a.status === "late") e.att.p += 1;
      map.set(a.studentId, e);
    }
    return Array.from(map.entries()).map(([id, v]) => ({
      studentId: id,
      studentName: studentName.get(id) ?? "Student",
      examsTaken: v.takes.length,
      avgPct: avg(v.takes),
      attendancePct: percent(v.att.p, v.att.total),
      spi: studentSpi.get(id) ?? undefined,
    }));
  }, [results, attendance, studentName, studentSpi]);

  const topN = [...rows].sort((a, b) => b.avgPct - a.avgPct).slice(0, 10);
  const trend = groupMonthly(results, (r) => r.examId ? exams.find((e) => e.id === r.examId)?.examDate : undefined, (r) => r.percentage / Math.max(1, results.length));
  const correlation = pearson(
    rows.map((r) => r.attendancePct),
    rows.map((r) => r.avgPct),
  );
  const subjectStrength = bucketBy(
    results,
    (r) => exams.find((e) => e.id === r.examId)?.name,
    (r) => r.percentage,
  )
    .slice(0, 8)
    .map((b) => ({ label: b.key, value: round2(b.total / b.count) }));

  const cols: ExportColumn<Row>[] = [
    { header: "Student", value: (r) => r.studentName },
    { header: "Exams taken", value: (r) => r.examsTaken, align: "right" },
    { header: "Avg %", value: (r) => r.avgPct, align: "right" },
    { header: "Attendance %", value: (r) => r.attendancePct, align: "right" },
    { header: "SPI", value: (r) => r.spi ?? "—", align: "right" },
  ];

  const kpis = [
    { key: "stu", label: "Students with data", value: rows.length, tone: "default" as const },
    { key: "avg", label: "Avg %", value: `${avg(rows.map((r) => r.avgPct))}%`, tone: "info" as const },
    {
      key: "corr",
      label: "Attendance ⇔ Marks",
      value: correlation,
      hint: "Pearson r (-1 to 1)",
      tone: correlation >= 0 ? ("positive" as const) : ("warning" as const),
    },
    {
      key: "weak",
      label: "Below 40%",
      value: rows.filter((r) => r.avgPct < 40).length,
      tone: "negative" as const,
    },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Academic growth, attendance correlation, subject strengths/weaknesses."
      icon={<Trophy className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={sLoading || rLoading} cols={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Top performers">
          <BarChart
            data={topN.map((r) => ({ label: r.studentName, value: r.avgPct }))}
            color="#22c55e"
          />
        </ReportChartCard>
        <ReportChartCard title="Subject strengths">
          <BarChart data={subjectStrength} color="#a855f7" />
        </ReportChartCard>
        <ReportChartCard title="Performance trend">
          <TrendChart data={trend} />
        </ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "batch", "standard", "search"]}
        />
        <DataReportTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.studentId}
          loading={sLoading || rLoading}
          renderDetail={(r) => (
            <div className="grid grid-cols-2 gap-4 p-2">
              <PercentageIndicator label="Avg score" value={r.avgPct} tone="positive" />
              <PercentageIndicator label="Attendance" value={r.attendancePct} tone="info" />
            </div>
          )}
        />
      </div>
    </ReportPageShell>
  );
};

export default StudentPerformanceReportPage;
