import { Scale } from "lucide-react";
import {
  ComparisonChart,
  DataReportTable,
  PresetPicker,
  ReportChartCard,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
  TrendChart,
} from "../components";
import { useProfitLossReport } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { formatINR } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

interface Row {
  month: string;
  income: number;
  expense: number;
  net: number;
}

const ProfitLossReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "profit_loss",
    title: "Profit / Loss Report",
  });
  const { data, isLoading } = useProfitLossReport();
  const rows = (data?.rows ?? []) as Row[];

  const cols: ExportColumn<Row>[] = [
    { header: "Month", value: (r) => r.month },
    { header: "Income", value: (r) => formatINR(r.income), align: "right" },
    { header: "Expense", value: (r) => formatINR(r.expense), align: "right" },
    { header: "Net", value: (r) => formatINR(r.net), align: "right" },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Monthly profit & loss with comparison of income vs expense."
      icon={<Scale className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, data?.kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={data?.kpis ?? []} loading={isLoading} cols={4} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportChartCard title="Net profit trend">
          <TrendChart data={(data?.series ?? []).map((s) => ({ label: s.label, value: s.value }))} />
        </ReportChartCard>
        <ReportChartCard title="Income vs Expense">
          <ComparisonChart
            data={rows.map((r) => ({ label: r.month, value: r.income, secondary: r.expense }))}
            primaryLabel="Income"
            secondaryLabel="Expense"
            primaryColor="#22c55e"
            secondaryColor="#ef4444"
          />
        </ReportChartCard>
      </div>
      <div className="mt-4">
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.month} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default ProfitLossReportPage;
