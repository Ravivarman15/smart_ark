// Student-import academic mapping: resolves Setup-module names (standard /
// batch / course type / academic year) to ids, with case-insensitive, trimmed,
// alias-safe matching, and row-level validation. All Setup data is passed in
// live from the hooks — nothing here is hardcoded.

import type {
  AcademicYear,
  Batch,
  CourseType,
  Standard,
} from "@/features/setup/types/setup.types";
import type { Student, StudentWriteInput } from "../types/student.types";
import {
  ACADEMIC_HEADER_LOOKUP,
  normalizeHeader,
  STUDENT_HEADER_LOOKUP,
} from "./constants";

// ── Raw academic refs (the name strings pulled from the CSV) ──────────────────
export interface AcademicRefInput {
  standardName?: string;
  batchName?: string;
  courseTypeName?: string;
  academicYearName?: string;
}

// ── Resolved mapping + per-field validation outcome ───────────────────────────
export interface ResolvedAcademic {
  standardId?: string;
  standardName?: string;
  batchId?: string;
  batchName?: string;
  courseTypeId?: string;
  courseTypeName?: string;
  academicYearId?: string;
  academicYearName?: string;
  /**
   * Soft notes — a named Standard/Batch/Course Type/Year that isn't in Setup.
   * These DO NOT block the row: the unmatched field is simply left empty and the
   * student still imports. Only a missing student name blocks an import.
   */
  warnings: string[];
}

export interface ImportLookups {
  standards: Standard[];
  batches: Batch[];
  courseTypes: CourseType[];
  years: AcademicYear[];
}

export type ImportRowStatus = "valid" | "duplicate" | "error";

export interface ImportRowPreview {
  rowNumber: number;
  name: string;
  status: ImportRowStatus;
  messages: string[];
  /** Soft validation warnings (bad mobile/email) — don't block the import. */
  warnings: string[];
  /** True when the row named an academic ref that didn't resolve in Setup. */
  missingAcademic: boolean;
  /** Student write payload with resolved ids merged in — ready to commit. */
  student: StudentWriteInput;
  resolved: ResolvedAcademic;
  raw: AcademicRefInput;
  dedup: DedupKeys;
}

// ── Matching ──────────────────────────────────────────────────────────────────
// Alias-safe key: lowercase, strip spaces/dashes/underscores so "11 A", "11-A",
// "11_a" and "11A" all collapse to "11a". Also collapses "Grade 4 ICSE",
// "grade 4 icse" and "Grade-4 ICSE" to "grade4icse" (duplicate-protection key).
export const aliasKey = (s: string): string =>
  s.trim().toLowerCase().replace(/[\s\-_]+/g, "");

export const findByName = <T extends { id: string; name: string }>(
  list: T[],
  value: string
): T | undefined => {
  const target = aliasKey(value);
  if (!target) return undefined;
  // Exact alias-key match first; fall back to a looser contains match only
  // when it is unambiguous (single candidate) to stay alias-safe without
  // silently mis-assigning.
  const exact = list.find((x) => aliasKey(x.name) === target);
  if (exact) return exact;
  const partial = list.filter(
    (x) => aliasKey(x.name).includes(target) || target.includes(aliasKey(x.name))
  );
  return partial.length === 1 ? partial[0] : undefined;
};

/**
 * Resolve the academic name refs of a single row against live Setup data.
 *
 * Rules:
 *  - every field is OPTIONAL. A named Standard/Batch/Course Type/Year that
 *    isn't in Setup is recorded as a soft warning and the field is left empty —
 *    the student still imports. (Only a missing student name blocks a row.)
 *  - a supplied batch should belong to the supplied standard; a mismatch is a
 *    warning, not a block.
 *  - missing values are inherited from the batch where possible (a batch knows
 *    its standard / course type / academic year), so a sheet that only names a
 *    batch still links the student to the full academic chain.
 */
