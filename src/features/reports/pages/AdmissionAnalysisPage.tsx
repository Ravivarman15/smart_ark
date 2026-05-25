import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
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
import {
  useEnquiryRows,
  useStudentsBasic,
} from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { bucketBy, formatDate, groupMonthly, percent } from "../utils/reportCalc";
import { useReportLookups } from "../hooks/useReportLookups";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useStudentsBasic>["data"]>[number];

const AdmissionAnalysisPage = () => {
  const page = useReportPage<Row>({
    reportKey: "admission_analysis",
    title: "Student Admission Analysis Report",
    defaultWindowMonths: 12,
  });
  const { data: students = [], isLoading } = useStudentsBasic();
  const { data: enquiries = [] } = useEnquiryRows(page.filters);
  const { data: lookups } = useReportLookups();

  const inRange = (d?: string) => {
    if (!d) return false;
    if (page.filters.from && d < page.filters.from) return false;
    if (page.filters.to && d > page.filters.to) return false;
    return true;
  };
  const rows = useMemo(() => {
    return students.filter((s) => {
      if (page.filters.branchId && s.campusId !== page.filters.branchId) return false;
      if (page.filters.batchId && s.batchId !== page.filters.batchId) return false;
      if (page.filters.standardId && s.standardId !== page.filters.standardId) return false;
      if (page.filters.from || page.filters.to) {
        return inRange(s.admissionDate);
      }
      return true;
    });
  }, [students, page.filters]);

  const branchById = new Map((lookups?.branches ?? []).map((b) => [b.id, b.name]));
  const batchById = new Map((lookups?.batches ?? []).map((b) => [b.id, b.name]));

  const byBranch = bucketBy(rows, (s) => branchById.get(s.campusId ?? "") ?? "—").map((b) => ({
    label: b.key,
    value: b.total,
  }));
  const byBatch = bucketBy(rows, (s) => batchById.get(s.batchId ?? "") ?? "—")
    .slice(0, 8)
    .map((b) => ({ label: b.key, value: b.total }));
  const monthly = groupMonthly(rows, (s) => s.admissionDate);
  const enquiryMonthly = groupMonthly(enquiries, (e) => e.createdAt);

  const cols: ExportColumn<Row>[] = [
    { header: "Student", value: (r) => r.name },
    { header: "Branch", value: (r) => branchById.get(r.campusId ?? "") ?? "—" },
    { header: "Batch", value: (r) => batchById.get(r.batchId ?? "") ?? "—" },
    { header: "Admitted", value: (r) => formatDate(r.admissionDate) },
    { header: "Active", value: (r) => (r.isActive ? "Yes" : "No") },
  ];

  const conversionPct = percent(
    enquiries.filter((e) => e.status === "admitted" || e.admittedAt).length,
    enquiries.length,
  );

  const kpis = [
    { key: "tot", label: "Admissions", value: rows.length, tone: "positive" as const },
    { key: "branches", label: "Branches", value: byBranch.length, tone: "info" as const },
    { key: "batches", label: "Batches", value: byBatch.length, tone: "default" as const },
    {
      key: "conv",
      label: "Inquiry → Admission",
      value: `${conversionPct}%`,
      tone: "info" as const,
    },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Branch-wise admissions, batch mix, seasonal trends and conversion."
      icon={<TrendingUp className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="By branch">
          <PieChart data={byBranch} />
        </ReportChartCard>
        <ReportChartCard title="Top batches">
          <BarChart data={byBatch} color="#22c55e" />
        </ReportChartCard>
        <ReportChartCard title="Admissions trend">
          <TrendChart data={monthly} color="#22c55e" />
        </ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "branch", "batch", "standard"]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
      <div className="mt-4">
        <ReportChartCard title="Enquiry vs admission trend (overlap)">
          <TrendChart data={enquiryMonthly} />
        </ReportChartCard>
      </div>
    </ReportPageShell>
  );
};

export default AdmissionAnalysisPage;
