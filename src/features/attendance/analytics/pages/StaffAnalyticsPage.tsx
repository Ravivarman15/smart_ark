import { useState } from "react";
import { Award, Clock, Gauge, Loader2, TrendingUp, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttendancePageShell, ExportMenu, StatTile } from "../../components";
import { Leaderboard, MiniBarChart, MiniLineChart } from "../components";
import { useStaffAnalytics } from "../hooks/useAnalytics";
import { formatMinutes } from "../../utils/workHours";
import { daysAgo, today } from "../../utils/dates";
import type { ExportColumn } from "../../utils/exportData";
import type { StaffPerfRow } from "../types/analytics.types";

const PERF_COLS: ExportColumn<StaffPerfRow>[] = [
  { header: "Staff", value: (r) => r.staffName },
  { header: "Role", value: (r) => r.role ?? "" },
  { header: "Attendance %", value: (r) => r.attendancePct, align: "right" },
  { header: "Late", value: (r) => r.lateCount, align: "right" },
  { header: "Early/Short Exits", value: (r) => r.earlyExitCount, align: "right" },
  { header: "Overtime (min)", value: (r) => r.overtimeMinutes, align: "right" },
  { header: "Avg/day (min)", value: (r) => r.avgWorkedMinutes, align: "right" },
  { header: "Days", value: (r) => r.days, align: "right" },
];

const StaffAnalyticsPage = () => {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const { data, isLoading } = useStaffAnalytics({ from, to });
  const k = data?.kpis;

  return (
    <AttendancePageShell
      title="Staff Analytics"
      description="Staff attendance, work hours, punctuality and performance — from live data."
      icon={<Gauge className="w-5 h-5" />}
      headerExtra={
        <ExportMenu
          disabled={(data?.performance ?? []).length === 0}
          build={() => ({
            reportKey: "staff_performance",
            title: "Staff Performance Report",
            subtitle: `${from} → ${to}`,
            columns: PERF_COLS,
            rows: data?.performance ?? [],
          })}
        />
      }
      toolbar={
        <>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatTile label="Total Staff" value={k?.totalStaff ?? 0} icon={<Users className="w-4 h-4" />} />
            <StatTile label="Present Today" value={k?.presentToday ?? 0} tone="positive" />
            <StatTile label="Absent Today" value={k?.absentToday ?? 0} tone="danger" />
            <StatTile label="Late Today" value={k?.lateToday ?? 0} tone="warning" />
            <StatTile label="Avg Hours" value={formatMinutes(k?.avgWorkedMinutes ?? 0)} />
            <StatTile label="Attendance" value={`${k?.attendancePct ?? 0}%`} tone="positive" />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Late arrivals (monthly)</h3>
              <MiniBarChart data={data?.lateTrend ?? []} color="#f59e0b" />
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Overtime hours (monthly)</h3>
              <MiniLineChart data={data?.overtimeTrend ?? []} suffix="h" color="#0ea5e9" />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            <Leaderboard title="Best attendance" icon={<Award className="w-4 h-4" />} suffix="%" rows={(data?.bestAttendance ?? []).map((e) => ({ id: e.staffId, name: e.staffName, value: e.value }))} />
            <Leaderboard title="Most punctual" suffix=" late" rows={(data?.mostPunctual ?? []).map((e) => ({ id: e.staffId, name: e.staffName, value: e.value }))} />
            <Leaderboard title="Highest hours" suffix="h" rows={(data?.highestHours ?? []).map((e) => ({ id: e.staffId, name: e.staffName, value: Math.round(e.value / 60) }))} />
            <Leaderboard title="Most improved" suffix="%" rows={(data?.mostImproved ?? []).map((e) => ({ id: e.staffId, name: e.staffName, value: e.value, delta: e.value }))} />
          </div>

          <div className="glass-card p-0 overflow-x-auto">
            <h3 className="text-sm font-display font-semibold p-4 pb-2">Performance metrics</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Attendance %</TableHead>
                  <TableHead className="text-right">Late</TableHead>
                  <TableHead className="text-right">Early/short exits</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                  <TableHead className="text-right">Avg/day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.performance ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No staff attendance in this range.</TableCell></TableRow>
                ) : (
                  data!.performance.map((p) => (
                    <TableRow key={p.staffId}>
                      <TableCell>{p.staffName}</TableCell>
                      <TableCell className="capitalize">{p.role ?? "—"}</TableCell>
                      <TableCell className={`text-right font-medium ${p.attendancePct < 80 ? "text-red-600" : "text-emerald-600"}`}>{p.attendancePct}%</TableCell>
                      <TableCell className="text-right">{p.lateCount}</TableCell>
                      <TableCell className="text-right">{p.earlyExitCount}</TableCell>
                      <TableCell className="text-right text-sky-600">{p.overtimeMinutes ? formatMinutes(p.overtimeMinutes) : "—"}</TableCell>
                      <TableCell className="text-right">{formatMinutes(p.avgWorkedMinutes)}</TableCell>
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

export default StaffAnalyticsPage;
