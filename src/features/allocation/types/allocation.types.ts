// Domain types for the Academic Allocation module.
// DB shapes (coordinator_staff, coordinator_standards, sections, class_schedules)
// stay private to services/ — these are the app-facing camelCase models.

export type ClassMode = "offline" | "online" | "hybrid";

/** How an allocation repeats. `repeatDays` narrows daily/weekly to a day mask. */
export type RepeatPattern = "none" | "daily" | "weekly" | "monthly";

/**
 * Per-class attendance vocabulary (Phase 3). These map onto the existing
 * enterprise student-attendance statuses when the day-level row is saved —
 * see `toStudentStatus()` in classAttendance.service.ts. No parallel
 * attendance vocabulary is introduced downstream.
 */
export type ClassAttendanceStatus = "present" | "absent" | "late" | "medical" | "leave";

export type ScheduleStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "missed"
  | "rescheduled";

/** A staff↔coordinator assignment (many-to-many). */
export interface CoordinatorStaffLink {
  id: string;
  coordinatorId: string;
  staffId: string;
  assignedBy?: string;
  assignedAt?: string;
  isActive: boolean;
}

/** A coordinator's responsibility for a standard (scope). */
export interface CoordinatorStandardLink {
  id: string;
  coordinatorId: string;
  standardId: string;
  assignedBy?: string;
  assignedAt?: string;
}

