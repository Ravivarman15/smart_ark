import React, { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  Search,
  Filter,
  Download,
  Printer,
  RefreshCw,
  User,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  BookOpen,
  ArrowUpDown,
  Eye,
  Building2,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/badge";
import { Card as UICard, UICardContent, UICardHeader, UICardTitle, UICardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAttendanceLookups } from "../hooks/useAttendanceLookups";
import { useStudentAttendanceLookup } from "../hooks/useStudentAttendance";
import type { StudentAttendanceRow, StudentAttendanceStatus } from "../types/attendance.types";

// ── Quick Date Range Helper ──────────────────────────────────────────────────
const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const shiftIso = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

type PresetOption = "today" | "yesterday" | "this_week" | "last_7" | "this_month" | "last_30" | "custom";

const STATUS_BADGE_STYLE: Record<StudentAttendanceStatus, { label: string; style: string }> = {
  present: { label: "Present", style: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  absent: { label: "Absent", style: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  late: { label: "Late", style: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  excused: { label: "Excused", style: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30" },
  medical_leave: { label: "Medical Leave", style: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" },
  half_day: { label: "Half Day", style: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  holiday: { label: "Holiday", style: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
};

export const StudentAttendanceLookupPage: React.FC = () => {
  const today = todayIso();
  const [preset, setPreset] = useState<PresetOption>("this_month");
  const [fromDate, setFromDate] = useState<string>(shiftIso(today, -30));
  const [toDate, setToDate] = useState<string>(today);
  const [selectedStandard, setSelectedStandard] = useState<string>("all");
  const [selectedBatch, setSelectedBatch] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  // Student Detail Modal state
  const [inspectStudent, setInspectStudent] = useState<StudentAttendanceRow | null>(null);

  // Lookups (Standards, Batches)
  const { standards = [], batches = [], isLoading: isLookupsLoading } = useAttendanceLookups();

  // Filtered batches according to selected standard
  const availableBatches = useMemo(() => {
    if (selectedStandard === "all") return batches;
    return batches.filter((b) => b.standardId === selectedStandard);
  }, [batches, selectedStandard]);

  // Handle Preset Changes
  const handlePresetChange = (p: PresetOption) => {
    setPreset(p);
    const curr = todayIso();
    switch (p) {
      case "today":
        setFromDate(curr);
        setToDate(curr);
        break;
      case "yesterday": {
        const y = shiftIso(curr, -1);
        setFromDate(y);
        setToDate(y);
        break;
      }
      case "this_week": {
        const d = new Date();
        const dow = (d.getDay() + 6) % 7; // Monday start
        const start = shiftIso(curr, -dow);
        setFromDate(start);
        setToDate(curr);
        break;
      }
      case "last_7":
        setFromDate(shiftIso(curr, -7));
        setToDate(curr);
        break;
      case "this_month": {
        const d = new Date();
        const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        setFromDate(start);
        setToDate(curr);
        break;
      }
      case "last_30":
        setFromDate(shiftIso(curr, -30));
        setToDate(curr);
        break;
      case "custom":
        break;
    }
  };

  // Fetch Attendance Lookup Data
  const {
    data: attendanceRows = [],
    isLoading: isAttendanceLoading,
    refetch,
    isRefetching,
  } = useStudentAttendanceLookup({
    from: fromDate,
    to: toDate,
    standardId: selectedStandard === "all" ? undefined : selectedStandard,
    batchId: selectedBatch === "all" ? undefined : selectedBatch,
    status: selectedStatus === "all" ? undefined : selectedStatus,
    source: selectedSource === "all" ? undefined : selectedSource,
    search: search,
  });

  // Calculate Metrics
  const metrics = useMemo(() => {
    const total = attendanceRows.length;
    const present = attendanceRows.filter((r) => r.status === "present").length;
    const absent = attendanceRows.filter((r) => r.status === "absent").length;
    const late = attendanceRows.filter((r) => r.status === "late").length;
    const excused = attendanceRows.filter(
      (r) => r.status === "excused" || r.status === "medical_leave" || r.status === "half_day"
    ).length;

    const presentPct = total > 0 ? ((present / total) * 100).toFixed(1) : "0";
    const absentPct = total > 0 ? ((absent / total) * 100).toFixed(1) : "0";

    return { total, present, absent, late, excused, presentPct, absentPct };
  }, [attendanceRows]);

  // Export to CSV
  const handleExportCSV = () => {
    if (attendanceRows.length === 0) {
      toast.info("No attendance records to export.");
      return;
    }

    const headers = [
      "Date",
      "Student Name",
      "Roll Number",
      "Status",
      "Source/Method",
      "Marked By",
      "Marked At",
      "Remarks",
    ];

    const csvRows = attendanceRows.map((r) => [
      `"${r.date}"`,
      `"${r.studentName ?? ""}"`,
      `"${r.rollNumber ?? ""}"`,
      `"${r.status}"`,
      `"${r.source ?? ""}"`,
      `"${r.markedByName ?? ""}"`,
      `"${r.markedAt ?? ""}"`,
      `"${(r.remarks ?? "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Student_Attendance_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV file downloaded successfully");
  };

  // Student specific inspection rows
  const studentInspectionRows = useMemo(() => {
    if (!inspectStudent) return [];
    return attendanceRows.filter((r) => r.studentId === inspectStudent.studentId);
  }, [attendanceRows, inspectStudent]);

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Top Header & Page Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            Student Attendance Lookup
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filter, search, and analyze student attendance records dynamically by period, student, standard, and status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5 hidden sm:inline-flex"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Filter Controls Card */}
      <UICard className="border border-border bg-card shadow-sm">
        <UICardHeader className="pb-3 border-b border-border/60">
          <UICardTitle className="text-base font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" /> Filter Attendance Records
          </UICardTitle>
        </UICardHeader>
        <UICardContent className="p-4 space-y-4">
          {/* Row 1: Time Presets & Custom Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Time Preset */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Time Period</label>
              <Select value={preset} onValueChange={(v) => handlePresetChange(v as PresetOption)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="last_7">Last 7 Days</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_30">Last 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From Date */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">From Date</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPreset("custom");
                }}
                className="h-9 text-xs"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">To Date</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPreset("custom");
                }}
                className="h-9 text-xs"
              />
            </div>

            {/* Search Bar */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Search Student</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Name, roll no..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Standard, Batch, Status, Method Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Standard Filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Standard</label>
              <Select value={selectedStandard} onValueChange={(v) => { setSelectedStandard(v); setSelectedBatch("all"); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Standards" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Standards</SelectItem>
                  {standards.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Batch Filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Batch / Section</label>
              <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Batches</SelectItem>
                  {availableBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Attendance Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="excused">Excused</SelectItem>
                  <SelectItem value="medical_leave">Medical Leave</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Source / Method Filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Capture Source</label>
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  <SelectItem value="staff_checkin">Class Attendance</SelectItem>
                  <SelectItem value="bulk_import">Bulk Import</SelectItem>
                  <SelectItem value="correction">Correction</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </UICardContent>
      </UICard>

      {/* KPI Metrics Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <UICard className="border border-border bg-card">
          <UICardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Records</p>
              <p className="text-2xl font-bold mt-1 text-foreground">{metrics.total}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
          </UICardContent>
        </UICard>

        <UICard className="border border-emerald-500/20 bg-emerald-500/5">
          <UICardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Present</p>
              <p className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
                {metrics.present} <span className="text-xs font-normal text-muted-foreground">({metrics.presentPct}%)</span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </UICardContent>
        </UICard>

        <UICard className="border border-rose-500/20 bg-rose-500/5">
          <UICardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400 uppercase tracking-wider">Absent</p>
              <p className="text-2xl font-bold mt-1 text-rose-700 dark:text-rose-300">
                {metrics.absent} <span className="text-xs font-normal text-muted-foreground">({metrics.absentPct}%)</span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-600">
              <XCircle className="h-5 w-5" />
            </div>
          </UICardContent>
        </UICard>

        <UICard className="border border-amber-500/20 bg-amber-500/5">
          <UICardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Late / Leave</p>
              <p className="text-2xl font-bold mt-1 text-amber-700 dark:text-amber-300">
                {metrics.late + metrics.excused}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </UICardContent>
        </UICard>
      </div>

      {/* Main Attendance Records Table */}
      <UICard className="border border-border bg-card shadow-sm overflow-hidden">
        <UICardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
          <div>
            <UICardTitle className="text-base font-semibold">Attendance Logs</UICardTitle>
            <UICardDescription className="text-xs text-muted-foreground mt-0.5">
              Showing {attendanceRows.length} entry/entries for period {fromDate} to {toDate}
            </UICardDescription>
          </div>
        </UICardHeader>

        <UICardContent className="p-0">
          {isAttendanceLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground space-y-2">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent animate-spin rounded-full mx-auto" />
              <p>Fetching attendance records...</p>
            </div>
          ) : attendanceRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground space-y-2">
              <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="font-semibold text-foreground">No attendance records found</p>
              <p className="text-xs text-muted-foreground">
                Try selecting a wider date range or clearing standard/batch filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground font-semibold">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Student Details</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Marked By</th>
                    <th className="py-3 px-4">Remarks</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {attendanceRows.map((row) => {
                    const statusInfo = STATUS_BADGE_STYLE[row.status] ?? {
                      label: row.status,
                      style: "bg-muted text-muted-foreground",
                    };

                    return (
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                        {/* Date */}
                        <td className="py-3 px-4 font-medium whitespace-nowrap text-foreground">
                          {row.date}
                        </td>

                        {/* Student Details */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground text-sm">
                            {row.studentName ?? "Student"}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                            {row.rollNumber && <span>Roll: {row.rollNumber}</span>}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge variant="outline" className={`text-xs px-2.5 py-0.5 font-medium ${statusInfo.style}`}>
                            {statusInfo.label}
                          </Badge>
                        </td>

                        {/* Source */}
                        <td className="py-3 px-4 whitespace-nowrap capitalize text-muted-foreground font-medium">
                          {row.source ? row.source.replace("_", " ") : "Manual"}
                        </td>

                        {/* Marked By */}
                        <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                          {row.markedByName ? (
                            <span>
                              {row.markedByName} {row.markedByRole ? `(${row.markedByRole})` : ""}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Remarks */}
                        <td className="py-3 px-4 text-muted-foreground max-w-[200px] truncate">
                          {row.remarks ?? "—"}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => setInspectStudent(row)}
                          >
                            <Eye className="h-3.5 w-3.5 text-primary" /> View Student
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </UICardContent>
      </UICard>

      {/* Student Attendance Breakdown Modal */}
      <Dialog open={!!inspectStudent} onOpenChange={(v) => !v && setInspectStudent(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
          {inspectStudent && (
            <>
              <DialogHeader className="p-6 pb-4 border-b border-border bg-card">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                    {inspectStudent.studentName?.charAt(0) ?? "S"}
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold text-foreground">
                      {inspectStudent.studentName}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                      {inspectStudent.rollNumber ? `Roll No: ${inspectStudent.rollNumber}` : "Student Record History"}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="bg-muted/40 p-4 rounded-xl border border-border space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span>Attendance Rate ({fromDate} to {toDate})</span>
                    <span>
                      {studentInspectionRows.length > 0
                        ? `${(
                            (studentInspectionRows.filter((r) => r.status === "present").length /
                              studentInspectionRows.length) *
                            100
                          ).toFixed(1)}%`
                        : "N/A"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span>Total Logs: {studentInspectionRows.length}</span>
                    <span>Present: {studentInspectionRows.filter((r) => r.status === "present").length}</span>
                    <span>Absent: {studentInspectionRows.filter((r) => r.status === "absent").length}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                    Log History ({fromDate} – {toDate})
                  </h4>
                  <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-card text-xs">
                    {studentInspectionRows.map((r) => {
                      const st = STATUS_BADGE_STYLE[r.status] ?? { label: r.status, style: "bg-muted text-muted-foreground" };
                      return (
                        <div key={r.id} className="p-3 flex items-center justify-between gap-2 hover:bg-muted/30">
                          <div>
                            <p className="font-semibold text-foreground">{r.date}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Source: {r.source ?? "manual"} {r.markedByName ? `· by ${r.markedByName}` : ""}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-xs ${st.style}`}>
                            {st.label}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentAttendanceLookupPage;
