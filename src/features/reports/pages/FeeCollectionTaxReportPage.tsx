import { useMemo } from "react";
import { Percent } from "lucide-react";
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
import { useFeeRows } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import {
  bucketBy,
  formatDate,
  formatINR,
} from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useFeeRows>["data"]>["rows"][number];

const FeeCollectionTaxReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "fee_collection_tax",
    title: "Fee Collection With Tax Report",
    defaultWindowMonths: 6,
  });
  const { data, isLoading } = useFeeRows(page.filters);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.received > 0), [data]);
  const totalTax = rows.reduce((s, r) => s + (r.taxAmount ?? 0), 0);
  const totalCollected = rows.reduce((s, r) => s + r.received, 0);
  const cols: ExportColumn<Row>[] = [
    { header: "Date", value: (r) => formatDate(r.paidAt ?? r.dueDate) },
    { header: "Student", value: (r) => r.studentName },
    { header: "Batch", value: (r) => r.batch ?? "—" },
    { header: "Received", value: (r) => formatINR(r.received), align: "right" },
    { header: "Tax", value: (r) => formatINR(r.taxAmount ?? 0), align: "right" },
    { header: "Method", value: (r) => r.paymentMethod ?? "—" },
  ];
  const kpis = [
    { key: "c", label: "Collected", value: formatINR(totalCollected), tone: "positive" as const },
    { key: "t", label: "Tax received", value: formatINR(totalTax), tone: "info" as const },
    {
      key: "ratio",
      label: "Tax ratio",
      value: totalCollected ? `${((totalTax / totalCollected) * 100).toFixed(1)}%` : "0%",
      tone: "default" as const,
    },
  ];
  const byMethod = bucketBy(rows, (r) => r.paymentMethod ?? "—", (r) => r.received).map((b) => ({ label: b.key, value: b.total }));
  const byBatch = bucketBy(rows, (r) => r.batch ?? "—", (r) => r.taxAmount ?? 0).slice(0, 8).map((b) => ({ label: b.key, value: b.total }));

  return (
    <ReportPageShell
      title={page.title}
      description="Collections with GST/tax split — reconciliation-ready."
      icon={<Percent className="w-5 h-5" />}
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
        <ReportChartCard title="Tax by batch"><BarChart data={byBatch} color="#0ea5e9" /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar value={page.filters} onChange={page.setFilters} enabled={["dateRange", "batch", "branch", "paymentMethod"]} />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default FeeCollectionTaxReportPage;
