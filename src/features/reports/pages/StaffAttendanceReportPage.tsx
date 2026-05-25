import { useMemo } from "react";
import { Users } from "lucide-react";
import {
  BarChart,
  DataReportTable,
  Heatmap,
  PresetPicker,
  ReportChartCard,
  ReportFiltersBar,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
  TrendChart,
} from "../components";
import { useStaffAttendanceRows } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { groupMonthly, percent } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

interface Row {
  staffId: string;
  staffName: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  pct: number;
}

const StaffAttendanceReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "staff_attendance",
    title: "Staff Attendance Report",
    defaultWindowMonths: 3,
  });
  const { data, isLoading } = useStaffAttendanceRows(page.filters);
  const att = data?.rows ?? [];

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const a of att) {
      if (!a.staffId) continue;
      const e =
        map.get(a.staffId) ?? {
          staffId: a.staffId,
          staffName: a.staffName ?? "Staff",
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
      map.set(a.staffId, e);
    }
    return Array.from(map.values()).sort((a, b) => b.pct - a.pct);
  }, [att]);

  const cols: ExportColumn<Row>[] = [
    { header: "Staff", value: (r) => r.staffName },
    { header: "Present", value: (r) => r.present, align: "right" },
    { header: "Late", value: (r) => r.late, align: "right" },
    { header: "Absent", value: (r) => r.absent, align: "right" },
    { header: "Total", value: (r) => r.total, align: "right" },
    { header: "Attendance %", value: (r) => r.pct, align: "right" },
  ];

  const presentTotal = rows.reduce((s, r) => s + r.present, 0);
  const absentTotal = rows.reduce((s, r) => s + r.absent, 0);
  const lateTotal = rows.reduce((s, r) => s + r.late, 0);
  const total = presentTotal + absentTotal + lateTotal;
  const overall = percent(presentTotal + lateTotal, total);
  const trend = groupMonthly(att, (a) => a.date, (a) => (a.status === "absent" ? 0 : 1));

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
    { key: "pct", label: "Punctuality", value: `${overall}%`, tone: "info" as const },
    { key: "p", label: "Present", value: presentTotal, tone: "positive" as const },
    { key: "l", label: "Late", value: lateTotal, tone: "warning" as const },
    { key: "a", label: "Absent", value: absentTotal, tone: "negative" as const },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Punctuality, absenteeism, department comparisons and attendance heatmap."
      icon={<Users className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Top punctuality">
          <BarChart
            data={rows.slice(0, 8).map((r) => ({ label: r.staffName, value: r.pct }))}
            color="#22c55e"
          />
        </ReportChartCard>
        <ReportChartCard title="Attendance trend">
          <TrendChart data={trend} />
        </ReportChartCard>
        <ReportChartCard title="Status heatmap (monthly)">
          <Heatmap cells={heat.cells} rows={heat.rows} cols={heat.cols} />
        </ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "staff"]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.staffId} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default StaffAttendanceReportPage;
