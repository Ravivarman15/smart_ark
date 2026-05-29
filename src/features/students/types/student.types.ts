// ── Students feature — domain types ──────────────────────────────────────────
// App-facing (camelCase). Mapping to/from DB snake_case happens inside the
// services so no other layer ever sees Supabase column names. Every field
// added by the 20260520_students_module migration is optional, so callers
// that ran before the migration still type-check.

export type StudentRisk = "safe" | "watch" | "critical";
export type RetestStatus = "none" | "pending" | "allocated" | "completed";

// ── Core student ─────────────────────────────────────────────────────────────
export interface Student {
  id: string;
  name: string;
  rollNumber?: string;

  // academic placement
  batch: string; // batch name (joined) — preserved for AppDataContext compatibility
  batchId?: string;
  campus?: string;
  campusId?: string;
  standardId?: string;
  standardName?: string;
  courseTypeId?: string;
  courseTypeName?: string;
  academicYearId?: string;
  feeStructureId?: string;

  // performance
  spi: number;
  risk: StudentRisk;
  active: boolean;
  subject?: string;
  lastTestDate?: string;
  retestStatus?: RetestStatus;

  // personal
  gender?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
  address?: string;
  studentEmail?: string;
  studentContact?: string;
  profileImageUrl?: string;

  // parent
  parentName?: string;
  parentContact?: string;
  parentContact1?: string; // legacy alias of parentContact
  parentContact2?: string;
  parentEmail?: string;

  // mother (institution exports list mother details separately from father/parent)
  motherName?: string;
  motherContact?: string;
  motherEmail?: string;

  // guardian
  guardianName?: string;
  guardianRelation?: string;
  guardianContact?: string;

  // institution-export identity / demographic fields (20260608 migration)
  biometricId?: string;
  enrolmentNo?: string;
  grNo?: string;
  username?: string;
  category?: string;
  groupName?: string;
  state?: string;
  city?: string;
  schoolCollege?: string;
  university?: string;
  courseExpiryDate?: string;

  appAccessEnabled?: boolean;
  notes?: string;
  createdAt?: string;
}

/** Write payload — accepts batch/campus by id (preferred) or name (legacy). */
export interface StudentWriteInput {
  name: string;
  rollNumber?: string;
  batch?: string;
  batchId?: string;
  campus?: string;
  campusId?: string;
  standardId?: string;
  courseTypeId?: string;
  academicYearId?: string;
  feeStructureId?: string;
  spi?: number;
  risk?: StudentRisk;
  subject?: string;
  gender?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
  address?: string;
  studentEmail?: string;
  studentContact?: string;
  profileImageUrl?: string;
  parentName?: string;
  parentContact?: string;
  parentContact1?: string;
  parentContact2?: string;
  parentEmail?: string;
  motherName?: string;
  motherContact?: string;
  motherEmail?: string;
  guardianName?: string;
  guardianRelation?: string;
  guardianContact?: string;
  biometricId?: string;
  enrolmentNo?: string;
  grNo?: string;
  username?: string;
  category?: string;
  groupName?: string;
  state?: string;
  city?: string;
  schoolCollege?: string;
  university?: string;
  courseExpiryDate?: string;
  notes?: string;
}

export type CreateStudentInput = StudentWriteInput;
export type UpdateStudentInput = Partial<StudentWriteInput> & { active?: boolean };

// ── Attendance ───────────────────────────────────────────────────────────────
export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export type AttendanceMethod = "manual" | "biometric" | "qr" | "mobile";

/**
 * Identity bundle passed to attendance writes. Captures the *who* + *role*
 * + *user_id* of the staff member submitting the row, so the audit trigger
 * and analytics queries can attribute every mark.
 *
 * Every field is optional at the type level so legacy call-sites that pass
 * a bare profileId still compile (the service promotes that to a marker
 * internally). Authoritative writers (Manage Attendance, AppDataContext)
 * should always populate name + role for the audit log to be useful.
 */
export interface AttendanceMarker {
  userId: string;       // auth.users.id
  profileId?: string;   // profiles.id (preferred — matches marked_by FK)
  name: string;         // display name shown in the audit timeline
  role: string;         // admin | management | coordinator | teacher | ...
}

