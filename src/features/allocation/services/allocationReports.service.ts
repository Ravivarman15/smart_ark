import { BaseService } from "@/shared/services";
import type {
  AllocationReport,
  AllocationReportKey,
  ClassSchedule,
  FacultyWorkload,
} from "../types/allocation.types";
import { scheduleService } from "./schedule.service";
import { facultyWorkloadService } from "./facultyWorkload.service";

// ─────────────────────────────────────────────────────────────────────────────
// Faculty allocation reports (Phase 10).
//
// Each builder returns a plain, export-ready dataset ({ columns, rows, kpis })
// which is handed straight to the SHARED report export engine
// (`features/reports/utils/exportEngine`) for PDF / Excel / CSV. No new export
// code, no new PDF library, no duplicate aggregation — the numbers come from
// scheduleService + facultyWorkloadService, the same sources the dashboards use.
// ─────────────────────────────────────────────────────────────────────────────

const hrs = (mins: number): number => Math.round((mins / 60) * 100) / 100;
const money = (n: number): number => Math.round(n * 100) / 100;

export const REPORT_LABELS: Record<AllocationReportKey, string> = {
  faculty_daily: "Faculty Daily Report",
  faculty_monthly: "Faculty Monthly Report",
  faculty_teaching_hours: "Faculty Teaching Hours",
  payroll_hours: "Payroll Hours Report",
  class_utilisation: "Class Utilisation Report",
  department_utilisation: "Department Utilisation Report",
  coordinator_allocation: "Coordinator Allocation Report",
  management_summary: "Management Summary",
};

interface Ctx {
  from: string;
  to: string;
  schedules: ClassSchedule[];
  workloads: FacultyWorkload[];
}

const period = (c: Ctx): string => `${c.from} → ${c.to}`;

// ── Builders (pure — exported for unit tests) ────────────────────────────────

export const buildFacultyDaily = (c: Ctx): AllocationReport => {
  const rows = c.schedules
    .filter((s) => s.status !== "cancelled")
    .map((s) => ({
      Date: s.scheduleDate,
      Faculty: s.teacherName ?? "—",
      Class: [s.standardName, s.sectionName].filter(Boolean).join(" ") || "—",
      Subject: s.subjectName ?? "—",
      Scheduled: `${s.startTime}–${s.endTime}`,
      "Allocated (h)": hrs(s.durationMinutes),
      "Actual (h)": hrs(s.actualMinutes ?? 0),
      "Late (min)": s.lateMinutes ?? 0,
      Status: s.status,
      Attendance: s.attendanceSubmitted ? "Submitted" : "Pending",
    }))
    .sort((a, b) => (a.Date < b.Date ? -1 : a.Date > b.Date ? 1 : 0));
  return {
    key: "faculty_daily",
    title: REPORT_LABELS.faculty_daily,
    subtitle: period(c),
    columns: [
      { header: "Date", field: "Date" },
      { header: "Faculty", field: "Faculty" },
      { header: "Class", field: "Class" },
      { header: "Subject", field: "Subject" },
      { header: "Scheduled", field: "Scheduled" },
      { header: "Allocated (h)", field: "Allocated (h)", align: "right" },
      { header: "Actual (h)", field: "Actual (h)", align: "right" },
      { header: "Late (min)", field: "Late (min)", align: "right" },
      { header: "Status", field: "Status" },
      { header: "Attendance", field: "Attendance" },
    ],
    rows,
    kpis: [
      { label: "Classes", value: rows.length },
      { label: "Allocated hours", value: hrs(c.schedules.reduce((t, s) => t + s.durationMinutes, 0)) },
      { label: "Completed", value: c.schedules.filter((s) => s.status === "completed").length },
    ],
  };
};

