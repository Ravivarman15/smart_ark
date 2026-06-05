import { useMemo, useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttendancePageShell, AttendanceFilters, EmptyState, ExportMenu } from "../components";
import { useStudentRegister } from "../hooks/useStudentAttendance";
import { STUDENT_STATUS_META } from "../utils/statusMeta";
import { daysAgo, formatDate, today } from "../utils/dates";
import type { ExportColumn } from "../utils/exportData";
import type { StudentAttendanceRow, StudentAttendanceStatus } from "../types/attendance.types";

const EXPORT_COLS: ExportColumn<StudentAttendanceRow>[] = [
  { header: "Roll", value: (r) => r.rollNumber ?? "" },
  { header: "Student", value: (r) => r.studentName ?? "" },
  { header: "Date", value: (r) => r.date },
  { header: "Status", value: (r) => r.status },
  { header: "Source", value: (r) => r.source ?? "manual" },
  { header: "Marked By", value: (r) => r.markedByName ?? "" },
];

const StatusChip = ({ status }: { status: StudentAttendanceStatus }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STUDENT_STATUS_META[status].className}`}>
    {STUDENT_STATUS_META[status].label}
  </span>
);

const StudentRegisterPage = () => {
  const [batchId, setBatchId] = useState("");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const { data: rows = [], isLoading } = useStudentRegister({
    batchId: batchId || undefined,
    from,
    to,
    enabled: !!batchId,
  });

  // Daily grouping → counts per date.
  const daily = useMemo(() => {
    const map = new Map<string, { date: string; present: number; absent: number; other: number; total: number }>();
    for (const r of rows) {
      const d = map.get(r.date) ?? { date: r.date, present: 0, absent: 0, other: 0, total: 0 };
      if (r.status === "present") d.present += 1;
      else if (r.status === "absent") d.absent += 1;
      else d.other += 1;
      d.total += 1;
      map.set(r.date, d);
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [rows]);

  // Monthly pivot → per-student totals.
  const byStudent = useMemo(() => {
    const map = new Map<string, { name: string; roll?: string; present: number; total: number }>();
    for (const r of rows) {
      const key = r.studentId;
      const e = map.get(key) ?? { name: r.studentName ?? "Student", roll: r.rollNumber, present: 0, total: 0 };
      if (r.status === "present" || r.status === "late" || r.status === "half_day") e.present += 1;
      e.total += 1;
      map.set(key, e);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  return (
    <AttendancePageShell
      title="Student Attendance Register"
      description="Browse marked attendance like a physical register — daily, monthly and full views."
      icon={<BookOpen className="w-5 h-5" />}
      headerExtra={
        <ExportMenu
          disabled={!batchId || rows.length === 0}
          build={() => ({
            reportKey: "student_attendance_register",
            title: "Student Attendance Register",
            subtitle: `${from} → ${to}`,
            columns: EXPORT_COLS,
            rows,
          })}
        />
      }
      toolbar={
        <>
          <AttendanceFilters batchId={batchId} onBatchChange={setBatchId} showDate={false} />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
        </>
      }
    >
      {!batchId ? (
        <div className="glass-card">
          <EmptyState icon={<BookOpen className="w-5 h-5" />} title="Select a batch" description="Choose a batch and a date range to view the register." />
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <Tabs defaultValue="register">
          <TabsList>
            <TabsTrigger value="register">Register</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>

          <TabsContent value="register" className="mt-4">
            <div className="glass-card p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Roll</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Marked by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No records in this range.</TableCell></TableRow>
                  ) : (
                    rows.map((r: StudentAttendanceRow) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.rollNumber ?? "—"}</TableCell>
                        <TableCell>{r.studentName ?? "—"}</TableCell>
                        <TableCell>{formatDate(r.date)}</TableCell>
                        <TableCell><StatusChip status={r.status} /></TableCell>
                        <TableCell className="capitalize text-xs text-muted-foreground">{r.source ?? "manual"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.markedByName ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="daily" className="mt-4">
            <div className="glass-card p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                    <TableHead className="text-right">Present %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daily.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell>{formatDate(d.date)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{d.present}</TableCell>
                      <TableCell className="text-right text-red-600">{d.absent}</TableCell>
                      <TableCell className="text-right">{d.other}</TableCell>
                      <TableCell className="text-right font-medium">{d.total ? Math.round((d.present / d.total) * 100) : 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="mt-4">
            <div className="glass-card p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Roll</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="text-right">Attendance %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byStudent.map((e) => {
                    const pct = e.total ? Math.round((e.present / e.total) * 100) : 0;
                    return (
                      <TableRow key={`${e.roll}-${e.name}`}>
                        <TableCell>{e.roll ?? "—"}</TableCell>
                        <TableCell>{e.name}</TableCell>
                        <TableCell className="text-right">{e.total}</TableCell>
                        <TableCell className="text-right">{e.present}</TableCell>
                        <TableCell className={`text-right font-medium ${pct < 75 ? "text-red-600" : "text-emerald-600"}`}>{pct}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </AttendancePageShell>
  );
};

export default StudentRegisterPage;
