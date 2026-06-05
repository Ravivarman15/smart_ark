import { useMemo, useState } from "react";
import { FileBarChart, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttendancePageShell, ExportMenu } from "../../components";
import { AnalyticsFilters } from "../components";
import { useStudentAnalytics, useStaffAnalytics } from "../hooks/useAnalytics";
import { useStudentAttendanceAudit } from "../../hooks/useStudentAttendance";
import { formatDate, formatClock } from "../../utils/dates";
import type { ExportColumn } from "../../utils/exportData";
import type { StudentAnalyticsFilters } from "../types/analytics.types";

type ReportType =
  | "summary"
  | "defaulter"
  | "monthly"
  | "batch"
  | "standard"
  | "work_hours"
  | "late"
  | "audit";

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: "summary", label: "Attendance Summary" },
  { value: "defaulter", label: "Defaulter Report (<75%)" },
  { value: "monthly", label: "Monthly Attendance" },
  { value: "batch", label: "Batch Attendance" },
  { value: "standard", label: "Standard Attendance" },
  { value: "work_hours", label: "Work Hours" },
  { value: "late", label: "Late Arrivals" },
  { value: "audit", label: "Attendance Audit" },
];

interface BuiltReport {
  reportKey: string;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ExportColumn<any>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
}

/**
 * Attendance Reports hub — one page, many report types, all powered by the
 * Phase-3 analytics services (no duplicate calculations). Every report renders
 * a print-ready table and exports to CSV / Excel / PDF via the Export Center.
 */
