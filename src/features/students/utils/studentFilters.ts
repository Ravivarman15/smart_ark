// ─────────────────────────────────────────────────────────────────────────────
// Manage Students — filtering model + live statistics.
//
// Two-tier filtering (documented in ManageStudentsPage):
//   • SERVER side  — the heavy structural filters that map to indexed columns
//     guaranteed to exist (status, standard, batch, course type, campus, risk).
//     `toServerParams` builds the ListParams; the service applies them in SQL so
//     the payload is already narrowed before it reaches the client.
//   • CLIENT side  — lightweight demographic refinements + the multi-field
//     search. These run on the fetched set (`applyClientFilters`) so they also
//     work on a migration-drifted schema where some columns (category, group,
//     academic_year_id) may not yet exist — a `.eq` on a missing column would
//     error, but reading it just yields undefined.
//
// The table view and every export share the SAME filtered array, so
// "Export Filtered" always matches what's on screen.
// ─────────────────────────────────────────────────────────────────────────────

import type { ListParams } from "@/shared/services";
import type { Student } from "../types/student.types";

export interface StudentFilters {
  search: string;
  status: "active" | "inactive" | "all";
  standardId: string; // "all" | id
  batchId: string; // "all" | id
  courseTypeId: string; // "all" | id
  academicYearId: string; // "all" | id
  campusId: string; // "all" | id
  gender: string; // "all" | value
  category: string; // "all" | value
  group: string; // "all" | value
  risk: string; // "all" | safe | watch | critical
  admissionFrom: string; // YYYY-MM-DD
  admissionTo: string;
  dobFrom: string;
  dobTo: string;
}

export const EMPTY_FILTERS: StudentFilters = {
  search: "",
  status: "active",
  standardId: "all",
  batchId: "all",
  courseTypeId: "all",
  academicYearId: "all",
  campusId: "all",
  gender: "all",
  category: "all",
  group: "all",
  risk: "all",
  admissionFrom: "",
  admissionTo: "",
  dobFrom: "",
  dobTo: "",
};

/** Build the SQL-level params (structural filters only — see file header). */
export const toServerParams = (f: StudentFilters): ListParams => ({
  filters: {
    status: f.status,
    ...(f.standardId !== "all" ? { standardId: f.standardId } : {}),
    ...(f.batchId !== "all" ? { batchId: f.batchId } : {}),
    ...(f.courseTypeId !== "all" ? { courseTypeId: f.courseTypeId } : {}),
    ...(f.campusId !== "all" ? { campusId: f.campusId } : {}),
    ...(f.risk !== "all" ? { riskLevel: f.risk } : {}),
  },
});

const dateOnly = (v?: string): string => (v ? v.slice(0, 10) : "");

const inRange = (value: string | undefined, from: string, to: string): boolean => {
  const d = dateOnly(value);
  if (!d) return !from && !to ? true : false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

const norm = (v?: string): string => (v ?? "").trim().toLowerCase();

/** Apply the client-side refinements + multi-field search to a fetched set. */
export const applyClientFilters = (rows: Student[], f: StudentFilters): Student[] => {
  const q = norm(f.search);
  return rows.filter((s) => {
    if (q) {
      const haystack = [
        s.name,
        s.rollNumber,
        s.enrolmentNo,
        s.grNo,
        s.biometricId,
        s.studentContact,
        s.parentContact,
        s.parentName,
        s.studentEmail,
      ]
        .map(norm)
        .join(" ");
      if (!haystack.includes(q)) return false;
    }
    if (f.academicYearId !== "all" && s.academicYearId !== f.academicYearId) return false;
    if (f.gender !== "all" && norm(s.gender) !== norm(f.gender)) return false;
    if (f.category !== "all" && norm(s.category) !== norm(f.category)) return false;
    if (f.group !== "all" && norm(s.groupName) !== norm(f.group)) return false;
    if (f.admissionFrom || f.admissionTo) {
      if (!inRange(s.dateOfJoining, f.admissionFrom, f.admissionTo)) return false;
    }
    if (f.dobFrom || f.dobTo) {
      if (!inRange(s.dateOfBirth, f.dobFrom, f.dobTo)) return false;
    }
    return true;
  });
};

export interface StudentStats {
  total: number;
  active: number;
  inactive: number;
  male: number;
  female: number;
  newAdmissions: number; // admitted in the last 30 days
  batchCount: number;
  standardCount: number;
}

const daysAgoIso = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** Live statistics computed from the currently filtered set. */
export const computeStudentStats = (rows: Student[]): StudentStats => {
  const cutoff = daysAgoIso(30);
  const batches = new Set<string>();
  const standards = new Set<string>();
  let active = 0;
  let male = 0;
  let female = 0;
  let newAdmissions = 0;
  for (const s of rows) {
    if (s.active) active++;
    const g = norm(s.gender);
    if (g === "male" || g === "m") male++;
    else if (g === "female" || g === "f") female++;
    if (s.batchId) batches.add(s.batchId);
    if (s.standardId) standards.add(s.standardId);
    if (dateOnly(s.dateOfJoining) >= cutoff) newAdmissions++;
  }
  return {
    total: rows.length,
    active,
    inactive: rows.length - active,
    male,
    female,
    newAdmissions,
    batchCount: batches.size,
    standardCount: standards.size,
  };
};

/** Distinct, sorted demographic values for the filter dropdowns. */
export const distinctValues = (rows: Student[], pick: (s: Student) => string | undefined): string[] => {
  const set = new Set<string>();
  for (const s of rows) {
    const v = pick(s)?.trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
};

export interface DefaultView {
  id: string;
  label: string;
  patch: Partial<StudentFilters>;
}

// Built-in views expressible purely through the filter shape (no hard-coded ids,
// so they stay valid across institutions).
export const DEFAULT_VIEWS: DefaultView[] = [
  { id: "all", label: "All Students", patch: { ...EMPTY_FILTERS, status: "all" } },
  { id: "active", label: "Active Students", patch: { ...EMPTY_FILTERS, status: "active" } },
  { id: "inactive", label: "Inactive Students", patch: { ...EMPTY_FILTERS, status: "inactive" } },
  {
    id: "new",
    label: "New Admissions (30d)",
    patch: { ...EMPTY_FILTERS, status: "all", admissionFrom: daysAgoIso(30) },
  },
  { id: "critical", label: "Critical Risk", patch: { ...EMPTY_FILTERS, status: "all", risk: "critical" } },
];