export function resolveAcademic(
  ref: AcademicRefInput,
  lookups: ImportLookups
): ResolvedAcademic {
  const warnings: string[] = [];
  const out: ResolvedAcademic = { warnings };

  let standard: Standard | undefined;
  if (ref.standardName) {
    standard = findByName(lookups.standards, ref.standardName);
    if (!standard) warnings.push(`Standard "${ref.standardName}" not in Setup — left empty`);
    else {
      out.standardId = standard.id;
      out.standardName = standard.name;
    }
  }

  let batch: Batch | undefined;
  if (ref.batchName) {
    batch = findByName(lookups.batches, ref.batchName);
    if (!batch) warnings.push(`Batch "${ref.batchName}" not in Setup — left empty`);
    else {
      out.batchId = batch.id;
      out.batchName = batch.name;
      if (standard && batch.standardId && batch.standardId !== standard.id) {
        warnings.push(
          `Batch "${batch.name}" does not belong to standard "${standard.name}"`
        );
      }
      // Inherit standard from the batch when the sheet didn't name one.
      if (!standard && batch.standardId) {
        out.standardId = batch.standardId;
        out.standardName = batch.standardName;
      }
    }
  }

  if (ref.courseTypeName) {
    const ct = findByName(lookups.courseTypes, ref.courseTypeName);
    if (!ct) warnings.push(`Course type "${ref.courseTypeName}" not in Setup — left empty`);
    else {
      out.courseTypeId = ct.id;
      out.courseTypeName = ct.name;
    }
  } else if (batch?.courseTypeId) {
    out.courseTypeId = batch.courseTypeId;
    out.courseTypeName = batch.courseTypeName;
  }

  if (ref.academicYearName) {
    const yr = findByName(lookups.years, ref.academicYearName);
    if (!yr) warnings.push(`Academic year "${ref.academicYearName}" not in Setup — left empty`);
    else {
      out.academicYearId = yr.id;
      out.academicYearName = yr.name;
    }
  } else if (batch?.academicYearId) {
    out.academicYearId = batch.academicYearId;
  }

  return out;
}

