import { useMemo } from "react";
import { ClipboardCheck } from "lucide-react";
import {
  BarChart,
  DataReportTable,
  Heatmap,
  PercentageIndicator,
  PresetPicker,
  ReportChartCard,
  ReportFiltersBar,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
  TrendChart,
} from "../components";
import {
  useStudentAttendanceRows,
  useStudentsBasic,
} from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import {
  bucketBy,
  formatDate,
  groupMonthly,
  percent,
} from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

interface Row {
  studentId: string;
  studentName: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  pct: number;
  /** Most-recent marker metadata across all marks for this student in range. */
  latestMarkedByName?: string;
  latestMarkedByRole?: string;
  latestMarkedAt?: string;
  latestMethod?: string;
  /** All marks for this student in range — drives the detail expansion. */
  history: {
    date: string;
    status: string;
    markedByName?: string;
    markedByRole?: string;
    markedAt?: string;
    method?: string;
    lastUpdatedAt?: string;
  }[];
}

const StudentAttendanceReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "student_attendance",
    title: "Student Attendance Report",
    defaultWindowMonths: 3,
  });
  const { data: students = [] } = useStudentsBasic();
  const { data, isLoading } = useStudentAttendanceRows(page.filters);
  const att = data?.rows ?? [];

  const sName = new Map(students.map((s) => [s.id, s.name]));

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const a of att) {
      if (!a.studentId) continue;
      const e =
        map.get(a.studentId) ?? {
          studentId: a.studentId,
          studentName: sName.get(a.studentId) ?? "Student",
          present: 0,
          absent: 0,
          late: 0,
          total: 0,
          pct: 0,
          history: [],
        };
      e.total += 1;
      if (a.status === "present") e.present += 1;
      else if (a.status === "absent") e.absent += 1;
      else if (a.status === "late") e.late += 1;
      e.pct = percent(e.present + e.late, e.total);
      e.history.push({
        date: a.date,
        status: a.status,
        markedByName: a.markedByName,
        markedByRole: a.markedByRole,
        markedAt: a.markedAt,
        method: a.method,
        lastUpdatedAt: a.lastUpdatedAt,
      });
      // Track the latest mark by markedAt timestamp (falls back to date).
      const stamp = a.markedAt ?? a.date;
      if (!e.latestMarkedAt || stamp > e.latestMarkedAt) {
        e.latestMarkedAt = stamp;
        e.latestMarkedByName = a.markedByName;
        e.latestMarkedByRole = a.markedByRole;
        e.latestMethod = a.method;
      }
      map.set(a.studentId, e);
    }
    // Sort each student's history newest-first for the detail panel.
    for (const r of map.values()) {
      r.history.sort((a, b) => (b.markedAt ?? b.date).localeCompare(a.markedAt ?? a.date));
    }
    return Array.from(map.values()).sort((a, b) => a.pct - b.pct);
  }, [att, sName]);

  const cols: ExportColumn<Row>[] = [
    { header: "Student", value: (r) => r.studentName },
    { header: "Present", value: (r) => r.present, align: "right" },
    { header: "Late", value: (r) => r.late, align: "right" },
    { header: "Absent", value: (r) => r.absent, align: "right" },
    { header: "Total", value: (r) => r.total, align: "right" },
    { header: "Attendance %", value: (r) => r.pct, align: "right" },
    { header: "Last marked by", value: (r) => r.latestMarkedByName ?? "—" },
    { header: "Last marked at", value: (r) => r.latestMarkedAt ? formatDate(r.latestMarkedAt) : "—" },
    { header: "Method", value: (r) => r.latestMethod ?? "—" },
  ];

  const totalPresent = rows.reduce((s, r) => s + r.present, 0);
  const totalAbsent = rows.reduce((s, r) => s + r.absent, 0);
  const totalLate = rows.reduce((s, r) => s + r.late, 0);
  const totalAll = totalPresent + totalAbsent + totalLate;
  const overallPct = percent(totalPresent + totalLate, totalAll);
  const trend = groupMonthly(att, (a) => a.date, (a) => (a.status === "present" || a.status === "late" ? 1 : 0));

  const heat = useMemo(() => {
    const months = Array.from(new Set(att.map((a) => a.date.slice(0, 7)))).sort();
    const statuses = ["present", "late", "absent"];
    const cells = months.flatMap((m) =>
      statuses.map((s) => ({
        row: s,
        col: m,
        value: att.filter((a) => a.date.startsWith(m) && a.status === s).length,
      })),
    );
    return { cells, rows: statuses, cols: months };
  }, [att]);

  const kpis = [
    { key: "pct", label: "Overall attendance", value: `${overallPct}%`, tone: "info" as const },
    { key: "p", label: "Present", value: totalPresent, tone: "positive" as const },
    { key: "l", label: "Late", value: totalLate, tone: "warning" as const },
    { key: "a", label: "Absent", value: totalAbsent, tone: "negative" as const },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Percentage, late-entry trends, batch comparisons and absentee heatmap."
      icon={<ClipboardCheck className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Attendance trend">
          <TrendChart data={trend} color="#22c55e" />
        </ReportChartCard>
        <ReportChartCard title="Lowest attendance">
          <BarChart
            data={rows.slice(0, 8).map((r) => ({ label: r.studentName, value: r.pct }))}
            color="#ef4444"
          />
        </ReportChartCard>
        <ReportChartCard title="Status heatmap (monthly)">
          <Heatmap cells={heat.cells} rows={heat.rows} cols={heat.cols} />
        </ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["dateRange", "batch", "search"]}
        />
        <DataReportTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.studentId}
          loading={isLoading}
          renderDetail={(r) => (
            <div className="p-2 space-y-3">
              <PercentageIndicator label="Attendance" value={r.pct} tone={r.pct >= 75 ? "positive" : "negative"} />
              {/* Marker audit panel — chronological list of every mark for
                  this student in the selected range with the operator who
                  recorded it. Empty when the migration hasn't surfaced
                  marker columns yet. */}
              {r.history.length > 0 && (
                <div className="rounded-md border border-border/60 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Marked by</th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Role</th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Method</th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Marked at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.history.slice(0, 30).map((h, i) => (
                        <tr key={i} className="border-t border-border/40">
                          <td className="px-2 py-1.5">{formatDate(h.date)}</td>
                          <td className="px-2 py-1.5 capitalize">{h.status}</td>
                          <td className="px-2 py-1.5">{h.markedByName ?? "—"}</td>
                          <td className="px-2 py-1.5 capitalize">{h.markedByRole ?? "—"}</td>
                          <td className="px-2 py-1.5 capitalize">{h.method ?? "—"}</td>
                          <td className="px-2 py-1.5">{h.markedAt ? formatDate(h.markedAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        />
      </div>
    </ReportPageShell>
  );
};

export default StudentAttendanceReportPage;
