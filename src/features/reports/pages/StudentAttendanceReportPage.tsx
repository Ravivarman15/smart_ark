import { useMemo } from "react";
import { ClipboardCheck } from "lucide-react";
import {
  BarChart,
  DataReportTable,
  Heatmap,
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
  useStudentAttendanceRows,
  useStudentsBasic,
} from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import {
  bucketBy,
  formatDate,
  groupMonthly,
  percent,
} from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

interface Row {
  studentId: string;
  studentName: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  pct: number;
}

const StudentAttendanceReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "student_attendance",
    title: "Student Attendance Report",
    defaultWindowMonths: 3,
  });
  const { data: students = [] } = useStudentsBasic();
  const { data, isLoading } = useStudentAttendanceRows(page.filters);
  const att = data?.rows ?? [];

  const sName = new Map(students.map((s) => [s.id, s.name]));

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const a of att) {
      if (!a.studentId) continue;
      const e =
        map.get(a.studentId) ?? {
          studentId: a.studentId,
          studentName: sName.get(a.studentId) ?? "Student",
          present: 0,
          absent: 0,
          late: 0,
          total: 0,
          pct: 0,
        };
      e.total += 1;
      if (a.status === "present") e.present += 1;
      else if (a.status === "absent") e.absent += 1;
      else if (a.status === "late") e.late += 1;
      e.pct = percent(e.present + e.late, e.total);
      map.set(a.studentId, e);
    }
    return Array.from(map.values()).sort((a, b) => a.pct - b.pct);
  }, [att, sName]);

  const cols: ExportColumn<Row>[] = [
    { header: "Student", value: (r) => r.studentName },
    { header: "Present", value: (r) => r.present, align: "right" },
    { header: "Late", value: (r) => r.late, align: "right" },
    { header: "Absent", value: (r) => r.absent, align: "right" },
    { header: "Total", value: (r) => r.total, align: "right" },
    { header: "Attendance %", value: (r) => r.pct, align: "right" },
  ];

  const totalPresent = rows.reduce((s, r) => s + r.present, 0);
  const totalAbsent = rows.reduce((s, r) => s + r.absent, 0);
  const totalLate = rows.reduce((s, r) => s + r.late, 0);
  const totalAll = totalPresent + totalAbsent + totalLate;
  const overallPct = percent(totalPresent + totalLate, totalAll);
  const trend = groupMonthly(att, (a) => a.date, (a) => (a.status === "present" || a.status === "late" ? 1 : 0));

  const heat = useMemo(() => {
    const months = Array.from(new Set(att.map((a) => a.date.slice(0, 7)))).sort();
    const statuses = ["present", "late", "absent"];
    const cells = months.flatMap((m) =>
      statuses.map((s) => ({
        row: s,
        col: m,
        value: att.filter((a) => a.date.startsWith(m) && a.status === s).length,
      })),
    );
    return { cells, rows: statuses, cols: months };
  }, [att]);

  const kpis = [
    { key: "pct", label: "Overall attendance", value: `${overallPct}%`, tone: "info" as const },
    { key: "p", label: "Present", value: totalPresent, tone: "positive" as const },
    { key: "l", label: "Late", value: totalLate, tone: "warning" as const },
    { key: "a", label: "Absent", value: totalAbsent, tone: "negative" as const },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Percentage, late-entry trends, batch comparisons and absentee heatmap."
      icon={<ClipboardCheck className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Attendance trend">
          <TrendChart data={trend} color="#22c55e" />
        </ReportChartCard>
        <ReportChartCard title="Lowest attendance">
          <BarChart
            data={rows.slice(0, 8).map((r) => ({ label: r.studentName, value: r.pct }))}
            color="#ef4444"
          />
        </ReportChartCard>
        <ReportChartCard title="Status heatmap (monthly)">
          <Heatmap cells={heat.cells} rows={heat.rows} cols={heat.cols} />
        </ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "batch", "search"]}
        />
        <DataReportTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.studentId}
          loading={isLoading}
          renderDetail={(r) => (
            <div className="p-2 space-y-2">
              <PercentageIndicator label="Attendance" value={r.pct} tone={r.pct >= 75 ? "positive" : "negative"} />
            </div>
          )}
        />
      </div>
    </ReportPageShell>
  );
};

export default StudentAttendanceReportPage;