/** A dynamic section scoped to a standard. */
export interface Section {
  id: string;
  standardId?: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

/** One (possibly recurring) class in the timetable. */
export interface ClassSchedule {
  id: string;
  teacherId?: string;
  teacherName?: string;
  coordinatorId?: string;
  standardId?: string;
  standardName?: string;
  sectionId?: string;
  sectionName?: string;
  subjectId?: string;
  subjectName?: string;
  batchId?: string;
  batchName?: string;
  scheduleDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  durationMinutes: number; // DB-computed
  mode: ClassMode;
  room?: string;
  meetingLink?: string;
  remarks?: string;
  repeatWeekly: boolean;
  repeatUntil?: string;
  holidaySkip: boolean;
  isExtra: boolean;
  extraReason?: string;
  status: ScheduleStatus;
  cancelReason?: string;
  rescheduledFrom?: string;
  // Phase 2 — operational fields
  originalTeacherId?: string;
  startedAt?: string;
  completedAt?: string;
  attendanceSubmitted?: boolean;
  liveClassId?: string;
  // Phase 3 — academic dimensions
  academicYear?: string;
  term?: string;
  month?: number;
  campusId?: string;
  campusName?: string;
  department?: string;
  repeatPattern: RepeatPattern;
  repeatDays: number[]; // 0=Sun … 6=Sat
  seriesId?: string;
  // Phase 3/5 — class tracking
  actualMinutes?: number;
  lateMinutes: number;
  earlyMinutes: number;
  startDevice?: string;
  startBrowser?: string;
  startIp?: string;
  startLat?: number;
  startLng?: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Where/how an action was performed — stamped on start/end + audit rows. */
export interface ClientContext {
  device?: string;
  browser?: string;
  ip?: string;
  lat?: number;
  lng?: number;
}

/** One live/board card on the realtime class monitor (Phase 4). */
export interface MonitorCard {
  schedule: ClassSchedule;
  /** minutes since actual start (live classes only) */
  elapsedMinutes: number;
  /** minutes until the scheduled end (live classes only, floors at 0) */
  remainingMinutes: number;
  expectedEnd: string; // HH:MM
  isLate: boolean;
  delayMinutes: number;
  attendancePending: boolean;
  studentCount: number;
}

/** The whole coordinator/management live board for one day. */
export interface ClassMonitorBoard {
  date: string;
  live: MonitorCard[];
  upcoming: MonitorCard[];
  completed: MonitorCard[];
  notStarted: MonitorCard[]; // past start time, still 'scheduled'
  cancelled: MonitorCard[];
  attendancePending: MonitorCard[];
  lateFaculty: MonitorCard[];
  totalClasses: number;
  averageDelayMinutes: number;
  facultyUtilisationPct: number; // busy faculty ÷ faculty with classes today
  classUtilisationPct: number; // completed ÷ (total − cancelled)
}

/** Per-faculty workload + earnings snapshot (Phase 6). */
export interface FacultyWorkload {
  teacherId: string;
  teacherName?: string;
  department?: string;
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  allocatedMinutes: number; // everything scheduled in the window
  completedMinutes: number;
  missedMinutes: number;
  cancelledMinutes: number;
  extraMinutes: number;
  classesTaken: number;
  classesRemaining: number;
  averageDelayMinutes: number;
  lateStarts: number;
  hourlyRate: number;
  rateSource: "staff" | "role" | "derived" | "none";
  salaryEarned: number; // completed hours × rate
  expectedSalary: number; // allocated hours × rate
}

/** Deterministic faculty insight card (Phase 11 — no external LLM). */
export interface FacultyInsight {
  teacherId: string;
  teacherName?: string;
  productivityScore: number; // 0-100
  consistencyScore: number; // 0-100 (punctuality)
  workloadScore: number; // 0-100 (100 = at target load)
  burnoutRisk: "low" | "medium" | "high";
  utilisation: "under" | "balanced" | "over";
  averageDelayMinutes: number;
  costPerHour: number;
  teachingEfficiencyPct: number; // actual ÷ allocated minutes
  recommendations: string[];
}

/** One audit line on a class (Phase 12). */
export interface ClassAuditEntry {
  id: string;
  classScheduleId: string;
  action: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  device?: string;
  browser?: string;
  ip?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

/** One roster row for the teacher's class-attendance screen. */
export interface ClassRosterRow {
  studentId: string;
  studentName: string;
  rollNumber?: string;
  status: ClassAttendanceStatus;
  previousStatus?: ClassAttendanceStatus;
  feeDue: boolean;
  remarks?: string;
}

/** A class impacted by a teacher's leave. */
export interface LeaveAffectedClass {
  schedule: ClassSchedule;
  leaveType?: string;
  leaveStatus?: string;
}

/** Per-teacher payroll pre-generation discrepancy line. */
export interface PayrollDiscrepancy {
  teacherId: string;
  teacherName?: string;
  scheduledMinutes: number;
  completedMinutes: number;
  extraMinutes: number;
  cancelledCount: number;
  missedCount: number;
  substituteMinutes: number; // hours gained as a substitute
  missingAttendanceCount: number; // completed classes with no class_attendance
  flags: string[];
}

export interface TimetableLock {
  id: string;
  periodStart: string;
  periodEnd: string;
  lockedBy?: string;
  reason?: string;
  isActive: boolean;
  createdAt?: string;
}

/** Input for creating/updating a class schedule. */
export interface ScheduleInput {
  teacherId: string;
  standardId?: string;
  sectionId?: string;
  subjectId?: string;
  batchId?: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  mode: ClassMode;
  room?: string;
  meetingLink?: string;
  remarks?: string;
  repeatWeekly?: boolean;
  repeatUntil?: string;
  holidaySkip?: boolean;
  isExtra?: boolean;
  extraReason?: string;
  // Phase 3 — academic dimensions + real recurrence
  academicYear?: string;
  term?: string;
  campusId?: string;
  department?: string;
  repeatPattern?: RepeatPattern;
  /** 0=Sun … 6=Sat. Empty ⇒ every day of the pattern. */
  repeatDays?: number[];
}

export interface ScheduleFilters {
  teacherId?: string;
  coordinatorId?: string;
  standardId?: string;
  status?: ScheduleStatus | "all";
  from?: string;
  to?: string;
  isExtra?: boolean;
  academicYear?: string;
  term?: string;
  month?: number;
  campusId?: string;
  department?: string;
}

// ── Reports (Phase 10) ───────────────────────────────────────────────────────
export type AllocationReportKey =
  | "faculty_daily"
  | "faculty_monthly"
  | "faculty_teaching_hours"
  | "payroll_hours"
  | "class_utilisation"
  | "department_utilisation"
  | "coordinator_allocation"
  | "management_summary";

/** A generic, export-ready dataset (fed straight into the shared exportEngine). */
export interface AllocationReport {
  key: AllocationReportKey;
  title: string;
  subtitle?: string;
  columns: { header: string; field: string; align?: "left" | "right" | "center" }[];
  rows: Record<string, string | number>[];
  kpis: { label: string; value: string | number }[];
}

/** Aggregated teaching hours for one teacher over a period. */
export interface TeachingHours {
  teacherId: string;
  teacherName?: string;
  totalMinutes: number; // completed regular classes
  extraMinutes: number; // completed extra classes
  scheduledMinutes: number; // still-scheduled (upcoming) minutes
  cancelledCount: number;
  missedCount: number;
  completedCount: number;
}
