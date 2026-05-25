import { useMemo } from "react";
import { LineChart as LineIcon } from "lucide-react";
import {
  BarChart,
  ComparisonChart,
  DataReportTable,
  PercentageIndicator,
  PieChart,
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
  formatINR,
  groupMonthly,
  percent,
} from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

interface AnalysisRow {
  metric: string;
  value: string;
}

const FeeAnalysisReportPage = () => {
  const page = useReportPage<AnalysisRow>({
    reportKey: "fee_analysis",
    title: "Fee Analysis Report",
    defaultWindowMonths: 12,
  });
  const { data, isLoading } = useFeeRows(page.filters);
  const rows = data?.rows ?? [];

  const totals = data?.totals ?? { gross: 0, received: 0, pending: 0, discount: 0, refund: 0, tax: 0 };
  const efficiency = percent(totals.received, totals.gross);
  const overdueAmt = rows.filter((r) => !r.paid && r.dueDate && r.dueDate < new Date().toISOString().slice(0, 10)).reduce((s, r) => s + r.pending, 0);
  const refundRatio = totals.received ? (totals.refund / totals.received) * 100 : 0;

  const analysis: AnalysisRow[] = [
    { metric: "Gross invoiced", value: formatINR(totals.gross) },
    { metric: "Received", value: formatINR(totals.received) },
    { metric: "Pending", value: formatINR(totals.pending) },
    { metric: "Discount", value: formatINR(totals.discount) },
    { metric: "Refund", value: formatINR(totals.refund) },
    { metric: "Tax", value: formatINR(totals.tax) },
    { metric: "Collection efficiency", value: `${efficiency}%` },
    { metric: "Refund ratio", value: `${refundRatio.toFixed(2)}%` },
    { metric: "Overdue value", value: formatINR(overdueAmt) },
  ];

  const cols: ExportColumn<AnalysisRow>[] = [
    { header: "Metric", value: (r) => r.metric },
    { header: "Value", value: (r) => r.value, align: "right" },
  ];

  const kpis = [
    { key: "eff", label: "Collection efficiency", value: `${efficiency}%`, tone: "info" as const },
    { key: "rr", label: "Refund ratio", value: `${refundRatio.toFixed(1)}%`, tone: "warning" as const },
    { key: "od", label: "Overdue", value: formatINR(overdueAmt), tone: "negative" as const },
    { key: "dis", label: "Discounts", value: formatINR(totals.discount), tone: "default" as const },
  ];

  const monthly = groupMonthly(rows, (r) => r.paidAt ?? r.dueDate, (r) => r.received);
  const monthlyPending = groupMonthly(rows, (r) => r.dueDate, (r) => r.pending);
  const compareSeries = monthly.map((m, i) => ({
    label: m.label,
    value: m.value,
    secondary: monthlyPending[i]?.value ?? 0,
  }));
  const byMethod = bucketBy(rows.filter((r) => r.received > 0), (r) => r.paymentMethod ?? "—", (r) => r.received).map((b) => ({
    label: b.key,
    value: b.total,
  }));

  return (
    <ReportPageShell
      title={page.title}
      description="Deep fee analytics — efficiency, overdue, refund, payment behaviour."
      icon={<LineIcon className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, analysis, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Received vs Pending (monthly)">
          <ComparisonChart data={compareSeries} primaryLabel="Received" secondaryLabel="Pending" primaryColor="#22c55e" secondaryColor="#ef4444" />
        </ReportChartCard>
        <ReportChartCard title="Payment-method mix"><PieChart data={byMethod} /></ReportChartCard>
        <ReportChartCard title="Collection trend"><TrendChart data={monthly} color="#22c55e" /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-2">
        <PercentageIndicator label="Collection efficiency" value={efficiency} tone={efficiency >= 80 ? "positive" : efficiency >= 60 ? "warning" : "negative"} />
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar value={page.filters} onChange={page.setFilters} enabled={["dateRange", "batch", "branch"]} />
        <DataReportTable columns={cols} rows={analysis} rowKey={(r) => r.metric} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default FeeAnalysisReportPage;
