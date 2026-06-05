import { useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttendancePageShell, StatTile } from "../../components";
import { MiniLineChart } from "../components";
import { useStaffAnalytics } from "../hooks/useAnalytics";
import { formatMinutes } from "../../utils/workHours";
import { daysAgo, today } from "../../utils/dates";

const WorkHoursAnalyticsPage = () => {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const { data, isLoading } = useStaffAnalytics({ from, to });
  const w = data?.workHours;

  return (
    <AttendancePageShell
      title="Work Hours Analytics"
      description="Expected vs worked hours, remaining, overtime and trends across all staff."
      icon={<Clock className="w-5 h-5" />}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Expected" value={formatMinutes(w?.expectedMinutes ?? 0)} />
            <StatTile label="Worked" value={formatMinutes(w?.workedMinutes ?? 0)} tone="positive" />
            <StatTile label="Remaining" value={formatMinutes(w?.remainingMinutes ?? 0)} tone="warning" />
            <StatTile label="Overtime" value={formatMinutes(w?.overtimeMinutes ?? 0)} tone="accent" />
          </div>

          <div className="glass-card p-4">
            <h3 className="text-sm font-display font-semibold mb-3">Overtime hours (monthly)</h3>
            <MiniLineChart data={data?.overtimeTrend ?? []} suffix="h" height={200} />
          </div>

          <div className="glass-card p-0 overflow-x-auto">
            <h3 className="text-sm font-display font-semibold p-4 pb-2">Hours per staff</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Avg/day</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                  <TableHead className="text-right">Attendance %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.performance ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No staff attendance in this range.</TableCell></TableRow>
                ) : (
                  data!.performance.map((p) => (
                    <TableRow key={p.staffId}>
                      <TableCell>{p.staffName}</TableCell>
                      <TableCell className="text-right">{p.days}</TableCell>
                      <TableCell className="text-right">{formatMinutes(p.avgWorkedMinutes)}</TableCell>
                      <TableCell className="text-right text-sky-600">{p.overtimeMinutes ? formatMinutes(p.overtimeMinutes) : "—"}</TableCell>
                      <TableCell className="text-right">{p.attendancePct}%</TableCell>
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

export default WorkHoursAnalyticsPage;