export interface StudentAttendanceRecord {
  id: string;
  studentId: string;
  studentName?: string;
  batchId?: string;
  date: string;
  status: AttendanceStatus;
  method?: AttendanceMethod;
  notes?: string;
  remarks?: string;
  markedBy?: string;
  markedByName?: string;
  markedByRole?: string;
  markedAt?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
}

/** One row of the attendance audit timeline. Mirrors student_attendance_audit. */
export interface AttendanceAuditEntry {
  id: string;
  attendanceId: string;
  studentId?: string;
  batchId?: string;
  date: string;
  oldStatus?: AttendanceStatus;
  newStatus: AttendanceStatus;
  method?: AttendanceMethod;
  remarks?: string;
  changedBy?: string;
  changedByName?: string;
  changedByRole?: string;
  changeType: "insert" | "update";
  changedAt: string;
}

/** One cell in the bulk-attendance editor. */
export interface AttendanceDraftRow {
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
}

export interface AttendanceSummary {
  date: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  presentPct: number;
}

export interface AttendanceTrendPoint {
  date: string;
  presentPct: number;
}

// ── Documents ────────────────────────────────────────────────────────────────
export interface StudentDocument {
  id: string;
  studentId: string;
  studentName?: string;
  category: string;
  title: string;
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  isShared: boolean;
  sharedAt?: string;
  uploadedBy?: string;
  createdAt?: string;
}

export interface DocumentUploadInput {
  studentId: string;
  category: string;
  title: string;
  file: File;
  isShared?: boolean;
}

// ── Leave requests ───────────────────────────────────────────────────────────
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface StudentLeaveRequest {
  id: string;
  studentId: string;
  studentName?: string;
  fromDate: string;
  toDate: string;
  leaveType: string;
  reason?: string;
  status: LeaveStatus;
  appliedBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt?: string;
}

export interface LeaveRequestInput {
  studentId: string;
  fromDate: string;
  toDate: string;
  leaveType: string;
  reason?: string;
}

// ── Year transfer ────────────────────────────────────────────────────────────
export type TransferStatus = "active" | "rolled_back";

export interface StudentYearTransfer {
  id: string;
  studentId: string;
  studentName?: string;
  fromAcademicYearId?: string;
  toAcademicYearId?: string;
  fromStandardId?: string;
  toStandardId?: string;
  fromBatchId?: string;
  toBatchId?: string;
  status: TransferStatus;
  note?: string;
  transferredBy?: string;
  transferredAt?: string;
  rolledBackAt?: string;
}

export interface TransferInput {
  studentIds: string[];
  toAcademicYearId: string;
  toStandardId?: string;
  toBatchId?: string;
  note?: string;
}

// ── Feedback ─────────────────────────────────────────────────────────────────
export interface StudentFeedback {
  id: string;
  studentId: string;
  studentName?: string;
  category: string;
  rating?: number;
  message: string;
  submittedBy?: string;
  createdAt?: string;
}

export interface FeedbackInput {
  studentId: string;
  category: string;
  rating?: number;
  message: string;
}

// ── Communication / chat ─────────────────────────────────────────────────────
export type MessageDirection = "in" | "out";

export interface StudentMessage {
  id: string;
  studentId: string;
  senderProfileId?: string;
  direction: MessageDirection;
  channel: string;
  body: string;
  readAt?: string;
  createdAt?: string;
}

// ── App access / rights ──────────────────────────────────────────────────────
export interface StudentAppAccess {
  id?: string;
  studentId: string;
  mobileEnabled: boolean;
  loginEnabled: boolean;
  features: Record<string, boolean>;
  updatedBy?: string;
  updatedAt?: string;
}

// ── Import ───────────────────────────────────────────────────────────────────
export interface ImportRowResult {
  rowNumber: number;
  name: string;
  status: "valid" | "duplicate" | "error";
  message?: string;
  data: StudentWriteInput;
}

export interface ImportBatch {
  id: string;
  fileName?: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  importedBy?: string;
  createdAt?: string;
  /** Columns the schema was missing during this run (migration not fully applied). */
  droppedColumns?: string[];
}

// ── Lookups (for form pickers) ───────────────────────────────────────────────
export interface LookupOption {
  id: string;
  name: string;
}
