// Attendance WhatsApp reports — four views over the same ledger, each exportable
// to PDF / Excel / CSV / Print via the existing attendance Export Center engine
// (utils/exportData → renderReportWindow). No new export code.

import { useMemo, useState } from "react";
import { FileBarChart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttendancePageShell, EmptyState, ExportMenu } from "../../components";
import { today } from "../../utils/dates";
import { useAttendanceNotices } from "../hooks";
import type { ExportRequest } from "../../utils/exportData";
import type { AttendanceNotice } from "../services/attendanceComms.service";

type ReportKey = "all" | "failed" | "missing" | "audit";

const REPORTS: { key: ReportKey; label: string; title: string }[] = [
  { key: "all", label: "Attendance WhatsApp", title: "Attendance WhatsApp Report" },
  { key: "failed", label: "Failed Delivery", title: "Failed Delivery Report" },
  { key: "missing", label: "Missing Parent Mobile", title: "Missing Parent Mobile Report" },
  { key: "audit", label: "Communication Audit", title: "Attendance Communication Audit" },
];

const fmt = (iso?: string): string => (iso ? new Date(iso).toLocaleString("en-IN") : "");

const AttendanceCommsReportsPage = () => {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<ReportKey>("all");

  const { data: notices = [], isLoading } = useAttendanceNotices(from, to);

  const rows = useMemo(() => {
    if (report === "failed") return notices.filter((n) => n.status === "failed");
    if (report === "missing") return notices.filter((n) => n.failureReason === "missing_mobile");
    return notices;
  }, [notices, report]);

  const meta = REPORTS.find((r) => r.key === report)!;

  /** Built lazily on click so the export always mirrors what's on screen. */
  const buildExport = (): ExportRequest<AttendanceNotice> => {
    const base = [
      { header: "Student", value: (n: AttendanceNotice) => n.studentName ?? "" },
      { header: "Parent", value: (n: AttendanceNotice) => n.parentName ?? "" },
      { header: "Class", value: (n: AttendanceNotice) => n.className ?? "" },
      { header: "Section", value: (n: AttendanceNotice) => (n.section === "-" ? "" : n.section ?? "") },
      { header: "Attendance Date", value: (n: AttendanceNotice) => n.attendanceDate },
      { header: "Mobile", value: (n: AttendanceNotice) => n.phone ?? "" },
    ];

    const columns =
      report === "missing"
        ? base
        : report === "audit"
          ? [
              ...base,
              { header: "Type", value: (n: AttendanceNotice) => (n.kind === "corrected" ? "Correction" : "Absent") },
              { header: "Status", value: (n: AttendanceNotice) => n.status },
              { header: "Provider Msg ID", value: (n: AttendanceNotice) => n.providerMessageId ?? "" },
              { header: "Sent At", value: (n: AttendanceNotice) => fmt(n.sentAt) },
              { header: "Delivered At", value: (n: AttendanceNotice) => fmt(n.deliveredAt) },
              { header: "Read At", value: (n: AttendanceNotice) => fmt(n.readAt) },
              { header: "Error", value: (n: AttendanceNotice) => n.error ?? "" },
              { header: "Message", value: (n: AttendanceNotice) => n.body ?? "" },
            ]
          : [
              ...base,
              { header: "Type", value: (n: AttendanceNotice) => (n.kind === "corrected" ? "Correction" : "Absent") },
              { header: "Status", value: (n: AttendanceNotice) => n.status },
              { header: "Sent At", value: (n: AttendanceNotice) => fmt(n.sentAt) },
              { header: "Reason", value: (n: AttendanceNotice) => n.error ?? "" },
            ];

    const delivered = rows.filter((n) => ["sent", "delivered", "read"].includes(n.status)).length;
    return {
      reportKey: `attendance_whatsapp_${report}`,
      title: meta.title,
      subtitle: `${from} → ${to} · ARK Learning Arena`,
      columns,
      rows,
      kpis: [
        { label: "Rows", value: rows.length },
        { label: "Delivered", value: delivered },
        { label: "Failed", value: rows.filter((n) => n.status === "failed").length },
        {
          label: "Success %",
          value: rows.length === 0 ? "0%" : `${Math.round((delivered / rows.length) * 100)}%`,
        },
      ],
    };
  };

  return (
    <AttendancePageShell
      title="Attendance WhatsApp Reports"
      description="Delivery, failure and audit reports for the absent-student parent notifications. Export to PDF, Excel, CSV or print."
      icon={<FileBarChart className="w-5 h-5" />}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          <ExportMenu build={buildExport} disabled={rows.length === 0} />
        </div>
      }
    >
      <div className="space-y-3">
        <Tabs value={report} onValueChange={(v) => setReport(v as ReportKey)}>
          <TabsList>
            {REPORTS.map((r) => (
              <TabsTrigger key={r.key} value={r.key}>
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="glass-card p-0 overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<FileBarChart className="w-5 h-5" />}
              title="Nothing to report"
              description="No attendance notifications match this report for the selected date range."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Student</th>
                    <th className="text-left font-medium px-4 py-2">Parent</th>
                    <th className="text-left font-medium px-4 py-2">Class</th>
                    <th className="text-left font-medium px-4 py-2">Date</th>
                    <th className="text-left font-medium px-4 py-2">Mobile</th>
                    <th className="text-left font-medium px-4 py-2">Status</th>
                    <th className="text-left font-medium px-4 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rows.map((n) => (
                    <tr key={n.id}>
                      <td className="px-4 py-2">{n.studentName ?? "—"}</td>
                      <td className="px-4 py-2">{n.parentName ?? "—"}</td>
                      <td className="px-4 py-2">
                        {n.className ?? "—"}
                        {n.section && n.section !== "-" ? ` - ${n.section}` : ""}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{n.attendanceDate}</td>
                      <td className="px-4 py-2 tabular-nums">{n.phone ?? "—"}</td>
                      <td className="px-4 py-2 capitalize">{n.status}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs">
                        {n.error ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AttendancePageShell>
  );
};

export default AttendanceCommsReportsPage;
