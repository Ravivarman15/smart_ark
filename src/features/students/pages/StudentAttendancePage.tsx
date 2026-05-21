import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CheckCheck, Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, StatTile, StudentPageShell } from "../components";
import {
  useAbsentList,
  useAttendanceDay,
  useBatchAttendanceAnalytics,
  useSaveAttendance,
} from "../hooks/useStudentAttendance";
import { useBatchOptions } from "../hooks/useStudentLookups";
import { ATTENDANCE_META, ATTENDANCE_STATUSES } from "../utils/constants";
import { formatDate } from "../utils/helpers";
import type { AttendanceDraftRow, AttendanceStatus } from "../types/student.types";

const today = () => new Date().toISOString().split("T")[0];
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};

const StudentAttendancePage = () => {
  const { data: batches = [] } = useBatchOptions();
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(today());

  // ── daily marking ──────────────────────────────────────────────────────────
  const { data: serverRows, isLoading } = useAttendanceDay(batchId || undefined, date);
  const [rows, setRows] = useState<AttendanceDraftRow[]>([]);
  useEffect(() => {
    if (serverRows) setRows(serverRows);
  }, [serverRows]);
  const saveMut = useSaveAttendance();

  const setStatus = (studentId: string, status: AttendanceStatus) =>
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
  const markAll = (status: AttendanceStatus) =>
    setRows((prev) => prev.map((r) => ({ ...r, status })));

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    rows.forEach((r) => (c[r.status] += 1));
    return c;
  }, [rows]);

  // ── analytics ──────────────────────────────────────────────────────────────
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const { data: analytics } = useBatchAttendanceAnalytics(batchId || undefined, from, to);
  const { data: absentees = [] } = useAbsentList(date);

  return (
    <StudentPageShell
      title="Student Attendance"
      description="Mark daily attendance per batch and review attendance analytics. Capture-method ready for biometric / QR / mobile sources."
      icon={<CalendarCheck className="w-5 h-5" />}
      toolbar={
        <>
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger className="h-8 w-56">
              <SelectValue placeholder="Select a batch" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-40"
          />
        </>
      }
    >
      {!batchId ? (
        <div className="glass-card">
          <EmptyState
            icon={<CalendarCheck className="w-5 h-5" />}
            title="Select a batch"
            description="Choose a batch above to mark or review attendance."
          />
        </div>
      ) : (
        <Tabs defaultValue="daily">
          <TabsList>
            <TabsTrigger value="daily">Daily marking</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Daily marking */}
          <TabsContent value="daily" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Present" value={counts.present} tone="positive" />
              <StatTile label="Absent" value={counts.absent} tone="danger" />
              <StatTile label="Late" value={counts.late} tone="warning" />
              <StatTile label="Excused" value={counts.excused} tone="accent" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => markAll("present")}
                disabled={rows.length === 0}
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
                Mark all present
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => saveMut.mutate({ batchId, date, rows })}
                disabled={rows.length === 0 || saveMut.isPending}
              >
                {saveMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save attendance
              </Button>
            </div>

            <div className="glass-card p-0 overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={<CalendarCheck className="w-5 h-5" />}
                  title="No students in this batch"
                  description="Assign students to the batch to mark their attendance."
                />
              ) : (
                <ul className="divide-y divide-border/30">
                  {rows.map((r, i) => (
                    <li
                      key={r.studentId}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="text-sm">
                        <span className="text-muted-foreground mr-2">{i + 1}.</span>
                        {r.studentName}
                      </span>
                      <div className="flex gap-1">
                        {ATTENDANCE_STATUSES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(r.studentId, s)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ${
                              r.status === s
                                ? ATTENDANCE_META[s].className
                                : "bg-muted/50 text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {ATTENDANCE_META[s].label}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Range</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-40"
              />
              <span className="text-muted-foreground">→</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-40"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile
                label="Avg. present"
                value={`${analytics?.summary.presentPct ?? 0}%`}
                tone="positive"
              />
              <StatTile label="Present marks" value={analytics?.summary.present ?? 0} />
              <StatTile label="Absent marks" value={analytics?.summary.absent ?? 0} tone="danger" />
              <StatTile label="Late marks" value={analytics?.summary.late ?? 0} tone="warning" />
            </div>

            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-3">Daily present %</h3>
              {!analytics || analytics.trend.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No attendance recorded in this range.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {analytics.trend.map((t) => (
                    <div key={t.date} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-20 shrink-0">
                        {formatDate(t.date)}
                      </span>
                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${t.presentPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium w-9 text-right">
                        {t.presentPct}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-2 flex items-center gap-1.5">
                <UserX className="w-4 h-4 text-red-500" />
                Absent / late on {formatDate(date)}
              </h3>
              {absentees.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No absentees recorded for this date.
                </p>
              ) : (
                <ul className="divide-y divide-border/30">
                  {absentees.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                      <span>{a.studentName ?? "Student"}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          ATTENDANCE_META[a.status].className
                        }`}
                      >
                        {ATTENDANCE_META[a.status].label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </StudentPageShell>
  );
};

export default StudentAttendancePage;
