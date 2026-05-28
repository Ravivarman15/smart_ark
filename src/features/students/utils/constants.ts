import type { AttendanceStatus, StudentRisk } from "../types/student.types";

// ── Risk ─────────────────────────────────────────────────────────────────────
export const RISK_META: Record<StudentRisk, { label: string; className: string }> = {
  safe: { label: "Safe", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  watch: { label: "Watch", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  critical: { label: "Critical", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

/** Derive a risk band from a 0–100 performance index. */
export const riskFromSpi = (spi: number): StudentRisk =>
  spi >= 75 ? "safe" : spi >= 60 ? "watch" : "critical";

// ── Attendance ───────────────────────────────────────────────────────────────
export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; className: string; dot: string }
> = {
  present: {
    label: "Present",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  absent: {
    label: "Absent",
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
  late: {
    label: "Late",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  excused: {
    label: "Excused",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
  },
};

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "absent",
  "late",
  "excused",
];

// ── Picklists ────────────────────────────────────────────────────────────────
export const GENDER_OPTIONS = ["Male", "Female", "Other"];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const GUARDIAN_RELATIONS = [
  "Father",
  "Mother",
  "Grandparent",
  "Sibling",
  "Uncle",
  "Aunt",
  "Other",
];

export const DOCUMENT_CATEGORIES = [
  "general",
  "id_proof",
  "marksheet",
  "certificate",
  "medical",
  "fee_receipt",
  "photo",
];

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  id_proof: "ID Proof",
  marksheet: "Marksheet",
  certificate: "Certificate",
  medical: "Medical",
  fee_receipt: "Fee Receipt",
  photo: "Photo",
};

export const LEAVE_TYPES = ["general", "sick", "family", "academic", "emergency"];

export const FEEDBACK_CATEGORIES = [
  "academic",
  "behaviour",
  "attendance",
  "parent_concern",
  "appreciation",
  "general",
];

// ── CSV import column map ─────────────────────────────────────────────────────
// Accepted header → StudentWriteInput field. Headers are lower-cased and
// trimmed before lookup so "Student Name", "student_name" etc. all match.
export const IMPORT_COLUMN_MAP: Record<string, string> = {
  name: "name",
  "student name": "name",
  student_name: "name",
  roll: "rollNumber",
  "roll number": "rollNumber",
  roll_number: "rollNumber",
  gender: "gender",
  "date of birth": "dateOfBirth",
  dob: "dateOfBirth",
  date_of_birth: "dateOfBirth",
  "parent name": "parentName",
  parent_name: "parentName",
  "parent contact": "parentContact",
  parent_contact: "parentContact",
  contact: "parentContact",
  phone: "parentContact",
  "parent email": "parentEmail",
  parent_email: "parentEmail",
  email: "parentEmail",
  address: "address",
};

// ── CSV academic-mapping column map ───────────────────────────────────────────
// These columns are NOT student fields — they carry the *names* of Setup-module
// records (standard / batch / course type / academic year) that get resolved to
// ids at import time. Kept separate from IMPORT_COLUMN_MAP so the resolver can
// run name→id matching before building the student write payload. Headers are
// lower-cased + trimmed before lookup. Every alias is optional: a template
// without these columns still imports (migration-safe).
export type AcademicRefField =
  | "standardName"
  | "batchName"
  | "courseTypeName"
  | "academicYearName";

export const IMPORT_ACADEMIC_COLUMN_MAP: Record<string, AcademicRefField> = {
  standard: "standardName",
  "standard name": "standardName",
  standard_name: "standardName",
  class: "batchName",
  "class name": "batchName",
  batch: "batchName",
  "batch name": "batchName",
  batch_name: "batchName",
  "class / batch": "batchName",
  "class/batch": "batchName",
  "class_batch": "batchName",
  section: "batchName",
  "course type": "courseTypeName",
  course_type: "courseTypeName",
  course_type_name: "courseTypeName",
  "course type name": "courseTypeName",
  stream: "courseTypeName",
  "academic year": "academicYearName",
  academic_year: "academicYearName",
  academic_year_name: "academicYearName",
  "academic year name": "academicYearName",
  year: "academicYearName",
};

// Canonical header order for the downloadable sample template. Student details
// first, academic mapping columns grouped at the end.
export const IMPORT_TEMPLATE_HEADERS = [
  "name",
  "roll_number",
  "gender",
  "date_of_birth",
  "parent_name",
  "parent_contact",
  "parent_email",
  "address",
  "standard_name",
  "batch_name",
  "course_type_name",
  "academic_year_name",
] as const;
