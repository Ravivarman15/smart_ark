// ──────────────────────────────────────────────────────────────────────────────
// Attendance History
//
// Unified read-only history viewer for STUDENT (`student_attendance`) and
// STAFF (`profile_attendance` / `teacher_attendance`) records. Supports:
//   • role tab — student vs staff
//   • date range
//   • batch / status filters (student tab)
//   • staff filter (staff tab)
//   • search by name
//   • CSV download of the filtered set
//
// Reuses reportAggregatorService so all the pre-migration fallbacks already
// in place keep history working against a fresh database. Backed by React
// Query so realtime invalidations (AttendanceRealtimeProvider) refresh the
// table the moment someone marks new rows in another tab.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  Download,
  GraduationCap,
  Loader2,
  Users,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentPageShell, StatTile } from "../components";
import { useBatchOptions } from "../hooks/useStudentLookups";
import { useStudents } from "../hooks/useStudents";
import { useStaff } from "@/features/staff";
import { reportAggregatorService } from "@/features/reports/services/reportAggregator.service";
import type { AttendanceStatus } from "../types/student.types";

const today = () => new Date().toISOString().split("T")[0];
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};

type Mode = "student" | "staff";

const STUDENT_STATUSES: { value: AttendanceStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
];

const STAFF_STATUSES: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "On leave" },
  { value: "half_day", label: "Half day" },
];

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

