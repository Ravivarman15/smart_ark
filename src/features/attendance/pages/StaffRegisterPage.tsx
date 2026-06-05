import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { AttendancePageShell, ExportMenu } from "../components";
import { useStaffOptions } from "../hooks/useAttendanceLookups";
import { useStaffRange } from "../hooks/useStaffAttendance";
import { STAFF_STATUS_META } from "../utils/statusMeta";
import { formatMinutes } from "../utils/workHours";
import { daysAgo, formatClock, formatDate, today } from "../utils/dates";
import type { ExportColumn } from "../utils/exportData";
import type { StaffAttendanceRecord } from "../types/attendance.types";

const EXPORT_COLS: ExportColumn<StaffAttendanceRecord>[] = [
  { header: "Staff", value: (r) => r.staffName ?? "" },
  { header: "Date", value: (r) => r.date },
  { header: "Status", value: (r) => r.status },
  { header: "In", value: (r) => formatClock(r.inTime) },
  { header: "Out", value: (r) => formatClock(r.outTime) },
  { header: "Worked (min)", value: (r) => r.workedMinutes, align: "right" },
  { header: "Overtime (min)", value: (r) => r.overtimeMinutes, align: "right" },
  { header: "Source", value: (r) => r.source },
];

const ALL = "__all__";

const StaffRegisterPage = () => {
  const { data: staff = [] } = useStaffOptions();
  const [staffId, setStaffId] = useState(ALL);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const { data: rows = [], isLoading } = useStaffRange(from, to, staffId === ALL ? undefined : staffId);

  return (
    <AttendancePageShell
      title="Staff Attendance Register"
      description="Browse staff attendance and work hours over any date range."
      icon={<BookOpen className="w-5 h-5" />}
      headerExtra={
        <ExportMenu
          disabled={rows.length === 0}
          build={() => ({
            reportKey: "staff_attendance_register",
            title: "Staff Attendance Register",
            subtitle: `${from} → ${to}`,
            columns: EXPORT_COLS,
            rows,
          })}
        />
      }
      toolbar={
        <>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger className="h-8 w-52"><SelectValue placeholder="All staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All staff</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name} · {s.role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="glass-card p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead className="text-right">Worked</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No records in this range.</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.staffName ?? "Staff"}</TableCell>
                    <TableCell>{formatDate(r.date)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${STAFF_STATUS_META[r.status].className}`}>
                        {STAFF_STATUS_META[r.status].label}
                      </span>
                    </TableCell>
                    <TableCell>{formatClock(r.inTime) || "—"}</TableCell>
                    <TableCell>{formatClock(r.outTime) || "—"}</TableCell>
                    <TableCell className="text-right">{formatMinutes(r.workedMinutes)}</TableCell>
                    <TableCell className="capitalize text-xs text-muted-foreground">{r.source}</TableCell>
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

export default StaffRegisterPage;
