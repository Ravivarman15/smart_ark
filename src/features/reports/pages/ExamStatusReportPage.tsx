import { useMemo } from "react";
import { FileBarChart2 } from "lucide-react";
import {
  BarChart,
  DataReportTable,
  PieChart,
  PresetPicker,
  ReportChartCard,
  ReportFiltersBar,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
  TrendChart,
} from "../components";
import { useExamSummaryRows } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import {
  bucketBy,
  formatDate,
  groupMonthly,
  percent,
} from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useExamSummaryRows>["data"]>[number];

const ExamStatusReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "exam_status",
    title: "Exam Status Report",
    defaultWindowMonths: 6,
  });
  const { data: rows = [], isLoading } = useExamSummaryRows(page.filters);
  const cols: ExportColumn<Row>[] = [
    { header: "Exam", value: (r) => r.name },
    { header: "Date", value: (r) => formatDate(r.examDate) },
    { header: "Status", value: (r) => r.status ?? "—" },
    { header: "Students", value: (r) => r.totalStudents ?? "—", align: "right" },
    { header: "Avg %", value: (r) => r.avgScore ?? "—", align: "right" },
  ];
  const byStatus = bucketBy(rows, (r) => r.status ?? "—").map((b) => ({ label: b.key, value: b.total }));
  const monthly = groupMonthly(rows, (r) => r.examDate);
  const completed = rows.filter((r) => r.status === "completed" || r.status === "graded").length;
  const kpis = [
    { key: "tot", label: "Total exams", value: rows.length, tone: "default" as const },
    { key: "c", label: "Completed", value: completed, tone: "positive" as const },
    {
      key: "rate",
      label: "Completion %",
      value: `${percent(completed, rows.length)}%`,
      tone: "info" as const,
    },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Exam pipeline — scheduled, in-progress, completed, graded — with completion rate."
      icon={<FileBarChart2 className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={3} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportChartCard title="Status mix"><PieChart data={byStatus} /></ReportChartCard>
        <ReportChartCard title="Exams per month"><TrendChart data={monthly} /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar value={page.filters} onChange={page.setFilters} enabled={["dateRange"]} />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default ExamStatusReportPage;
