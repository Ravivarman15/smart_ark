import { useMemo } from "react";
import { LineChart as LineIcon } from "lucide-react";
import {
  BarChart,
  ComparisonChart,
  DataReportTable,
  PresetPicker,
  ReportChartCard,
  ReportFiltersBar,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
  TrendChart,
} from "../components";
import { useEnquiryRows } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { bucketBy, groupMonthly, percent } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

interface FunnelRow {
  stage: string;
  count: number;
  share: number;
}

const InquiryAnalysisPage = () => {
  const page = useReportPage<FunnelRow>({
    reportKey: "inquiry_analysis",
    title: "Student Inquiry Analysis Report",
    defaultWindowMonths: 12,
  });
  const { data: enquiries = [], isLoading } = useEnquiryRows(page.filters);

  const funnel: FunnelRow[] = useMemo(() => {
    const total = enquiries.length;
    const contacted = enquiries.filter((e) => e.status !== "new").length;
    const followed = enquiries.filter((e) => e.followUpDate).length;
    const admitted = enquiries.filter((e) => e.status === "admitted" || e.admittedAt).length;
    return [
      { stage: "Enquiries", count: total, share: 100 },
      { stage: "Contacted", count: contacted, share: percent(contacted, total) },
      { stage: "Follow-up", count: followed, share: percent(followed, total) },
      { stage: "Admitted", count: admitted, share: percent(admitted, total) },
    ];
  }, [enquiries]);

  const sourceConv = useMemo(() => {
    const map = new Map<string, { total: number; admitted: number }>();
    for (const e of enquiries) {
      const k = e.source ?? "unknown";
      const ex = map.get(k) ?? { total: 0, admitted: 0 };
      ex.total += 1;
      if (e.status === "admitted" || e.admittedAt) ex.admitted += 1;
      map.set(k, ex);
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, value: v.admitted, secondary: v.total }))
      .sort((a, b) => b.secondary - a.secondary)
      .slice(0, 8);
  }, [enquiries]);

  const monthly = groupMonthly(enquiries, (e) => e.createdAt);
  const monthlyAdm = groupMonthly(
    enquiries.filter((e) => e.status === "admitted" || e.admittedAt),
    (e) => e.admittedAt ?? e.createdAt,
  );

  const cols: ExportColumn<FunnelRow>[] = [
    { header: "Stage", value: (r) => r.stage },
    { header: "Count", value: (r) => r.count, align: "right" },
    { header: "Share %", value: (r) => `${r.share}%`, align: "right" },
  ];

  const kpis = [
    { key: "tot", label: "Enquiries", value: enquiries.length, tone: "default" as const },
    {
      key: "adm",
      label: "Admitted",
      value: funnel[3]?.count ?? 0,
      tone: "positive" as const,
    },
    {
      key: "conv",
      label: "Conversion %",
      value: `${funnel[3]?.share ?? 0}%`,
      tone: "info" as const,
    },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Inquiry-to-admission funnel, source conversion, seasonal trends."
      icon={<LineIcon className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, funnel, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={3} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Funnel">
          <BarChart data={funnel.map((f) => ({ label: f.stage, value: f.count }))} color="#0ea5e9" />
        </ReportChartCard>
        <ReportChartCard title="Source — total vs admitted">
          <ComparisonChart
            data={sourceConv}
            primaryLabel="Admitted"
            secondaryLabel="Total"
            primaryColor="#22c55e"
            secondaryColor="#94a3b8"
          />
        </ReportChartCard>
        <ReportChartCard title="Trend">
          <TrendChart data={monthly} />
        </ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar value={page.filters} onChange={page.setFilters} enabled={["dateRange"]} />
        <DataReportTable columns={cols} rows={funnel} rowKey={(r) => r.stage} loading={isLoading} />
      </div>
      <div className="mt-4">
        <ReportChartCard title="Admissions (monthly)">
          <TrendChart data={monthlyAdm} color="#22c55e" />
        </ReportChartCard>
      </div>
    </ReportPageShell>
  );
};

export default InquiryAnalysisPage;
