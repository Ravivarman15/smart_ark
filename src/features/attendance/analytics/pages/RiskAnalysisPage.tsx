import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttendancePageShell, ExportMenu, StatTile } from "../../components";
import { AnalyticsFilters, RiskBadge } from "../components";
import { useRiskAnalytics } from "../hooks/useAnalytics";
import { daysAgo, today } from "../../utils/dates";
import type { ExportColumn } from "../../utils/exportData";
import type { RiskLevel, StudentRiskRow, StudentAnalyticsFilters } from "../types/analytics.types";

const RISK_COLS: ExportColumn<StudentRiskRow>[] = [
  { header: "Student", value: (r) => r.studentName },
  { header: "Batch", value: (r) => r.batchName ?? "" },
  { header: "Attendance %", value: (r) => r.attendancePct, align: "right" },
  { header: "Consec. Absent", value: (r) => r.consecutiveAbsence, align: "right" },
  { header: "Risk Score", value: (r) => r.riskScore, align: "right" },
  { header: "Risk", value: (r) => r.riskLevel },
  { header: "Reason", value: (r) => r.reason },
];

const RiskAnalysisPage = () => {
  const [filters, setFilters] = useState<StudentAnalyticsFilters>({ from: daysAgo(29), to: today() });
  const { data, isLoading } = useRiskAnalytics(filters);

  const studentCounts = useMemo(() => {
    const c: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    (data?.studentRisks ?? []).forEach((r) => (c[r.riskLevel] += 1));
    return c;
  }, [data?.studentRisks]);

  return (
    <AttendancePageShell
      title="Risk Analysis"
      description="At-risk students and staff scored from live attendance — below threshold, declining, or repeatedly absent/late."
      icon={<ShieldAlert className="w-5 h-5" />}
      headerExtra={
        <ExportMenu
          disabled={(data?.studentRisks ?? []).length === 0}
          build={() => ({
            reportKey: "attendance_risk",
            title: "Attendance Risk Report",
            subtitle: `${filters.from} → ${filters.to}`,
            columns: RISK_COLS,
            rows: data?.studentRisks ?? [],
          })}
        />
      }
      toolbar={<AnalyticsFilters value={filters} onChange={setFilters} />}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Critical" value={studentCounts.critical} tone="danger" />
            <StatTile label="High" value={studentCounts.high} tone="warning" />
            <StatTile label="Medium" value={studentCounts.medium} tone="accent" />
            <StatTile label="At-risk staff" value={data?.staffRisks.length ?? 0} tone="warning" />
          </div>

          <div className="glass-card p-0 overflow-x-auto">
            <h3 className="text-sm font-display font-semibold p-4 pb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-red-500" /> At-risk students</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Attendance %</TableHead>
                  <TableHead className="text-right">Consec. Absent</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.studentRisks ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No at-risk students in this range.</TableCell></TableRow>
                ) : (
                  data!.studentRisks.map((r) => (
                    <TableRow key={r.studentId}>
                      <TableCell>{r.studentName}</TableCell>
                      <TableCell>{r.batchName ?? "—"}</TableCell>
                      <TableCell className="text-right text-red-600 font-medium">{r.attendancePct}%</TableCell>
                      <TableCell className="text-right">{r.consecutiveAbsence || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{r.riskScore}</TableCell>
                      <TableCell><RiskBadge level={r.riskLevel} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.reason}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="glass-card p-0 overflow-x-auto">
            <h3 className="text-sm font-display font-semibold p-4 pb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" /> At-risk staff</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Attendance %</TableHead>
                  <TableHead className="text-right">Late count</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.staffRisks ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No at-risk staff in this range.</TableCell></TableRow>
                ) : (
                  data!.staffRisks.map((r) => (
                    <TableRow key={r.staffId}>
                      <TableCell>{r.staffName}</TableCell>
                      <TableCell className="capitalize">{r.role ?? "—"}</TableCell>
                      <TableCell className="text-right text-red-600 font-medium">{r.attendancePct}%</TableCell>
                      <TableCell className="text-right">{r.lateCount}</TableCell>
                      <TableCell className="text-right font-medium">{r.riskScore}</TableCell>
                      <TableCell><RiskBadge level={r.riskLevel} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.reason}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </AttendancePageShell>
  );
};

export default RiskAnalysisPage;