export const buildFacultyMonthly = (c: Ctx): AllocationReport => {
  const rows = c.workloads.map((w) => ({
    Faculty: w.teacherName ?? w.teacherId,
    Department: w.department ?? "—",
    "Allocated (h)": hrs(w.allocatedMinutes),
    "Completed (h)": hrs(w.completedMinutes),
    "Extra (h)": hrs(w.extraMinutes),
    "Missed (h)": hrs(w.missedMinutes),
    "Cancelled (h)": hrs(w.cancelledMinutes),
    "Classes taken": w.classesTaken,
    Remaining: w.classesRemaining,
    "Avg delay (min)": w.averageDelayMinutes,
  }));
  return {
    key: "faculty_monthly",
    title: REPORT_LABELS.faculty_monthly,
    subtitle: period(c),
    columns: [
      { header: "Faculty", field: "Faculty" },
      { header: "Department", field: "Department" },
      { header: "Allocated (h)", field: "Allocated (h)", align: "right" },
      { header: "Completed (h)", field: "Completed (h)", align: "right" },
      { header: "Extra (h)", field: "Extra (h)", align: "right" },
      { header: "Missed (h)", field: "Missed (h)", align: "right" },
      { header: "Cancelled (h)", field: "Cancelled (h)", align: "right" },
      { header: "Classes taken", field: "Classes taken", align: "right" },
      { header: "Remaining", field: "Remaining", align: "right" },
      { header: "Avg delay (min)", field: "Avg delay (min)", align: "right" },
    ],
    rows,
    kpis: [
      { label: "Faculty", value: rows.length },
      { label: "Completed hours", value: hrs(c.workloads.reduce((t, w) => t + w.completedMinutes, 0)) },
    ],
  };
};

export const buildTeachingHours = (c: Ctx): AllocationReport => {
  const rows = c.workloads.map((w) => ({
    Faculty: w.teacherName ?? w.teacherId,
    "Today (h)": hrs(w.todayMinutes),
    "Week (h)": hrs(w.weekMinutes),
    "Period (h)": hrs(w.allocatedMinutes),
    "Taught (h)": hrs(w.completedMinutes),
    "Efficiency %":
      w.allocatedMinutes > 0
        ? Math.round((w.completedMinutes / w.allocatedMinutes) * 100)
        : 0,
  }));
  return {
    key: "faculty_teaching_hours",
    title: REPORT_LABELS.faculty_teaching_hours,
    subtitle: period(c),
    columns: [
      { header: "Faculty", field: "Faculty" },
      { header: "Today (h)", field: "Today (h)", align: "right" },
      { header: "Week (h)", field: "Week (h)", align: "right" },
      { header: "Period (h)", field: "Period (h)", align: "right" },
      { header: "Taught (h)", field: "Taught (h)", align: "right" },
      { header: "Efficiency %", field: "Efficiency %", align: "right" },
    ],
    rows,
    kpis: [{ label: "Faculty", value: rows.length }],
  };
};

export const buildPayrollHours = (c: Ctx): AllocationReport => {
  const rows = c.workloads.map((w) => ({
    Faculty: w.teacherName ?? w.teacherId,
    "Rate (₹/h)": money(w.hourlyRate),
    "Rate source": w.rateSource,
    "Payable (h)": hrs(w.completedMinutes),
    "Extra (h)": hrs(w.extraMinutes),
    "Earned (₹)": money(w.salaryEarned),
    "Expected (₹)": money(w.expectedSalary),
  }));
  return {
    key: "payroll_hours",
    title: REPORT_LABELS.payroll_hours,
    subtitle: `${period(c)} · projection only — the payroll run remains the source of truth`,
    columns: [
      { header: "Faculty", field: "Faculty" },
      { header: "Rate (₹/h)", field: "Rate (₹/h)", align: "right" },
      { header: "Rate source", field: "Rate source" },
      { header: "Payable (h)", field: "Payable (h)", align: "right" },
      { header: "Extra (h)", field: "Extra (h)", align: "right" },
      { header: "Earned (₹)", field: "Earned (₹)", align: "right" },
      { header: "Expected (₹)", field: "Expected (₹)", align: "right" },
    ],
    rows,
    kpis: [
      { label: "Payable hours", value: hrs(c.workloads.reduce((t, w) => t + w.completedMinutes, 0)) },
      { label: "Projected cost (₹)", value: money(c.workloads.reduce((t, w) => t + w.salaryEarned, 0)) },
    ],
  };
};