const AttendanceReportsPage = () => {
  const todayStr = new Date().toISOString().split("T")[0];
  const monthAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().split("T")[0];
  })();

  const [type, setType] = useState<ReportType>("summary");
  const [filters, setFilters] = useState<StudentAnalyticsFilters>({ from: monthAgo, to: todayStr });

  const isStaff = type === "work_hours" || type === "late";
  const isAudit = type === "audit";

  const student = useStudentAnalytics(filters, !isStaff && !isAudit);
  const staff = useStaffAnalytics({ from: filters.from, to: filters.to }, isStaff);
  const audit = useStudentAttendanceAudit(
    isAudit ? { fromDate: filters.from, toDate: filters.to, limit: 500 } : {},
  );

  const isLoading = isStaff ? staff.isLoading : isAudit ? audit.isLoading : student.isLoading;

  const report = useMemo<BuiltReport>(() => {
    const sub = `${filters.from} → ${filters.to}`;
    switch (type) {
      case "summary":
      case "defaulter": {
        const all = student.data?.defaulters ?? [];
        const rows = type === "defaulter" ? all.filter((d) => d.attendancePct < 75) : all;
        return {
          reportKey: type === "defaulter" ? "attendance_defaulter" : "attendance_summary",
          title: type === "defaulter" ? "Attendance Defaulter Report" : "Attendance Summary Report",
          columns: [
            { header: "Roll", value: (r) => r.rollNumber ?? "" },
            { header: "Student", value: (r) => r.studentName },
            { header: "Standard", value: (r) => r.standardName ?? "" },
            { header: "Batch", value: (r) => r.batchName ?? "" },
            { header: "Attendance %", value: (r) => r.attendancePct, align: "right" },
            { header: "Days Missed", value: (r) => r.daysMissed, align: "right" },
            { header: "Risk", value: (r) => r.riskLevel },
          ],
          rows,
        };
      }
      case "monthly":
        return {
          reportKey: "attendance_monthly",
          title: "Monthly Attendance Report",
          columns: [
            { header: "Month", value: (r) => r.label },
            { header: "Attendance %", value: (r) => r.value, align: "right" },
          ],
          rows: student.data?.monthlyTrend ?? [],
        };
      case "batch":
      case "standard": {
        const rows = type === "batch" ? student.data?.batchComparison ?? [] : student.data?.standardComparison ?? [];
        return {
          reportKey: type === "batch" ? "batch_attendance" : "standard_attendance",
          title: type === "batch" ? "Batch Attendance Report" : "Standard Attendance Report",
          columns: [
            { header: type === "batch" ? "Batch" : "Standard", value: (r) => r.name },
            { header: "Present", value: (r) => r.present, align: "right" },
            { header: "Absent", value: (r) => r.absent, align: "right" },
            { header: "Late", value: (r) => r.late, align: "right" },
            { header: "Total", value: (r) => r.total, align: "right" },
            { header: "Attendance %", value: (r) => r.attendancePct, align: "right" },
          ],
          rows,
        };
      }
      case "work_hours":
        return {
          reportKey: "work_hours_report",
          title: "Work Hours Report",
          columns: [
            { header: "Staff", value: (r) => r.staffName },
            { header: "Role", value: (r) => r.role ?? "" },
            { header: "Days", value: (r) => r.days, align: "right" },
            { header: "Avg/day (min)", value: (r) => r.avgWorkedMinutes, align: "right" },
            { header: "Overtime (min)", value: (r) => r.overtimeMinutes, align: "right" },
            { header: "Attendance %", value: (r) => r.attendancePct, align: "right" },
          ],
          rows: staff.data?.performance ?? [],
        };
      case "late":
        return {
          reportKey: "late_arrival_report",
          title: "Late Arrival Report",
          columns: [
            { header: "Staff", value: (r) => r.staffName },
            { header: "Role", value: (r) => r.role ?? "" },
            { header: "Late count", value: (r) => r.lateCount, align: "right" },
            { header: "Attendance %", value: (r) => r.attendancePct, align: "right" },
          ],
          rows: (staff.data?.performance ?? []).filter((p) => p.lateCount > 0).sort((a, b) => b.lateCount - a.lateCount),
        };
      case "audit":
      default:
        return {
          reportKey: "attendance_audit_report",
          title: "Attendance Audit Report",
          columns: [
            { header: "Date", value: (r) => formatDate(r.date) },
            { header: "Change", value: (r) => (r.oldStatus ? `${r.oldStatus} → ${r.newStatus}` : r.newStatus) },
            { header: "Type", value: (r) => r.changeType },
            { header: "Changed by", value: (r) => r.changedByName ?? "" },
            { header: "Role", value: (r) => r.changedByRole ?? "" },
            { header: "At", value: (r) => `${formatDate(r.date)} ${formatClock(r.changedAt)}` },
          ],
          rows: audit.data ?? [],
        };
    }
  }, [type, filters, student.data, staff.data, audit.data]);

  return (
    <AttendancePageShell
      title="Attendance Reports"
      description="Dynamic attendance reports built from live data — export any to CSV, Excel or PDF."
      icon={<FileBarChart className="w-5 h-5" />}
      headerExtra={
        <ExportMenu
          disabled={report.rows.length === 0}
          build={() => ({ reportKey: report.reportKey, title: report.title, subtitle: `${filters.from} → ${filters.to}`, columns: report.columns, rows: report.rows })}
        />
      }
      toolbar={
        <>
          <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
            <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <AnalyticsFilters value={filters} onChange={setFilters} />
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="glass-card p-0 overflow-x-auto">
          <h3 className="text-sm font-display font-semibold p-4 pb-2">{report.title}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                {report.columns.map((c) => (
                  <TableHead key={c.header} className={c.align === "right" ? "text-right" : ""}>{c.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.length === 0 ? (
                <TableRow><TableCell colSpan={report.columns.length} className="text-center text-muted-foreground py-8">No data for this report.</TableCell></TableRow>
              ) : (
                report.rows.map((row, i) => (
                  <TableRow key={i}>
                    {report.columns.map((c) => (
                      <TableCell key={c.header} className={c.align === "right" ? "text-right" : ""}>{c.value(row)}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </AttendancePageShell>
  );
};

export default AttendanceReportsPage;
