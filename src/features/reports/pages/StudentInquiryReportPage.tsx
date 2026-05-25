import { useMemo } from "react";
import { Inbox } from "lucide-react";
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
import { useEnquiryRows } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import { bucketBy, formatDate, groupMonthly, percent } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useEnquiryRows>["data"]>[number];

const StudentInquiryReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "student_inquiry",
    title: "Student Inquiry Report",
    defaultWindowMonths: 6,
  });
  const { data: rows = [], isLoading } = useEnquiryRows(page.filters);

  const admitted = rows.filter((r) => r.status === "admitted" || r.admittedAt).length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const dropped = rows.filter((r) => r.status === "dropped" || r.status === "lost").length;
  const conversion = percent(admitted, rows.length);
  const bySource = bucketBy(rows, (r) => r.source).map((b) => ({ label: b.key, value: b.total }));
  const byCounselor = bucketBy(rows, (r) => r.assignedTo)
    .slice(0, 8)
    .map((b) => ({ label: b.key, value: b.total }));
  const monthly = groupMonthly(rows, (r) => r.createdAt);

  const cols: ExportColumn<Row>[] = [
    { header: "Date", value: (r) => formatDate(r.createdAt) },
    { header: "Student", value: (r) => r.studentName },
    { header: "Parent", value: (r) => r.parentName ?? "—" },
    { header: "Contact", value: (r) => r.contact ?? "—" },
    { header: "Source", value: (r) => r.source ?? "—" },
    { header: "Status", value: (r) => r.status },
    { header: "Counselor", value: (r) => r.assignedTo ?? "—" },
    { header: "Follow-up", value: (r) => formatDate(r.followUpDate) },
  ];

  const kpis = [
    { key: "t", label: "Total enquiries", value: rows.length, tone: "default" as const },
    { key: "a", label: "Admitted", value: admitted, tone: "positive" as const },
    { key: "p", label: "Pending", value: pending, tone: "warning" as const },
    { key: "d", label: "Dropped", value: dropped, tone: "negative" as const },
    { key: "c", label: "Conversion", value: `${conversion}%`, tone: "info" as const },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Pipeline, source mix, counselor performance and follow-up adherence."
      icon={<Inbox className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={5} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Source mix"><PieChart data={bySource} /></ReportChartCard>
        <ReportChartCard title="Counselor performance"><BarChart data={byCounselor} color="#a855f7" /></ReportChartCard>
        <ReportChartCard title="Monthly trend"><TrendChart data={monthly} /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "status", "search"]}
          statusOptions={[
            { value: "pending", label: "Pending" },
            { value: "followup", label: "Follow-up" },
            { value: "admitted", label: "Admitted" },
            { value: "dropped", label: "Dropped" },
          ]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default StudentInquiryReportPage;
