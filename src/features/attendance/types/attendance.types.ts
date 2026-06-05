// ── Attendance domain types (app-facing, not DB rows) ───────────────────────
// The enterprise attendance module is the single source of truth for student
// and staff attendance. These types describe the shapes the UI works with;
// services map DB rows ↔ these.

// ── Status vocabularies ──────────────────────────────────────────────────────
// Student set is wider than the legacy 4-value students-feature union (which
// stays as-is). The DB check constraint is widened in 20260612_attendance_module.
export type StudentAttendanceStatus =
  | "present"
  | "absent"
  | "late"
  | "excused"
  | "half_day"
  | "medical_leave"
  | "holiday";

export type StaffAttendanceStatus =
  | "present"
  | "absent"
  | "half_day"
  | "leave"
  | "late";

/** Capture channel — every row knows where it came from. */
export type AttendanceSource = "manual" | "staff_checkin" | "bulk_import" | "correction";

// ── Marker identity ──────────────────────────────────────────────────────────
/** Who performed the write (recorded for the audit trail). */
export interface AttendanceMarker {
  userId: string;
  profileId: string;
  name: string;
  role: string;
}

// ── Lookups ──────────────────────────────────────────────────────────────────
export interface LookupOption {
  id: string;
  name: string;
}

export interface BatchFilterOption extends LookupOption {
  standardId?: string;
  courseTypeId?: string;
  academicYearId?: string;
}

export interface StaffOption {
  id: string;
  name: string;
  role: string;
}

// ── Student attendance ───────────────────────────────────────────────────────
/** One editable cell in the student marking grid. */
export interface StudentDraftRow {
  studentId: string;
  studentName: string;
  rollNumber?: string;
  status: StudentAttendanceStatus;
  remarks?: string;
}

/** A persisted student attendance row, read for the register / history views. */
export interface StudentAttendanceRow {
  id: string;
  studentId: string;
  studentName?: string;
  rollNumber?: string;
  batchId?: string;
  date: string;
  status: StudentAttendanceStatus;
  source?: AttendanceSource;
  remarks?: string;
  markedByName?: string;
  markedByRole?: string;
  markedAt?: string;
}

// ── Staff attendance ─────────────────────────────────────────────────────────
export interface StaffAttendanceRecord {
  id: string;
  staffId: string;
  staffName?: string;
  role?: string;
  date: string;
  status: StaffAttendanceStatus;
  inTime?: string;
  outTime?: string;
  workedMinutes: number;
  expectedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  source: AttendanceSource;
  remarks?: string;
  markedBy?: string;
  markedByName?: string;
  markedByRole?: string;
  markedAt?: string;
  lastUpdatedAt?: string;
}

/** Manual staff entry payload (management) or a correction. */
export interface StaffManualInput {
  staffId: string;
  date: string;
  status: StaffAttendanceStatus;
  inTime?: string;   // ISO timestamp
  outTime?: string;  // ISO timestamp
  remarks?: string;
}

// ── Work hours engine output ─────────────────────────────────────────────────
export interface WorkHours {
  workedMinutes: number;
  expectedMinutes: number;
  remainingMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyExitMinutes: number;
  attendancePct: number;
}

// ── Settings ─────────────────────────────────────────────────────────────────
export interface AttendanceSettings {
  instituteStartTime: string; // "HH:MM"
  instituteEndTime: string;   // "HH:MM"
  lateThresholdMinutes: number;
  expectedDailyMinutes: number;
  expectedWeeklyMinutes: number;
  attendanceMinPct: number;
  autoNotifications: boolean;
  correctionApprovalRequired: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

// ── Audit ────────────────────────────────────────────────────────────────────
export interface StaffAuditEntry {
  id: string;
  attendanceId: string;
  staffId?: string;
  date: string;
  oldStatus?: StaffAttendanceStatus;
  newStatus: StaffAttendanceStatus;
  oldInTime?: string;
  newInTime?: string;
  oldOutTime?: string;
  newOutTime?: string;
  source?: AttendanceSource;
  remarks?: string;
  changedBy?: string;
  changedByName?: string;
  changedByRole?: string;
  changeType: "insert" | "update";
  changedAt: string;
}

// ── Dashboard snapshot ───────────────────────────────────────────────────────
export interface StudentDaySummary {
  present: number;
  absent: number;
  late: number;
  excused: number;
  halfDay: number;
  medicalLeave: number;
  holiday: number;
  total: number;
  presentPct: number;
}

export interface StaffDaySummary {
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
  total: number;
  presentPct: number;
  avgWorkedMinutes: number;
}

export interface DashboardSnapshot {
  date: string;
  students: StudentDaySummary;
  staff: StaffDaySummary;
}
