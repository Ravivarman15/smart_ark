import { useMemo, useState } from "react";
import { Award, BarChart3, CalendarDays, Loader2, TrendingUp, Users } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttendancePageShell, ExportMenu, StatTile } from "../../components";
import {
  AnalyticsFilters,
  AttendanceHeatmap,
  DefaulterTable,
  Leaderboard,
  MiniBarChart,
  MiniLineChart,
} from "../components";
import { useStudentAnalytics } from "../hooks/useAnalytics";
import { daysAgo, today } from "../../utils/dates";
import type { ExportColumn } from "../../utils/exportData";
import type { DefaulterRow, StudentAnalyticsFilters } from "../types/analytics.types";

const DEFAULTER_COLS: ExportColumn<DefaulterRow>[] = [
  { header: "Roll", value: (r) => r.rollNumber ?? "" },
  { header: "Student", value: (r) => r.studentName },
  { header: "Standard", value: (r) => r.standardName ?? "" },
  { header: "Batch", value: (r) => r.batchName ?? "" },
  { header: "Attendance %", value: (r) => r.attendancePct, align: "right" },
  { header: "Days Missed", value: (r) => r.daysMissed, align: "right" },
  { header: "Consec. Absent", value: (r) => r.consecutiveAbsence, align: "right" },
  { header: "Risk", value: (r) => r.riskLevel },
];

const StudentAnalyticsPage = () => {
  const [filters, setFilters] = useState<StudentAnalyticsFilters>({ from: daysAgo(29), to: today() });
  const { data, isLoading } = useStudentAnalytics(filters);
  const [threshold, setThreshold] = useState("75");

  const defaulters = useMemo(
    () => (data?.defaulters ?? []).filter((d) => d.attendancePct < Number(threshold)),
    [data?.defaulters, threshold],
  );

  const k = data?.kpis;

  return (
    <AttendancePageShell
      title="Student Analytics"
      description="Live attendance insights — trends, defaulters, comparisons and a monthly heatmap."
      icon={<BarChart3 className="w-5 h-5" />}
      headerExtra={
        <ExportMenu
          disabled={defaulters.length === 0}
          build={() => ({
            reportKey: "student_defaulters",
            title: "Student Defaulter Report",
            subtitle: `${filters.from} → ${filters.to} · below ${threshold}%`,
            columns: DEFAULTER_COLS,
            rows: defaulters,
          })}
        />
      }
      toolbar={<AnalyticsFilters value={filters} onChange={setFilters} />}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatTile label="Total Students" value={k?.totalStudents ?? 0} icon={<Users className="w-4 h-4" />} />
            <StatTile label="Present Today" value={k?.presentToday ?? 0} tone="positive" />
            <StatTile label="Absent Today" value={k?.absentToday ?? 0} tone="danger" />
            <StatTile label="Late Today" value={k?.lateToday ?? 0} tone="warning" />
            <StatTile label="Medical" value={k?.medicalToday ?? 0} />
            <StatTile label="Excused" value={k?.excusedToday ?? 0} />
            <StatTile label="Range %" value={`${k?.rangePct ?? 0}%`} tone="accent" />
            <StatTile label="Month %" value={`${k?.monthPct ?? 0}%`} tone="positive" />
            <StatTile label="Year %" value={`${k?.yearPct ?? 0}%`} tone="positive" />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Daily attendance %</h3>
              <MiniLineChart data={data?.dailyTrend ?? []} suffix="%" />
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> Monthly trend</h3>
              <MiniBarChart data={data?.monthlyTrend ?? []} suffix="%" color="#22c55e" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(data?.consecutiveBuckets ?? []).map((b) => (
              <StatTile key={b.threshold} label={`${b.threshold}+ days absent`} value={b.count} tone={b.count > 0 ? "danger" : "neutral"} />
            ))}
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-display font-semibold">Defaulter analysis</h3>
              <Select value={threshold} onValueChange={setThreshold}>
                <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="75">Below 75%</SelectItem>
                  <SelectItem value="60">Below 60%</SelectItem>
                  <SelectItem value="50">Below 50%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DefaulterTable rows={defaulters} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Leaderboard
              title="Top attendance"
              icon={<Award className="w-4 h-4" />}
              rows={(data?.topAttendance ?? []).map((e) => ({ id: e.studentId, name: e.studentName, sub: e.batchName, value: e.attendancePct }))}
              suffix="%"
            />
            <Leaderboard
              title="Most improved"
              icon={<TrendingUp className="w-4 h-4" />}
              rows={(data?.mostImproved ?? []).map((e) => ({ id: e.studentId, name: e.studentName, sub: e.batchName, value: e.attendancePct, delta: e.delta }))}
              suffix="%"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-3">Batch comparison</h3>
              <MiniBarChart data={(data?.batchComparison ?? []).map((g) => ({ label: g.name, value: g.attendancePct }))} suffix="%" />
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-3">Standard comparison</h3>
              <MiniBarChart data={(data?.standardComparison ?? []).map((g) => ({ label: g.name, value: g.attendancePct }))} suffix="%" color="#a855f7" />
            </div>
          </div>

          <div className="glass-card p-4">
            <h3 className="text-sm font-display font-semibold mb-3">Attendance heatmap</h3>
            <AttendanceHeatmap cells={data?.heatmap ?? []} />
          </div>
        </div>
      )}
    </AttendancePageShell>
  );
};

export default StudentAnalyticsPage;
