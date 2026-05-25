import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
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
import { useMessageRows } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import {
  bucketBy,
  formatDateTime,
  groupMonthly,
  percent,
} from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useMessageRows>["data"]>[number];

const SmsStatusReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "sms_status",
    title: "SMS Status Report",
    defaultWindowMonths: 3,
  });
  const { data: rows = [], isLoading } = useMessageRows(page.filters);
  const sent = rows.filter((r) => r.status === "sent" || r.status === "delivered").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const queued = rows.filter((r) => r.status === "queued" || r.status === "pending").length;
  const byChannel = bucketBy(rows, (r) => r.channel).map((b) => ({ label: b.key, value: b.total }));
  const byStatus = bucketBy(rows, (r) => r.status).map((b) => ({ label: b.key, value: b.total }));
  const monthly = groupMonthly(rows, (r) => r.sentAt);

  const cols: ExportColumn<Row>[] = [
    { header: "Sent at", value: (r) => formatDateTime(r.sentAt) },
    { header: "Channel", value: (r) => r.channel },
    { header: "Recipient", value: (r) => r.recipient ?? "—" },
    { header: "Template", value: (r) => r.template ?? "—" },
    { header: "Status", value: (r) => r.status },
    { header: "Error", value: (r) => r.error ?? "—" },
  ];
  const kpis = [
    { key: "tot", label: "Messages", value: rows.length, tone: "default" as const },
    { key: "s", label: "Delivered", value: sent, tone: "positive" as const },
    { key: "f", label: "Failed", value: failed, tone: "negative" as const },
    { key: "q", label: "Queued", value: queued, tone: "warning" as const },
    {
      key: "rate",
      label: "Delivery %",
      value: `${percent(sent, rows.length)}%`,
      tone: "info" as const,
    },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Delivery, failure and queue analytics across SMS + WhatsApp channels."
      icon={<MessageSquare className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={5} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Channel mix"><PieChart data={byChannel} /></ReportChartCard>
        <ReportChartCard title="Status mix"><BarChart data={byStatus} /></ReportChartCard>
        <ReportChartCard title="Volume trend"><TrendChart data={monthly} /></ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "status"]}
          statusOptions={[
            { value: "sent", label: "Sent" },
            { value: "delivered", label: "Delivered" },
            { value: "failed", label: "Failed" },
            { value: "queued", label: "Queued" },
          ]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default SmsStatusReportPage;
