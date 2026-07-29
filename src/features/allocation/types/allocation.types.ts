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
  /** The PRIMARY standard — always `standardIds[0]`. Kept for filters/reports. */
  standardId?: string;
  standardName?: string;
  /** Every standard this class covers (a class may span more than one). */
  standardIds: string[];
  standardNames: string[];
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
  /**
   * Minutes a still-running class is past its scheduled end — i.e. the staff
   * member started but never pressed End. 0 for every other state.
   */
  overrunMinutes: number;
}

/**
 * Per-staff "did they run their classes properly today" summary.
 *
 * Compliance is measured only against classes that are DUE (scheduled end has
 * passed). A teacher whose first class is at 2pm is not non-compliant at 9am,
 * and a board that says otherwise trains people to ignore it.
 */
export interface StaffComplianceRow {
  teacherId: string;
  teacherName?: string;
  /** Classes today, excluding cancelled ones. */
  total: number;
  /** Classes whose scheduled end has passed (the compliance denominator). */
  due: number;
  started: number;
  completed: number;
  attendanceSubmitted: number;
  /** Past start time, still 'scheduled' — nobody pressed Start. */
  notStarted: number;
  /** Running past its scheduled end — nobody pressed End. */
  notEnded: number;
  /** Due classes that are completed AND have attendance submitted. */
  compliant: number;
  /** compliant ÷ due, as a percentage. 100 when nothing is due yet. */
  compliancePct: number;
}

/** The whole coordinator/management live board for one day. */
export interface ClassMonitorBoard {
  date: string;
  live: MonitorCard[];
  upcoming: MonitorCard[];
  completed: MonitorCard[];
  notStarted: MonitorCard[]; // past start time, still 'scheduled'
  notEnded: MonitorCard[]; // still 'in_progress' past its scheduled end
  cancelled: MonitorCard[];
  attendancePending: MonitorCard[];
  lateFaculty: MonitorCard[];
  /** One row per staff member rostered today — the start/complete scoreboard. */
  staffCompliance: StaffComplianceRow[];
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
  /**
   * The student's OWN batch. A multi-standard class draws students from several
   * batches, and the day-level attendance row is batch-stamped — so the submit
   * has to group by this, not by the class's single batch_id.
   */
  batchId?: string;
  standardId?: string;
  standardName?: string;
}

/**
 * A student eligible for a class (standard + optional batch filter), as shown
 * in the coordinator's select/deselect roster picker.
 */
export interface ClassStudentCandidate {
  studentId: string;
  studentName: string;
  rollNumber?: string;
  standardId?: string;
  standardName?: string;
  batchId?: string;
  batchName?: string;
  sectionName?: string;
}

/** A student actually assigned to a class (a persisted class_students row). */
export interface ClassStudentAssignment extends ClassStudentCandidate {
  id: string;
  classScheduleId: string;
  assignedBy?: string;
  assignedAt?: string;
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
  /** Primary standard. Derived from `standardIds[0]` when only the array is set. */
  standardId?: string;
  /** All standards the class covers. */
  standardIds?: string[];
  /**
   * The exact students in this class. Empty ⇒ the class falls back to the whole
   * batch roster, which is how every class behaved before per-class assignment.
   */
  studentIds?: string[];
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