/** Group helper for the utilisation reports. */
const groupUtilisation = (
  schedules: ClassSchedule[],
  keyOf: (s: ClassSchedule) => string,
): Record<string, string | number>[] => {
  const acc = new Map<
    string,
    { allocated: number; completed: number; cancelled: number; missed: number; count: number }
  >();
  for (const s of schedules) {
    const k = keyOf(s) || "—";
    const cur = acc.get(k) ?? { allocated: 0, completed: 0, cancelled: 0, missed: 0, count: 0 };
    cur.count += 1;
    if (s.status === "cancelled") cur.cancelled += s.durationMinutes;
    else {
      cur.allocated += s.durationMinutes;
      if (s.status === "completed") cur.completed += s.actualMinutes ?? s.durationMinutes;
      if (s.status === "missed") cur.missed += s.durationMinutes;
    }
    acc.set(k, cur);
  }
  return [...acc.entries()]
    .map(([k, v]) => ({
      Name: k,
      Classes: v.count,
      "Allocated (h)": hrs(v.allocated),
      "Delivered (h)": hrs(v.completed),
      "Cancelled (h)": hrs(v.cancelled),
      "Missed (h)": hrs(v.missed),
      "Utilisation %": v.allocated > 0 ? Math.round((v.completed / v.allocated) * 100) : 0,
    }))
    .sort((a, b) => Number(b["Allocated (h)"]) - Number(a["Allocated (h)"]));
};

const UTIL_COLUMNS: AllocationReport["columns"] = [
  { header: "Name", field: "Name" },
  { header: "Classes", field: "Classes", align: "right" },
  { header: "Allocated (h)", field: "Allocated (h)", align: "right" },
  { header: "Delivered (h)", field: "Delivered (h)", align: "right" },
  { header: "Cancelled (h)", field: "Cancelled (h)", align: "right" },
  { header: "Missed (h)", field: "Missed (h)", align: "right" },
  { header: "Utilisation %", field: "Utilisation %", align: "right" },
];

export const buildClassUtilisation = (c: Ctx): AllocationReport => ({
  key: "class_utilisation",
  title: REPORT_LABELS.class_utilisation,
  subtitle: period(c),
  columns: [{ ...UTIL_COLUMNS[0], header: "Class" }, ...UTIL_COLUMNS.slice(1)],
  rows: groupUtilisation(c.schedules, (s) =>
    [s.standardName, s.sectionName].filter(Boolean).join(" "),
  ),
  kpis: [{ label: "Classes tracked", value: c.schedules.length }],
});

export const buildDepartmentUtilisation = (c: Ctx): AllocationReport => ({
  key: "department_utilisation",
  title: REPORT_LABELS.department_utilisation,
  subtitle: period(c),
  columns: [{ ...UTIL_COLUMNS[0], header: "Department" }, ...UTIL_COLUMNS.slice(1)],
  rows: groupUtilisation(c.schedules, (s) => s.department ?? ""),
  kpis: [{ label: "Departments", value: new Set(c.schedules.map((s) => s.department ?? "—")).size }],
});

export const buildCoordinatorAllocation = (c: Ctx): AllocationReport => {
  const acc = new Map<string, { faculty: Set<string>; classes: number; minutes: number }>();
  for (const s of c.schedules) {
    const k = s.coordinatorId ?? "unassigned";
    const cur = acc.get(k) ?? { faculty: new Set<string>(), classes: 0, minutes: 0 };
    if (s.teacherId) cur.faculty.add(s.teacherId);
    cur.classes += 1;
    if (s.status !== "cancelled") cur.minutes += s.durationMinutes;
    acc.set(k, cur);
  }
  const rows = [...acc.entries()].map(([k, v]) => ({
    Coordinator: k === "unassigned" ? "Unassigned" : k,
    Faculty: v.faculty.size,
    Classes: v.classes,
    "Allocated (h)": hrs(v.minutes),
  }));
  return {
    key: "coordinator_allocation",
    title: REPORT_LABELS.coordinator_allocation,
    subtitle: period(c),
    columns: [
      { header: "Coordinator", field: "Coordinator" },
      { header: "Faculty", field: "Faculty", align: "right" },
      { header: "Classes", field: "Classes", align: "right" },
      { header: "Allocated (h)", field: "Allocated (h)", align: "right" },
    ],
    rows,
    kpis: [{ label: "Coordinators", value: rows.length }],
  };
};

