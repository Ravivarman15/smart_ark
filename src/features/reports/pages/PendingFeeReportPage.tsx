import { useMemo } from "react";
import { Wallet } from "lucide-react";
import {
  BarChart,
  DataReportTable,
  PresetPicker,
  ReportChartCard,
  ReportFiltersBar,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
  TrendChart,
} from "../components";
import { useFeeRows } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import {
  bucketBy,
  formatDate,
  formatINR,
  groupMonthly,
} from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useFeeRows>["data"]>["rows"][number];

const PendingFeeReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "pending_fee",
    title: "Pending Fee Report",
    defaultWindowMonths: 6,
  });
  const { data, isLoading } = useFeeRows(page.filters);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.pending > 0), [data]);
  const cols: ExportColumn<Row>[] = [
    { header: "Student", value: (r) => r.studentName },
    { header: "Batch", value: (r) => r.batch ?? "—" },
    { header: "Due", value: (r) => formatDate(r.dueDate) },
    { header: "Total", value: (r) => formatINR(r.amount), align: "right" },
    { header: "Received", value: (r) => formatINR(r.received), align: "right" },
    { header: "Pending", value: (r) => formatINR(r.pending), align: "right" },
    { header: "Status", value: (r) => r.status },
  ];
  const kpis = [
    { key: "tot", label: "Pending invoices", value: rows.length, tone: "warning" as const },
    { key: "amt", label: "Pending amount", value: formatINR(rows.reduce((s, r) => s + r.pending, 0)), tone: "negative" as const },
    { key: "rec", label: "Received so far", value: formatINR(data?.totals.received ?? 0), tone: "positive" as const },
  ];
  const byBatch = bucketBy(rows, (r) => r.batch ?? "—", (r) => r.pending).slice(0, 8).map((b) => ({ label: b.key, value: b.total }));
  const monthly = groupMonthly(rows, (r) => r.dueDate, (r) => r.pending);

  return (
    <ReportPageShell
      title={page.title}
      description="All unpaid balances with student, batch, due date and ageing trend."
      icon={<Wallet className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={3} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportChartCard title="Pending by batch"><BarChart data={byBatch} color="#ef4444" /></ReportChartCard>
        <ReportChartCard title="Pending trend (by due month)"><TrendChart data={monthly} color="#ef4444" /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar value={page.filters} onChange={page.setFilters} enabled={["dateRange", "batch", "branch", "search"]} />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default PendingFeeReportPage;
