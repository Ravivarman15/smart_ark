import type {
  AttendanceStatus,
  StudentRisk,
  StudentWriteInput,
} from "../types/student.types";

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

// Shared profile foundation picklists (20260630).
export const COMMUNICATION_PREFERENCES = ["WHATSAPP", "EMAIL", "SMS", "BOTH", "NONE"] as const;
export const STUDENT_STATUSES = ["ACTIVE", "INACTIVE", "LEFT", "TRANSFERRED", "ALUMNI"] as const;

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

// Shown when a write succeeded but some fields were skipped because their
// columns don't exist yet (student-module migrations not fully applied). The
// column-level fallback persists everything the schema has — this just tells
// the operator which fields were dropped so data loss is never silent.
export const STUDENT_MIGRATION_WARNING =
  "Student module migrations not fully applied. Some fields could not be saved";

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

// ── Smart alias-based column detection ────────────────────────────────────────
// The maps above are kept for the legacy `csvToStudentRows` path. The system
// below powers the smart importer: institution exports use free-form headers
// ("Class/Batch", "Father Mobile", "Birth Date"), so instead of enumerating
// every punctuation variant we NORMALISE a header (lowercase + strip every
// non-alphanumeric) and look it up against per-field alias lists. Adding a new
// accepted header = adding one string to a list; no parsing code changes.

/** Collapse a header to a comparison key: "Class / Batch" → "classbatch". */
export const normalizeHeader = (h: string): string =>
  h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Student-field name → accepted header aliases (written human-readable; the
 *  lookup normalises them). Order matters only for documentation. */
export const STUDENT_FIELD_ALIASES: Partial<Record<keyof StudentWriteInput, string[]>> = {
  name: [
    "name", "student name", "full name", "student full name", "candidate name",
    "student", "name of student", "name of the student", "studentname",
  ],
  rollNumber: ["roll", "roll no", "roll number", "rollno", "class roll no", "class roll number"],
  gender: ["gender", "sex"],
  bloodGroup: ["blood group"],
  dateOfBirth: ["birth date", "date of birth", "dob", "birthdate"],
  dateOfJoining: ["join date", "joining date", "admission date", "date of joining", "doj"],
  address: ["address", "residential address", "permanent address"],
  // Generic "mobile" / "email" default to the STUDENT per requirement spec.
  studentContact: [
    "student mobile", "student contact", "student phone", "student mobile no",
    "mobile", "mobile no", "mobile number",
  ],
  studentEmail: ["student email", "email", "email id", "student email id", "e mail"],
  parentName: ["father name", "fathers name", "parent name"],
  parentContact: [
    "father mobile", "fathers mobile", "father contact", "parent mobile",
    "parent contact", "contact no", "contact", "phone",
  ],
  parentContact2: ["alternate mobile", "alternate contact", "secondary contact"],
  parentEmail: ["father email", "fathers email", "parent email", "father email id"],
  motherName: ["mother name", "mothers name"],
  motherContact: ["mother mobile", "mothers mobile", "mother contact", "mother phone"],
  motherEmail: ["mother email", "mothers email", "mother email id"],
  guardianName: ["guardian name", "guardian"],
  guardianContact: ["guardian mobile", "guardian contact", "guardian phone"],
  biometricId: ["biometric id", "biometric", "bio id", "biometric code"],
  enrolmentNo: [
    "enrolment no", "enrollment no", "enrolment number", "enrollment number",
    "enrolment", "enrollment", "enroll no",
    // Admission / registration numbers are the same institutional identity.
    "admission no", "admission number", "admission", "adm no", "admno",
    "reg no", "reg number", "registration no", "registration number", "regno",
  ],
  grNo: ["gr no", "gr number", "grno", "general register no"],
  username: ["user name", "username", "login id", "login name"],
  category: ["category", "caste category"],
  groupName: ["group", "group name", "stream group"],
  state: ["state"],
  city: ["city", "town"],
  schoolCollege: ["school college", "school / college", "school", "college", "previous school"],
  university: ["university", "board", "university board"],
  courseExpiryDate: ["course expiry date", "expiry date", "course expiry", "course end date"],
  // ── Shared profile foundation (20260630) ──
  section: ["section", "div", "division", "class section"],
  transportRequired: ["transport", "transport required", "needs transport", "transport needed", "bus"],
  hostelRequired: ["hostel", "hostel required", "needs hostel", "hosteller", "boarding", "residential"],
  medicalConditions: ["medical", "medical conditions", "medical notes", "health notes", "health conditions"],
  allergies: ["allergy", "allergies", "known allergies"],
  emergencyContactName: ["emergency contact name", "emergency name", "emergency contact"],
  emergencyContactNumber: ["emergency contact number", "emergency number", "emergency mobile", "emergency phone", "emergency contact no"],
  emergencyContactRelation: ["emergency contact relation", "emergency relation", "emergency relationship"],
  communicationPreference: ["communication preference", "comm preference", "preferred channel", "contact preference", "notification preference"],
  parentPreferredLanguage: ["preferred language", "parent language", "language", "communication language"],
  studentStatus: ["student status", "status", "enrolment status", "lifecycle status"],
};

/** Academic-reference field → accepted header aliases (resolved to ids via
 *  `resolveAcademic` against live Setup data). */
export const ACADEMIC_FIELD_ALIASES: Record<AcademicRefField, string[]> = {
  standardName: ["standard", "standard name", "std", "grade"],
  batchName: ["class batch", "class / batch", "batch", "batch name", "class"],
  courseTypeName: ["course type", "course", "stream", "course type name"],
  academicYearName: ["academic year", "academic year name", "year", "session", "ay"],
};

// Normalised lookup: header-key → student field. Built once at module load.
export const STUDENT_HEADER_LOOKUP: Record<string, keyof StudentWriteInput> = (() => {
  const m: Record<string, keyof StudentWriteInput> = {};
  for (const [field, aliases] of Object.entries(STUDENT_FIELD_ALIASES)) {
    for (const alias of aliases ?? []) m[normalizeHeader(alias)] = field as keyof StudentWriteInput;
  }
  return m;
})();

// Normalised lookup: header-key → academic ref field.
export const ACADEMIC_HEADER_LOOKUP: Record<string, AcademicRefField> = (() => {
  const m: Record<string, AcademicRefField> = {};
  for (const [field, aliases] of Object.entries(ACADEMIC_FIELD_ALIASES)) {
    for (const alias of aliases) m[normalizeHeader(alias)] = field as AcademicRefField;
  }
  return m;
})();
