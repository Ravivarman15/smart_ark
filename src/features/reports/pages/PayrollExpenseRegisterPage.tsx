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
import { usePayrollExpenseReport } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { formatDate, formatINR } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

// Payroll Expense Register — the salary slice of Finance expenses
// (source='payroll'), one row per employee salary line. Reuses the whole report
// engine (KPIs / trend / department breakdown / universal filters / PDF-Excel-
// CSV-Print export). No new calculation — net salary is read from the synced
// Finance rows.

type Row = NonNullable<ReturnType<typeof usePayrollExpenseReport>["data"]>["rows"][number];

const PayrollExpenseRegisterPage = () => {
  const page = useReportPage<Row>({
    reportKey: "payroll_expense",
    title: "Payroll Expense Register",
    defaultWindowMonths: 12,
  });
  const { data, isLoading } = usePayrollExpenseReport(page.filters);
  const rows = data?.rows ?? [];
  const cols: ExportColumn<Row>[] = [
    { header: "Date", value: (r) => formatDate(r.date) },
    { header: "Employee", value: (r) => r.title ?? "Salary" },
    { header: "Department", value: (r) => r.department ?? "—" },
    { header: "Category", value: (r) => r.categoryName ?? r.category },
    { header: "Net Salary", value: (r) => formatINR(r.amount), align: "right" },
    { header: "Reference", value: (r) => r.transactionReference ?? "—" },
    { header: "Status", value: (r) => r.status },
  ];
  return (
    <ReportPageShell
      title={page.title}
      description="Per-employee salary expenses auto-synced from Payroll (source = payroll)."
      icon={<Wallet className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, data?.kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={data?.kpis ?? []} loading={isLoading} cols={5} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportChartCard title="Monthly salary trend"><TrendChart data={data?.series ?? []} color="#ef4444" /></ReportChartCard>
        <ReportChartCard title="By department"><BarChart data={data?.breakdown ?? []} color="#ef4444" /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "branch", "status", "search"]}
          statusOptions={[
            { value: "approved", label: "Approved" },
            { value: "paid", label: "Paid" },
          ]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default PayrollExpenseRegisterPage;
