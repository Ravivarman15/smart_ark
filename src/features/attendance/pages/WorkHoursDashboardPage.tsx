import { useMemo, useState } from "react";
import { Gauge, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { AttendancePageShell, EmptyState, ExportMenu, StatTile } from "../components";
import { useStaffOptions } from "../hooks/useAttendanceLookups";
import { useStaffAttendanceDay, useStaffMemberRange } from "../hooks/useStaffAttendance";
import { aggregateWorkHours, formatMinutes } from "../utils/workHours";
import { daysAgo, today } from "../utils/dates";
import type { ExportColumn } from "../utils/exportData";
import type { StaffAttendanceRecord } from "../types/attendance.types";

const DAY_EXPORT_COLS: ExportColumn<StaffAttendanceRecord>[] = [
  { header: "Staff", value: (r) => r.staffName ?? "" },
  { header: "Worked (min)", value: (r) => r.workedMinutes, align: "right" },
  { header: "Expected (min)", value: (r) => r.expectedMinutes, align: "right" },
  { header: "Overtime (min)", value: (r) => r.overtimeMinutes, align: "right" },
  { header: "Late (min)", value: (r) => r.lateMinutes, align: "right" },
  { header: "Attendance %", value: (r) => (r.expectedMinutes ? Math.round(Math.min(r.workedMinutes / r.expectedMinutes, 1) * 100) : 0), align: "right" },
];

const WorkHoursDashboardPage = () => {
  const [date, setDate] = useState(today());
  const { data: dayRecords = [], isLoading } = useStaffAttendanceDay(date);

  const { data: staff = [] } = useStaffOptions();
  const [staffId, setStaffId] = useState("");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const { data: memberRecords = [] } = useStaffMemberRange(staffId || undefined, from, to);
  const agg = useMemo(() => aggregateWorkHours(memberRecords), [memberRecords]);

  return (
    <AttendancePageShell
      title="Work Hours Dashboard"
      description="Worked, remaining, overtime, attendance % and late counts per staff member."
      icon={<Gauge className="w-5 h-5" />}
      headerExtra={
        <ExportMenu
          disabled={dayRecords.length === 0}
          build={() => ({
            reportKey: "work_hours",
            title: "Work Hours",
            subtitle: date,
            columns: DAY_EXPORT_COLS,
            rows: dayRecords,
          })}
        />
      }
    >
      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">All Staff (Day)</TabsTrigger>
          <TabsTrigger value="member">Per Staff (Range)</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4 space-y-3">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" />
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <div className="glass-card p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead className="text-right">Worked</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Overtime</TableHead>
                    <TableHead className="text-right">Late</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayRecords.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No staff attendance for this date.</TableCell></TableRow>
                  ) : (
                    dayRecords.map((r) => {
                      const pct = r.expectedMinutes ? Math.round(Math.min(r.workedMinutes / r.expectedMinutes, 1) * 100) : 0;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{r.staffName ?? "Staff"}</TableCell>
                          <TableCell className="text-right">{formatMinutes(r.workedMinutes)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatMinutes(r.expectedMinutes)}</TableCell>
                          <TableCell className="text-right text-sky-600">{r.overtimeMinutes ? formatMinutes(r.overtimeMinutes) : "—"}</TableCell>
                          <TableCell className="text-right text-red-600">{r.lateMinutes ? formatMinutes(r.lateMinutes) : "—"}</TableCell>
                          <TableCell className={`text-right font-medium ${pct < 75 ? "text-red-600" : "text-emerald-600"}`}>{pct}%</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="member" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} · {s.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
            <span className="text-muted-foreground">→</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
          </div>

          {!staffId ? (
            <div className="glass-card"><EmptyState icon={<Gauge className="w-5 h-5" />} title="Select a staff member" description="Pick a staff member and date range to see their totals." /></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatTile label="Present Days" value={`${agg.presentDays}/${agg.days}`} tone="positive" />
              <StatTile label="Worked" value={formatMinutes(agg.workedMinutes)} />
              <StatTile label="Expected" value={formatMinutes(agg.expectedMinutes)} />
              <StatTile label="Overtime" value={formatMinutes(agg.overtimeMinutes)} tone="accent" />
              <StatTile label="Late Count" value={agg.lateCount} tone="warning" />
              <StatTile label="Attendance" value={`${agg.attendancePct}%`} tone={agg.attendancePct >= 75 ? "positive" : "danger"} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AttendancePageShell>
  );
};

export default WorkHoursDashboardPage;
