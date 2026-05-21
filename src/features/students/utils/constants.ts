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
