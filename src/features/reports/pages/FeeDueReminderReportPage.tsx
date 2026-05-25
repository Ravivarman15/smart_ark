import { useMemo } from "react";
import { BellRing } from "lucide-react";
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
} from "../components";
import { useFeeRows } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import {
  bucketBy,
  formatDate,
  formatINR,
  groupMonthly,
  todayIso,
} from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useFeeRows>["data"]>["rows"][number];

const FeeDueReminderReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "fee_due_reminder",
    title: "Fee Due Reminder Report",
    defaultWindowMonths: 3,
  });
  const { data, isLoading } = useFeeRows(page.filters);
  const all = data?.rows ?? [];
  const today = todayIso();
  const rows = useMemo(
    () => all.filter((r) => !r.paid && r.dueDate && r.dueDate <= today).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    [all, today],
  );
  const cols: ExportColumn<Row>[] = [
    { header: "Due", value: (r) => formatDate(r.dueDate) },
    { header: "Student", value: (r) => r.studentName },
    { header: "Batch", value: (r) => r.batch ?? "—" },
    { header: "Total", value: (r) => formatINR(r.amount), align: "right" },
    { header: "Pending", value: (r) => formatINR(r.pending), align: "right" },
    { header: "Contact", value: () => "—" },
  ];
  const kpis = [
    { key: "due", label: "Reminders due", value: rows.length, tone: "warning" as const },
    { key: "p", label: "Pending amount", value: formatINR(rows.reduce((s, r) => s + r.pending, 0)), tone: "negative" as const },
    { key: "g", label: "Gross", value: formatINR(data?.totals.gross ?? 0), tone: "default" as const },
  ];
  const buckets = bucketBy(rows, (r) => r.batch ?? "—", (r) => r.pending).slice(0, 8).map((b) => ({ label: b.key, value: b.total }));
  const overdueHeat = useMemo(() => {
    const months = Array.from(new Set(rows.map((r) => (r.dueDate ?? "").slice(0, 7)).filter(Boolean))).sort();
    const buckets = ["0-7d", "8-30d", ">30d"];
    const now = new Date();
    const cells = months.flatMap((m) =>
      buckets.map((b) => ({
        row: b,
        col: m,
        value: rows.filter((r) => {
          if (!(r.dueDate ?? "").startsWith(m)) return false;
          const days = Math.floor((now.getTime() - new Date(r.dueDate ?? "").getTime()) / 86400000);
          if (b === "0-7d") return days <= 7;
          if (b === "8-30d") return days > 7 && days <= 30;
          return days > 30;
        }).length,
      })),
    );
    return { cells, rows: buckets, cols: months };
  }, [rows]);

  return (
    <ReportPageShell
      title={page.title}
      description="Overdue invoices grouped by age — ready for the reminder workflow."
      icon={<BellRing className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={3} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportChartCard title="Pending by batch"><BarChart data={buckets} color="#ef4444" /></ReportChartCard>
        <ReportChartCard title="Overdue age × month"><Heatmap cells={overdueHeat.cells} rows={overdueHeat.rows} cols={overdueHeat.cols} hue={0} /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar value={page.filters} onChange={page.setFilters} enabled={["dateRange", "batch", "branch", "search"]} />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default FeeDueReminderReportPage;
