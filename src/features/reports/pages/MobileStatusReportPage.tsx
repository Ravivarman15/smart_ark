import { useMemo } from "react";
import { Smartphone } from "lucide-react";
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
import { useStudentsBasic } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { fuzzyMatch, percent } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useStudentsBasic>["data"]>[number];

const MobileStatusReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "mobile_status",
    title: "Mobile App Status Report",
  });
  const { data: all = [], isLoading } = useStudentsBasic();
  const rows = useMemo(() => {
    return all.filter((s) => {
      if (page.filters.branchId && s.campusId !== page.filters.branchId) return false;
      if (page.filters.batchId && s.batchId !== page.filters.batchId) return false;
      if (page.filters.search && !fuzzyMatch(s.name, page.filters.search)) return false;
      return true;
    });
  }, [all, page.filters]);

  const total = rows.length;
  const enabled = rows.filter((s) => s.appAccessEnabled).length;
  const disabled = total - enabled;
  const cols: ExportColumn<Row>[] = [
    { header: "Student", value: (r) => r.name },
    { header: "Roll", value: (r) => r.rollNumber ?? "—" },
    { header: "App access", value: (r) => (r.appAccessEnabled ? "Enabled" : "Disabled") },
    { header: "Contact", value: (r) => r.studentContact ?? r.parentContact ?? "—" },
  ];

  const kpis = [
    { key: "tot", label: "Students", value: total, tone: "default" as const },
    { key: "e", label: "App-enabled", value: enabled, tone: "positive" as const },
    { key: "d", label: "Disabled", value: disabled, tone: "warning" as const },
    {
      key: "rate",
      label: "Adoption %",
      value: `${percent(enabled, total)}%`,
      tone: "info" as const,
    },
  ];

  const pie = [
    { label: "Enabled", value: enabled, color: "#22c55e" },
    { label: "Disabled", value: disabled, color: "#94a3b8" },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Mobile app adoption, engagement and access analytics."
      icon={<Smartphone className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={4} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportChartCard title="Access status">
          <PieChart data={pie} />
        </ReportChartCard>
        <ReportChartCard title="Batches with most enabled">
          <BarChart
            data={Array.from(
              rows.reduce((m, s) => {
                if (!s.appAccessEnabled) return m;
                const k = s.batchId ?? "—";
                m.set(k, (m.get(k) ?? 0) + 1);
                return m;
              }, new Map<string, number>()),
            )
              .map(([label, value]) => ({ label, value }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 8)}
            color="#0ea5e9"
          />
        </ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["branch", "batch", "search"]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default MobileStatusReportPage;