const formatTime = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const statusBadge = (status: string) => {
  const map: Record<string, { tone: string; label: string }> = {
    present:  { tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40", label: "Present" },
    absent:   { tone: "bg-rose-500/10 text-rose-700 border-rose-500/40",         label: "Absent" },
    late:     { tone: "bg-amber-500/10 text-amber-700 border-amber-500/40",      label: "Late" },
    excused:  { tone: "bg-sky-500/10 text-sky-700 border-sky-500/40",            label: "Excused" },
    leave:    { tone: "bg-sky-500/10 text-sky-700 border-sky-500/40",            label: "Leave" },
    half_day: { tone: "bg-amber-500/10 text-amber-700 border-amber-500/40",      label: "Half day" },
  };
  const tone = map[status] ?? { tone: "bg-muted text-muted-foreground border-border", label: status };
  return (
    <Badge variant="outline" className={`${tone.tone} text-[10px]`}>
      {tone.label}
    </Badge>
  );
};

const escapeCsv = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const downloadCsv = (filename: string, rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const AttendanceHistoryPage = () => {
  const [mode, setMode] = useState<Mode>("student");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [batchId, setBatchId] = useState<string>("all");
  const [staffId, setStaffId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: batches = [] } = useBatchOptions();
  // Load a wide page of students just for the id→name map used to render
  // the table. Filtering happens in the attendance query, not here.
  const { data: studentsPage } = useStudents({ pageSize: 1000, filters: { status: "all" } });
  const students = studentsPage?.rows ?? [];
  const staffQ = useStaff();
  const staffList = staffQ.data ?? [];

  // ── student attendance fetch ──────────────────────────────────────────────
  const studentQ = useQuery({
    queryKey: ["reports", "attendance-history", "student", from, to, batchId] as const,
    queryFn: () =>
      reportAggregatorService.studentAttendanceRows({
        from,
        to,
        batchId: batchId === "all" ? undefined : batchId,
      }),
    enabled: mode === "student",
    staleTime: 30_000,
  });

  // ── staff attendance fetch ────────────────────────────────────────────────
  const staffAttQ = useQuery({
    queryKey: ["reports", "attendance-history", "staff", from, to, staffId] as const,
    queryFn: () =>
      reportAggregatorService.staffAttendanceRows({
        from,
        to,
        staffId: staffId === "all" ? undefined : staffId,
      }),
    enabled: mode === "staff",
    staleTime: 30_000,
  });

  // ── student rows ──────────────────────────────────────────────────────────
  const studentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of students) m.set(s.id, s.name);
    return m;
  }, [students]);

  const batchNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of batches) m.set(b.id, b.name);
    return m;
  }, [batches]);

  const studentRows = useMemo(() => {
    const all = studentQ.data?.rows ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      const name = (r.studentId && studentNameById.get(r.studentId)) || "";
      return name.toLowerCase().includes(q);
    });
  }, [studentQ.data, status, search, studentNameById]);

  const studentSummary = useMemo(() => {
    const tally = { total: 0, present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of studentRows) {
      tally.total += 1;
      if (r.status === "present") tally.present += 1;
      else if (r.status === "absent") tally.absent += 1;
      else if (r.status === "late") tally.late += 1;
      else if (r.status === "excused") tally.excused += 1;
    }
    return tally;
  }, [studentRows]);

  // ── staff rows ────────────────────────────────────────────────────────────
  const staffNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staffList) m.set(s.id, s.name);
    return m;
  }, [staffList]);

  const staffRows = useMemo(() => {
    const all = staffAttQ.data?.rows ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      const name = r.staffName ?? (r.staffId && staffNameById.get(r.staffId)) ?? "";
      return name.toLowerCase().includes(q);
    });
  }, [staffAttQ.data, status, search, staffNameById]);

  const staffSummary = useMemo(() => {
    const tally = { total: 0, present: 0, absent: 0, leave: 0 };
    for (const r of staffRows) {
      tally.total += 1;
      if (r.status === "present") tally.present += 1;
      else if (r.status === "absent") tally.absent += 1;
      else if (r.status === "leave" || r.status === "half_day") tally.leave += 1;
    }
    return tally;
  }, [staffRows]);

  // ── exports ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    const stamp = new Date().toISOString().split("T")[0];
    if (mode === "student") {
      downloadCsv(
        `student-attendance_${from}_to_${to}_${stamp}.csv`,
        studentRows.map((r) => ({
          date: r.date,
          student_id: r.studentId ?? "",
          student_name: (r.studentId && studentNameById.get(r.studentId)) || "",
          batch: (r.batchId && batchNameById.get(r.batchId)) || "",
          status: r.status,
          method: r.method ?? "",
          marked_by: r.markedByName ?? "",
          marked_by_role: r.markedByRole ?? "",
          marked_at: r.markedAt ?? "",
        })),
      );
    } else {
      downloadCsv(
        `staff-attendance_${from}_to_${to}_${stamp}.csv`,
        staffRows.map((r) => ({
          date: r.date,
          staff_id: r.staffId ?? "",
          staff_name: r.staffName ?? "",
          status: r.status,
          check_in: r.checkIn ?? "",
          check_out: r.checkOut ?? "",
        })),
      );
    }
  };

  const loading = mode === "student" ? studentQ.isLoading : staffAttQ.isLoading;
  const empty = mode === "student" ? studentRows.length === 0 : staffRows.length === 0;

  return (
    <StudentPageShell
      title="Attendance History"
      description="Search and audit every attendance record for students and staff. Filter by date range, batch, status or person, then download the result for record-keeping."
      icon={<CalendarClock className="w-5 h-5" />}
      headerExtra={
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={empty}
          className="gap-2"
        >
          <Download className="w-4 h-4" /> Download CSV
        </Button>
      }
    >
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList>
          <TabsTrigger value="student" className="gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" /> Student
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> Staff
          </TabsTrigger>
        </TabsList>

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-2 mt-4">
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              From
            </label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              To
            </label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-40"
            />
          </div>

          {mode === "student" && (
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Batch
              </label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="All batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All batches</SelectItem>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "staff" && (
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Staff member
              </label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="All staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · <span className="capitalize">{s.role}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(mode === "student" ? STUDENT_STATUSES : STAFF_STATUSES).map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 flex-1 min-w-[12rem]">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Search by name
            </label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a name…"
              className="h-9"
            />
          </div>
        </div>

        {/* ── Student tab ─────────────────────────────────────────────── */}
        <TabsContent value="student" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              label="Records"
              value={studentSummary.total}
              icon={<CalendarClock className="w-4 h-4" />}
              tone="accent"
            />
            <StatTile
              label="Present"
              value={studentSummary.present}
              icon={<CheckCircle2 className="w-4 h-4" />}
              tone="positive"
            />
            <StatTile
              label="Absent"
              value={studentSummary.absent}
              icon={<XCircle className="w-4 h-4" />}
              tone="danger"
            />
            <StatTile
              label="Late / Excused"
              value={studentSummary.late + studentSummary.excused}
              icon={<CalendarClock className="w-4 h-4" />}
              tone="warning"
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Marked by</TableHead>
                  <TableHead>Marked at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : studentRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      No attendance rows match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  studentRows.slice(0, 500).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                      <TableCell>
                        {(r.studentId && studentNameById.get(r.studentId)) || "—"}
                      </TableCell>
                      <TableCell>
                        {(r.batchId && batchNameById.get(r.batchId)) || "—"}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="capitalize">{r.method ?? "—"}</TableCell>
                      <TableCell>
                        {r.markedByName ? (
                          <div className="flex flex-col">
                            <span>{r.markedByName}</span>
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {r.markedByRole ?? "—"}
                            </span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {r.markedAt ? formatDate(r.markedAt) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {studentRows.length > 500 && (
              <p className="text-[11px] text-muted-foreground text-center py-2">
                Showing first 500 of {studentRows.length}. Refine filters or export
                CSV for the full set.
              </p>
            )}
          </div>
        </TabsContent>

        {/* ── Staff tab ───────────────────────────────────────────────── */}
        <TabsContent value="staff" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              label="Records"
              value={staffSummary.total}
              icon={<CalendarClock className="w-4 h-4" />}
              tone="accent"
            />
            <StatTile
              label="Present"
              value={staffSummary.present}
              icon={<CheckCircle2 className="w-4 h-4" />}
              tone="positive"
            />
            <StatTile
              label="Absent"
              value={staffSummary.absent}
              icon={<XCircle className="w-4 h-4" />}
              tone="danger"
            />
            <StatTile
              label="On leave / Half-day"
              value={staffSummary.leave}
              icon={<CalendarClock className="w-4 h-4" />}
              tone="warning"
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : staffRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      No staff attendance rows match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  staffRows.slice(0, 500).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                      <TableCell>
                        {r.staffName || (r.staffId && staffNameById.get(r.staffId)) || "—"}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTime(r.checkIn)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTime(r.checkOut)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {staffRows.length > 500 && (
              <p className="text-[11px] text-muted-foreground text-center py-2">
                Showing first 500 of {staffRows.length}. Refine filters or export
                CSV for the full set.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {loading && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 text-xs text-muted-foreground bg-card/80 border border-border/60 rounded-md px-3 py-1.5 shadow">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      )}
    </StudentPageShell>
  );
};

export default AttendanceHistoryPage;
