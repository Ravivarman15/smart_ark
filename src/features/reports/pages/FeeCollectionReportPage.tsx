import { useMemo } from "react";
import { CircleDollarSign } from "lucide-react";
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

const FeeCollectionReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "fee_collection",
    title: "Fee Collection Report",
    defaultWindowMonths: 6,
  });
  const { data, isLoading } = useFeeRows(page.filters);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.received > 0), [data]);
  const cols: ExportColumn<Row>[] = [
    { header: "Date", value: (r) => formatDate(r.paidAt ?? r.dueDate) },
    { header: "Student", value: (r) => r.studentName },
    { header: "Batch", value: (r) => r.batch ?? "—" },
    { header: "Received", value: (r) => formatINR(r.received), align: "right" },
    { header: "Method", value: (r) => r.paymentMethod ?? "—" },
  ];
  const kpis = [
    { key: "tot", label: "Collected", value: formatINR(rows.reduce((s, r) => s + r.received, 0)), tone: "positive" as const },
    { key: "txn", label: "Transactions", value: rows.length, tone: "default" as const },
    { key: "avg", label: "Avg ticket", value: formatINR(rows.length ? rows.reduce((s, r) => s + r.received, 0) / rows.length : 0), tone: "info" as const },
  ];
  const byMethod = bucketBy(rows, (r) => r.paymentMethod ?? "—", (r) => r.received).map((b) => ({ label: b.key, value: b.total }));
  const monthly = groupMonthly(rows, (r) => r.paidAt ?? r.dueDate, (r) => r.received);

  return (
    <ReportPageShell
      title={page.title}
      description="Collection trend, payment-method mix and per-batch totals."
      icon={<CircleDollarSign className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={3} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportChartCard title="Collection by method"><BarChart data={byMethod} color="#22c55e" /></ReportChartCard>
        <ReportChartCard title="Monthly collection"><TrendChart data={monthly} color="#22c55e" /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "batch", "branch", "paymentMethod", "search"]}
          paymentOptions={[
            { value: "Cash", label: "Cash" },
            { value: "UPI", label: "UPI" },
            { value: "Bank Transfer", label: "Bank Transfer" },
            { value: "Card", label: "Card" },
            { value: "Cheque", label: "Cheque" },
          ]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default FeeCollectionReportPage;