export const buildManagementSummary = (c: Ctx): AllocationReport => {
  const total = c.schedules.length;
  const completed = c.schedules.filter((s) => s.status === "completed");
  const cancelled = c.schedules.filter((s) => s.status === "cancelled");
  const missed = c.schedules.filter((s) => s.status === "missed");
  const lateStarts = c.schedules.filter((s) => (s.lateMinutes ?? 0) > 0);
  const allocatedMins = c.schedules
    .filter((s) => s.status !== "cancelled")
    .reduce((t, s) => t + s.durationMinutes, 0);
  const deliveredMins = completed.reduce((t, s) => t + (s.actualMinutes ?? s.durationMinutes), 0);
  const cost = c.workloads.reduce((t, w) => t + w.salaryEarned, 0);

  const rows: Record<string, string | number>[] = [
    { Metric: "Total classes", Value: total },
    { Metric: "Completed", Value: completed.length },
    { Metric: "Cancelled", Value: cancelled.length },
    { Metric: "Missed", Value: missed.length },
    { Metric: "Late starts", Value: lateStarts.length },
    {
      Metric: "Average class duration (h)",
      Value: completed.length > 0 ? hrs(deliveredMins / completed.length) : 0,
    },
    {
      Metric: "Average start delay (min)",
      Value:
        lateStarts.length > 0
          ? Math.round(lateStarts.reduce((t, s) => t + (s.lateMinutes ?? 0), 0) / lateStarts.length)
          : 0,
    },
    { Metric: "Allocated hours", Value: hrs(allocatedMins) },
    { Metric: "Delivered hours", Value: hrs(deliveredMins) },
    { Metric: "Class utilisation %", Value: allocatedMins > 0 ? Math.round((deliveredMins / allocatedMins) * 100) : 0 },
    { Metric: "Faculty active", Value: c.workloads.length },
    { Metric: "Projected teaching cost (₹)", Value: money(cost) },
    {
      Metric: "Cost per hour (₹)",
      Value: deliveredMins > 0 ? money(cost / (deliveredMins / 60)) : 0,
    },
  ];
  return {
    key: "management_summary",
    title: REPORT_LABELS.management_summary,
    subtitle: period(c),
    columns: [
      { header: "Metric", field: "Metric" },
      { header: "Value", field: "Value", align: "right" },
    ],
    rows,
    kpis: [
      { label: "Classes", value: total },
      { label: "Delivered hours", value: hrs(deliveredMins) },
      { label: "Teaching cost (₹)", value: money(cost) },
    ],
  };
};

const BUILDERS: Record<AllocationReportKey, (c: Ctx) => AllocationReport> = {
  faculty_daily: buildFacultyDaily,
  faculty_monthly: buildFacultyMonthly,
  faculty_teaching_hours: buildTeachingHours,
  payroll_hours: buildPayrollHours,
  class_utilisation: buildClassUtilisation,
  department_utilisation: buildDepartmentUtilisation,
  coordinator_allocation: buildCoordinatorAllocation,
  management_summary: buildManagementSummary,
};

class AllocationReportsService extends BaseService {
  /** Build one report for a period. RLS scopes the underlying reads. */
  async build(
    key: AllocationReportKey,
    from: string,
    to: string,
    opts: { coordinatorId?: string; teacherId?: string; department?: string } = {},
  ): Promise<AllocationReport> {
    const [schedules, workloads] = await Promise.all([
      scheduleService.list({
        from,
        to,
        status: "all",
        coordinatorId: opts.coordinatorId,
        teacherId: opts.teacherId,
        department: opts.department,
      }),
      facultyWorkloadService.list(from, to, {
        coordinatorId: opts.coordinatorId,
        teacherId: opts.teacherId,
      }),
    ]);
    return BUILDERS[key]({ from, to, schedules, workloads });
  }
}

export const allocationReportsService = new AllocationReportsService();
