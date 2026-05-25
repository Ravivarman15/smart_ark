import { useMemo } from "react";
import { Receipt } from "lucide-react";
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
} from "../components";
import { useFeeRows } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { bucketBy, formatINR, percent } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useFeeRows>["data"]>["rows"][number];

const FeeStatusReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "fee_status",
    title: "Fee Status Report",
    defaultWindowMonths: 6,
  });
  const { data, isLoading } = useFeeRows(page.filters);
  const rows = data?.rows ?? [];

  const cols: ExportColumn<Row>[] = [
    { header: "Student", value: (r) => r.studentName },
    { header: "Batch", value: (r) => r.batch ?? "—" },
    { header: "Total", value: (r) => formatINR(r.amount), align: "right" },
    { header: "Received", value: (r) => formatINR(r.received), align: "right" },
    { header: "Pending", value: (r) => formatINR(r.pending), align: "right" },
    { header: "Status", value: (r) => r.status },
  ];

  const paid = rows.filter((r) => r.paid).length;
  const partial = rows.filter((r) => !r.paid && r.received > 0).length;
  const pending = rows.length - paid - partial;
  const byStatus = [
    { label: "Paid", value: paid, color: "#22c55e" },
    { label: "Partial", value: partial, color: "#f59e0b" },
    { label: "Pending", value: pending, color: "#ef4444" },
  ];
  const byBatch = bucketBy(rows, (r) => r.batch ?? "—", (r) => r.amount).slice(0, 8).map((b) => ({ label: b.key, value: b.total }));

  const kpis = [
    { key: "tot", label: "Total invoices", value: rows.length, tone: "default" as const },
    { key: "p", label: "Paid", value: paid, tone: "positive" as const },
    { key: "pp", label: "Partial", value: partial, tone: "warning" as const },
    { key: "n", label: "Pending", value: pending, tone: "negative" as const },
    {
      key: "rate",
      label: "Paid %",
      value: `${percent(paid, rows.length)}%`,
      tone: "info" as const,
    },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Status mix across invoices — paid, partial, pending — with batch breakdown."
      icon={<Receipt className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={5} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportChartCard title="Status mix"><PieChart data={byStatus} /></ReportChartCard>
        <ReportChartCard title="Top batches by total"><BarChart data={byBatch} color="#0ea5e9" /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "batch", "branch", "status", "search"]}
          statusOptions={[
            { value: "paid", label: "Paid" },
            { value: "partial", label: "Partial" },
            { value: "pending", label: "Pending" },
          ]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default FeeStatusReportPage;