// ── Date normalisation ────────────────────────────────────────────────────────
// Institution sheets mix ISO and day-first formats. Normalise to YYYY-MM-DD so
// the `date` columns accept them. Ambiguous d/m vs m/d is resolved day-first
// (Indian-export convention), auto-swapping when the day field is clearly > 12.
function normalizeDate(value: string): string {
  const v = value.trim();
  if (!v) return v;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parts = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (parts) {
    let day = Number(parts[1]);
    let month = Number(parts[2]);
    let year = Number(parts[3]);
    if (month > 12 && day <= 12) [day, month] = [month, day]; // m/d fallback
    if (year < 100) year += year < 50 ? 2000 : 1900;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return v; // leave anything else untouched
}

const DATE_FIELDS: (keyof StudentWriteInput)[] = [
  "dateOfBirth",
  "dateOfJoining",
  "courseExpiryDate",
];

// ── Duplicate detection ─────────────────────────────────────────────────────────
export interface DedupKeys {
  biometricId?: string;
  enrolmentNo?: string;
  grNo?: string;
  rollNumber?: string;
  mobile?: string;
  email?: string;
}

export type DuplicateIndex = Record<keyof DedupKeys, Set<string>>;

const DEDUP_LABELS: Record<keyof DedupKeys, string> = {
  biometricId: "Biometric Id",
  enrolmentNo: "Enrolment No",
  grNo: "GR No",
  rollNumber: "Roll No",
  mobile: "Mobile",
  email: "Email",
};

const dk = (v?: string): string => (v ?? "").trim().toLowerCase();

export const emptyDuplicateIndex = (): DuplicateIndex => ({
  biometricId: new Set(),
  enrolmentNo: new Set(),
  grNo: new Set(),
  rollNumber: new Set(),
  mobile: new Set(),
  email: new Set(),
});

/** Index existing students by every dedup key so a row can be matched O(1). */
export function buildDuplicateIndex(students: Student[]): DuplicateIndex {
  const idx = emptyDuplicateIndex();
  for (const s of students) {
    if (s.biometricId) idx.biometricId.add(dk(s.biometricId));
    if (s.enrolmentNo) idx.enrolmentNo.add(dk(s.enrolmentNo));
    if (s.grNo) idx.grNo.add(dk(s.grNo));
    if (s.rollNumber) idx.rollNumber.add(dk(s.rollNumber));
    const mob = s.studentContact || s.parentContact;
    if (mob) idx.mobile.add(dk(mob));
    const em = s.studentEmail || s.parentEmail;
    if (em) idx.email.add(dk(em));
  }
  return idx;
}

/** First dedup key that collides with an existing student or a prior file row. */
function findDuplicate(
  keys: DedupKeys,
  existing: DuplicateIndex,
  seen: DuplicateIndex
): string | null {
  for (const k of Object.keys(DEDUP_LABELS) as (keyof DedupKeys)[]) {
    const v = dk(keys[k]);
    if (!v) continue;
    if (existing[k].has(v)) return `${DEDUP_LABELS[k]} matches an existing student`;
    if (seen[k].has(v)) return `Duplicate ${DEDUP_LABELS[k]} within this file`;
  }
  return null;
}

function recordSeen(keys: DedupKeys, seen: DuplicateIndex): void {
  for (const k of Object.keys(DEDUP_LABELS) as (keyof DedupKeys)[]) {
    const v = dk(keys[k]);
    if (v) seen[k].add(v);
  }
}

// ── Validation (soft) ────────────────────────────────────────────────────────
const MOBILE_RE = /^[0-9+\-\s()]{7,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rowWarnings(student: StudentWriteInput): string[] {
  const w: string[] = [];
  const mob = student.studentContact || student.parentContact;
  if (mob && !MOBILE_RE.test(mob)) w.push(`Check mobile "${mob}"`);
  const em = student.studentEmail || student.parentEmail;
  if (em && !EMAIL_RE.test(em)) w.push(`Check email "${em}"`);
  return w;
}

// ── Column detection ─────────────────────────────────────────────────────────
export interface DetectedMapping {
  sourceHeader: string;
  field: string | null;
  kind: "student" | "academic" | "unmapped";
}

/** Report how each source header was auto-detected (drives the UI panel). */
export function detectColumnMappings(headers: string[]): DetectedMapping[] {
  return headers
    .filter((h) => (h ?? "").toString().trim() !== "")
    .map((h) => {
      const nh = normalizeHeader(h.toString());
      const sf = STUDENT_HEADER_LOOKUP[nh];
      if (sf) return { sourceHeader: h, field: sf, kind: "student" as const };
      const af = ACADEMIC_HEADER_LOOKUP[nh];
      if (af) return { sourceHeader: h, field: af, kind: "academic" as const };
      return { sourceHeader: h, field: null, kind: "unmapped" as const };
    });
}

// ── Missing-academic detection (for optional auto-creation) ──────────────────
export interface MissingAcademicEntry {
  /** Normalised dedup key — "Grade 4 ICSE"/"grade-4 icse" collapse to one. */
  key: string;
  /** First-seen display name, used verbatim when creating the record. */
  name: string;
}
export interface MissingBatchEntry extends MissingAcademicEntry {
  /** The standard/course-type/year named on the same row, for relationship wiring. */
  standardName?: string;
  courseTypeName?: string;
  academicYearName?: string;
}
export interface MissingAcademic {
  standards: MissingAcademicEntry[];
  courseTypes: MissingAcademicEntry[];
  years: MissingAcademicEntry[];
  batches: MissingBatchEntry[];
}

export const isMissingAcademicEmpty = (m: MissingAcademic): boolean =>
  m.standards.length === 0 &&
  m.courseTypes.length === 0 &&
  m.years.length === 0 &&
  m.batches.length === 0;

/**
 * Scan parsed records for Standard / Course Type / Academic Year / Batch names
 * that don't resolve against live Setup data — the candidates for optional
 * auto-creation. Deduped by normalised alias key, so "Grade 4 ICSE" appears
 * once however many rows (or spellings) reference it. Each missing batch also
 * carries the standard/course-type/year named alongside it so the creator can
 * wire the relationship.
 */
export function detectMissingAcademic(
  records: ImportRecord[],
  lookups: ImportLookups
): MissingAcademic {
  const standards = new Map<string, MissingAcademicEntry>();
  const courseTypes = new Map<string, MissingAcademicEntry>();
  const years = new Map<string, MissingAcademicEntry>();
  const batches = new Map<string, MissingBatchEntry>();

  const note = (
    map: Map<string, MissingAcademicEntry>,
    list: { id: string; name: string }[],
    value?: string
  ) => {
    if (!value) return;
    if (findByName(list, value)) return; // already exists in Setup
    const key = aliasKey(value);
    if (key && !map.has(key)) map.set(key, { key, name: value.trim() });
  };

  for (const { academic: a } of records) {
    note(standards, lookups.standards, a.standardName);
    note(courseTypes, lookups.courseTypes, a.courseTypeName);
    note(years, lookups.years, a.academicYearName);
    if (a.batchName && !findByName(lookups.batches, a.batchName)) {
      const key = aliasKey(a.batchName);
      if (key && !batches.has(key)) {
        batches.set(key, {
          key,
          name: a.batchName.trim(),
          standardName: a.standardName,
          courseTypeName: a.courseTypeName,
          academicYearName: a.academicYearName,
        });
      }
    }
  }

  return {
    standards: [...standards.values()],
    courseTypes: [...courseTypes.values()],
    years: [...years.values()],
    batches: [...batches.values()],
  };
}

// ── Sheet extraction ──────────────────────────────────────────────────────────
export interface ImportRecord {
  student: StudentWriteInput;
  academic: AcademicRefInput;
  dedup: DedupKeys;
}

/**
 * Map a parsed sheet (header row + data rows) into student write inputs, raw
 * academic refs and dedup keys — using alias-based, normalised header matching.
 * The first non-empty column that maps to a field wins (so "Father Mobile" and
 * "Contact No" don't clobber each other). Unknown columns are ignored.
 */
export function rowsToImportRecords(rows: string[][]): ImportRecord[] {
  if (rows.length < 2) return [];
  const normHeaders = rows[0].map((h) => normalizeHeader((h ?? "").toString()));
  return rows.slice(1).map((cells) => {
    const student: Record<string, string> = {};
    const academic: AcademicRefInput = {};
    normHeaders.forEach((nh, idx) => {
      if (!nh) return;
      const value = (cells[idx] ?? "").toString().trim();
      if (!value) return;
      const sf = STUDENT_HEADER_LOOKUP[nh];
      if (sf && !student[sf]) {
        student[sf] = DATE_FIELDS.includes(sf) ? normalizeDate(value) : value;
      }
      const af = ACADEMIC_HEADER_LOOKUP[nh];
      if (af && !academic[af]) academic[af] = value;
    });
    const dedup: DedupKeys = {
      biometricId: student.biometricId,
      enrolmentNo: student.enrolmentNo,
      grNo: student.grNo,
      rollNumber: student.rollNumber,
      mobile: student.studentContact || student.parentContact,
      email: student.studentEmail || student.parentEmail,
    };
    return { student: student as unknown as StudentWriteInput, academic, dedup };
  });
}

/** Back-compat shim — preserves the original `csvToImportRows` contract. */
export function csvToImportRows(
  rows: string[][]
): { student: StudentWriteInput; academic: AcademicRefInput }[] {
  return rowsToImportRecords(rows).map(({ student, academic }) => ({ student, academic }));
}

/**
 * Build the full preview: resolve academic refs, validate, and flag duplicates
 * against existing students (+ within the file). Centralises what the page used
 * to do inline so the UI just renders the result.
 */
export function buildImportPreview(
  records: ImportRecord[],
  lookups: ImportLookups,
  existing: DuplicateIndex
): ImportRowPreview[] {
  const seen = emptyDuplicateIndex();
  return records.map((rec, i) => {
    const name = (rec.student.name ?? "").trim();
    const resolved = resolveAcademic(rec.academic, lookups);
    // Unresolved academic refs + bad mobile/email are all soft warnings: they
    // never block a row, the unmatched fields are just left empty.
    const warnings = [...resolved.warnings, ...rowWarnings(rec.student)];
    const missingAcademic = resolved.warnings.length > 0;
    const messages: string[] = [];
    let status: ImportRowStatus = "valid";

    // Only a missing student name is a hard error.
    if (!name) {
      status = "error";
      messages.push("Missing student name");
    } else {
      const dup = findDuplicate(rec.dedup, existing, seen);
      if (dup) {
        status = "duplicate";
        messages.push(dup);
      }
    }
    recordSeen(rec.dedup, seen);

    const student: StudentWriteInput = {
      ...rec.student,
      ...(resolved.standardId ? { standardId: resolved.standardId } : {}),
      ...(resolved.batchId ? { batchId: resolved.batchId } : {}),
      ...(resolved.courseTypeId ? { courseTypeId: resolved.courseTypeId } : {}),
      ...(resolved.academicYearId ? { academicYearId: resolved.academicYearId } : {}),
    };

    return {
      rowNumber: i + 2,
      name: name || "(blank)",
      status,
      messages: [...messages, ...warnings],
      warnings,
      missingAcademic,
      student,
      resolved,
      raw: rec.academic,
      dedup: rec.dedup,
    };
  });
}

// ── Distribution analytics ─────────────────────────────────────────────────────
export interface DistributionEntry {
  name: string;
  count: number;
}

/** Count rows by a resolved label, sorted desc. Blank → "Unassigned". */
export function distributionBy(
  rows: ImportRowPreview[],
  pick: (r: ImportRowPreview) => string | undefined
): DistributionEntry[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = (pick(r) ?? "").trim() || "Unassigned";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
