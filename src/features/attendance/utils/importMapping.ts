// ── Attendance bulk-import mapping + normalisers ─────────────────────────────
// PURE helpers (no React, no Supabase). Turn a raw spreadsheet matrix into
// field-keyed records, auto-detecting columns by normalised header alias, and
// normalise dates / times / statuses so the import service only deals with
// clean values. Resolution of names → ids happens in the service (needs DB).

import type { StaffAttendanceStatus, StudentAttendanceStatus } from "../types/attendance.types";

export type StudentImportField =
  | "date"
  | "studentName"
  | "rollNumber"
  | "enrolmentNo"
  | "status"
  | "remarks";

export type StaffImportField =
  | "date"
  | "staffName"
  | "email"
  | "status"
  | "inTime"
  | "outTime"
  | "remarks";

/** Collapse a header to a comparison key: "Roll No." → "rollno". */
export const normalizeHeader = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const STUDENT_ALIASES: Record<StudentImportField, string[]> = {
  date: ["date", "attendance date", "att date", "day"],
  studentName: ["student name", "name", "student", "full name"],
  rollNumber: ["roll", "roll no", "roll number", "rollno"],
  enrolmentNo: ["enrolment no", "enrollment no", "enrolment", "enrollment", "enrolment number", "enrollment number", "gr no", "admission no"],
  status: ["status", "attendance", "present", "att"],
  remarks: ["remarks", "remark", "note", "notes", "reason"],
};

const STAFF_ALIASES: Record<StaffImportField, string[]> = {
  date: ["date", "attendance date", "att date", "day"],
  staffName: ["staff name", "name", "staff", "employee", "employee name", "teacher", "teacher name"],
  email: ["email", "email id", "e mail", "staff email"],
  status: ["status", "attendance", "att"],
  inTime: ["in time", "in", "check in", "checkin", "intime", "in time (hh:mm)"],
  outTime: ["out time", "out", "check out", "checkout", "outtime", "out time (hh:mm)"],
  remarks: ["remarks", "remark", "note", "notes", "reason"],
};

const buildLookup = <T extends string>(aliases: Record<T, string[]>): Record<string, T> => {
  const m: Record<string, T> = {};
  for (const field of Object.keys(aliases) as T[]) {
    for (const alias of aliases[field]) m[normalizeHeader(alias)] = field;
  }
  return m;
};

const STUDENT_LOOKUP = buildLookup(STUDENT_ALIASES);
const STAFF_LOOKUP = buildLookup(STAFF_ALIASES);

/** header index → field, for whichever columns we recognise. */
export const detectColumns = <T extends string>(
  headers: string[],
  kind: "student" | "staff",
): Record<number, T> => {
  const lookup = (kind === "student" ? STUDENT_LOOKUP : STAFF_LOOKUP) as Record<string, T>;
  const out: Record<number, T> = {};
  headers.forEach((h, i) => {
    const field = lookup[normalizeHeader(h)];
    if (field && !(Object.values(out) as string[]).includes(field)) out[i] = field;
  });
  return out;
};

/** Turn a matrix (header row + data rows) into field-keyed records. */
export function rowsToRecords<T extends string>(
  matrix: string[][],
  kind: "student" | "staff",
): { mapping: Record<number, T>; records: { rowNumber: number; values: Partial<Record<T, string>> }[] } {
  if (matrix.length === 0) return { mapping: {}, records: [] };
  const [headers, ...rows] = matrix;
  const mapping = detectColumns<T>(headers, kind);
  const records = rows.map((row, idx) => {
    const values: Partial<Record<T, string>> = {};
    for (const [colStr, field] of Object.entries(mapping)) {
      const col = Number(colStr);
      const v = (row[col] ?? "").trim();
      if (v) values[field as T] = v;
    }
    return { rowNumber: idx + 2, values }; // +2: 1-based + header row
  });
  return { mapping, records };
}

// ── Date normaliser → YYYY-MM-DD (or null) ───────────────────────────────────
export const normalizeDate = (raw: string): string | null => {
  const s = (raw ?? "").trim();
  if (!s) return null;
  // Already ISO-ish.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY (Indian default — day first).
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    if (Number(mm) > 12) return null;
    return `${y}-${mm}-${dd}`;
  }
  // Fallback: let Date try ("12 Jun 2026" etc.).
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return null;
};

// ── Clock normaliser → "HH:MM" (24h) or undefined ────────────────────────────
export const normalizeClock = (raw?: string): string | undefined => {
  const s = (raw ?? "").trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = m[2];
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23) return undefined;
  return `${String(h).padStart(2, "0")}:${min}`;
};

// ── Status normalisers ───────────────────────────────────────────────────────
const STUDENT_STATUS_MAP: Record<string, StudentAttendanceStatus> = {
  present: "present", p: "present", yes: "present", "1": "present",
  absent: "absent", a: "absent", ab: "absent", no: "absent", "0": "absent",
  late: "late", l: "late", tardy: "late",
  excused: "excused", e: "excused", exc: "excused",
  halfday: "half_day", half: "half_day", hd: "half_day", "half day": "half_day",
  medical: "medical_leave", "medical leave": "medical_leave", ml: "medical_leave", sick: "medical_leave",
  holiday: "holiday", h: "holiday", off: "holiday",
};

const STAFF_STATUS_MAP: Record<string, StaffAttendanceStatus> = {
  present: "present", p: "present", yes: "present", "1": "present",
  absent: "absent", a: "absent", ab: "absent", no: "absent", "0": "absent",
  late: "late", tardy: "late",
  halfday: "half_day", half: "half_day", hd: "half_day", "half day": "half_day",
  leave: "leave", lv: "leave", l: "leave", "on leave": "leave",
};

export const normalizeStudentStatus = (raw?: string): StudentAttendanceStatus | null => {
  const key = (raw ?? "").trim().toLowerCase();
  return STUDENT_STATUS_MAP[key] ?? STUDENT_STATUS_MAP[key.replace(/[^a-z0-9 ]/g, "")] ?? null;
};

export const normalizeStaffStatus = (raw?: string): StaffAttendanceStatus | null => {
  const key = (raw ?? "").trim().toLowerCase();
  return STAFF_STATUS_MAP[key] ?? STAFF_STATUS_MAP[key.replace(/[^a-z0-9 ]/g, "")] ?? null;
};

// ── Preview models ───────────────────────────────────────────────────────────
export interface ImportPreviewRow {
  rowNumber: number;
  /** original cells for error export */
  raw: Record<string, string>;
  date: string | null;
  matchedId?: string;
  matchedName?: string;
  batchId?: string;     // students only
  status: string | null;
  inTime?: string;      // staff only — "HH:MM"
  outTime?: string;     // staff only
  remarks?: string;
  valid: boolean;
  duplicate: boolean;
  errors: string[];
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  total: number;
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  unmatchedColumns: boolean; // true when required columns weren't detected
}
