import { PiggyBank } from "lucide-react";
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
import { useIncomeReport } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { formatDate, formatINR } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useIncomeReport>["data"]>["rows"][number];

const IncomeReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "income",
    title: "Income Report",
    defaultWindowMonths: 6,
  });
  const { data, isLoading } = useIncomeReport(page.filters);
  const rows = data?.rows ?? [];
  const cols: ExportColumn<Row>[] = [
    { header: "Date", value: (r) => formatDate(r.date) },
    { header: "Title", value: (r) => r.title ?? r.category },
    { header: "Source", value: (r) => r.source ?? r.categoryName ?? "—" },
    { header: "Branch", value: (r) => r.branchName ?? "—" },
    { header: "Amount", value: (r) => formatINR(r.amount), align: "right" },
    { header: "Tax", value: (r) => formatINR(r.taxAmount), align: "right" },
    { header: "Status", value: (r) => r.status },
  ];
  return (
    <ReportPageShell
      title={page.title}
      description="Revenue ledger with source / branch / status."
      icon={<PiggyBank className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, data?.kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={data?.kpis ?? []} loading={isLoading} cols={3} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Trend"><TrendChart data={data?.series ?? []} color="#22c55e" /></ReportChartCard>
        <ReportChartCard title="By category"><PieChart data={data?.breakdown ?? []} /></ReportChartCard>
        <ReportChartCard title="Top sources"><BarChart data={data?.breakdown ?? []} color="#22c55e" /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "branch", "category", "status", "search"]}
          statusOptions={[
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "paid", label: "Paid" },
          ]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default IncomeReportPage;
