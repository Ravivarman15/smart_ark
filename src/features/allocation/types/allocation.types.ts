// Domain types for the Academic Allocation module.
// DB shapes (coordinator_staff, coordinator_standards, sections, class_schedules)
// stay private to services/ — these are the app-facing camelCase models.

export type ClassMode = "offline" | "online";

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
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** One roster row for the teacher's class-attendance screen. */
export interface ClassRosterRow {
  studentId: string;
  studentName: string;
  rollNumber?: string;
  status: "present" | "absent";
  previousStatus?: "present" | "absent";
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
}

export interface ScheduleFilters {
  teacherId?: string;
  coordinatorId?: string;
  standardId?: string;
  status?: ScheduleStatus | "all";
  from?: string;
  to?: string;
  isExtra?: boolean;
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
