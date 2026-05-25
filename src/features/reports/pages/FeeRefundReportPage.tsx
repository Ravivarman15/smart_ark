import { useMemo } from "react";
import { Undo2 } from "lucide-react";
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

const FeeRefundReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "fee_refund",
    title: "Fee Refund Report",
    defaultWindowMonths: 6,
  });
  const { data, isLoading } = useFeeRows(page.filters);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.refund > 0), [data]);
  const cols: ExportColumn<Row>[] = [
    { header: "Date", value: (r) => formatDate(r.paidAt ?? r.dueDate) },
    { header: "Student", value: (r) => r.studentName },
    { header: "Batch", value: (r) => r.batch ?? "—" },
    { header: "Refund", value: (r) => formatINR(r.refund), align: "right" },
    { header: "Total paid", value: (r) => formatINR(r.received), align: "right" },
  ];
  const total = rows.reduce((s, r) => s + r.refund, 0);
  const kpis = [
    { key: "tot", label: "Refunded", value: formatINR(total), tone: "warning" as const },
    { key: "cnt", label: "Refunds", value: rows.length, tone: "default" as const },
    {
      key: "ratio",
      label: "Refund ratio",
      value: data?.totals.received
        ? `${((total / data.totals.received) * 100).toFixed(2)}%`
        : "0%",
      tone: "info" as const,
    },
  ];
  const byBatch = bucketBy(rows, (r) => r.batch ?? "—", (r) => r.refund).slice(0, 8).map((b) => ({ label: b.key, value: b.total }));
  const monthly = groupMonthly(rows, (r) => r.paidAt ?? r.dueDate, (r) => r.refund);

  return (
    <ReportPageShell
      title={page.title}
      description="Refunds issued — by batch, by month, with refund ratio vs total collected."
      icon={<Undo2 className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={3} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportChartCard title="Refunds by batch"><BarChart data={byBatch} color="#f59e0b" /></ReportChartCard>
        <ReportChartCard title="Refunds trend"><TrendChart data={monthly} color="#f59e0b" /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar value={page.filters} onChange={page.setFilters} enabled={["dateRange", "batch", "branch", "search"]} />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default FeeRefundReportPage;
