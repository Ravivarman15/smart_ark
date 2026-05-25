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
  TrendChart,
} from "../components";
import { useExpenseReport } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { formatDate, formatINR } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useExpenseReport>["data"]>["rows"][number];

const ExpenseReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "expense",
    title: "Expense Report",
    defaultWindowMonths: 6,
  });
  const { data, isLoading } = useExpenseReport(page.filters);
  const rows = data?.rows ?? [];
  const cols: ExportColumn<Row>[] = [
    { header: "Date", value: (r) => formatDate(r.date) },
    { header: "Title", value: (r) => r.title ?? r.category },
    { header: "Category", value: (r) => r.categoryName ?? r.category },
    { header: "Vendor", value: (r) => r.vendorName ?? "—" },
    { header: "Branch", value: (r) => r.branchName ?? "—" },
    { header: "Amount", value: (r) => formatINR(r.amount), align: "right" },
    { header: "Tax", value: (r) => formatINR(r.taxAmount), align: "right" },
    { header: "Status", value: (r) => r.status },
  ];
  return (
    <ReportPageShell
      title={page.title}
      description="Expense ledger with vendor / category / branch / status."
      icon={<Receipt className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, data?.kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={data?.kpis ?? []} loading={isLoading} cols={5} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Trend"><TrendChart data={data?.series ?? []} color="#ef4444" /></ReportChartCard>
        <ReportChartCard title="By category"><PieChart data={data?.breakdown ?? []} /></ReportChartCard>
        <ReportChartCard title="Top categories"><BarChart data={data?.breakdown ?? []} color="#ef4444" /></ReportChartCard>
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
            { value: "rejected", label: "Rejected" },
          ]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default ExpenseReportPage;
