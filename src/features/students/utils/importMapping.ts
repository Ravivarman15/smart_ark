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
import {
  buildExistingIndex,
  classify,
  emptyDuplicateIndex as emptyEngineIndex,
  findBestMatch,
  groupFamilies,
  indexAdd,
  isValidMobile,
  suggestedActionFor,
  type DuplicateAction,
  type DuplicateIndex,
  type IdentityFields,
} from "./duplicateEngine";

export type { DuplicateIndex, DuplicateAction } from "./duplicateEngine";
import { cleanFieldValue, cleanText } from "./dataCleaning";

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

// "possible_duplicate" = enough identity overlap to warrant review, but not a
// confirmed match — the row still imports unless the operator skips it.
export type ImportRowStatus = "valid" | "possible_duplicate" | "duplicate" | "error";

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
  // ── Weighted duplicate-engine output ──
  /** 0–100 confidence this row matches an existing/earlier student. */
  confidence: number;
  /** Identity fields that agreed with the matched student. */
  matchedFields: string[];
  /** Matched existing student id (for Merge / Update Existing actions). */
  existingId?: string;
  /** Family this row belongs to (shared parent mobile / name+address). */
  familyId?: string;
  /** Default action the UI proposes for a flagged row. */
  suggestedAction: DuplicateAction;
  /** A mobile was supplied but is malformed. */
  invalidMobile: boolean;
  /** Key identity/contact fields are missing (incomplete record). */
  missingData: boolean;
  /** Field-level validation notes (missing class/admission/year, bad dob/email…). */
  validation: string[];
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

// ── Duplicate detection ─────────────────────────────────────────────────────────
// The weighted, family-aware engine lives in `duplicateEngine.ts`. This layer
// only adapts students / import rows into the engine's IdentityFields. A mobile
// number is NEVER a stand-alone duplicate key here — siblings sharing a parent
// mobile score 10 (a family signal) and import as distinct students.
//
// DedupKeys is retained ONLY as a thin carrier for the error-report CSV columns.
export interface DedupKeys {
  biometricId?: string;
  enrolmentNo?: string;
  grNo?: string;
  rollNumber?: string;
  mobile?: string;
  email?: string;
}

/** Adapt an existing student into the engine's identity shape. */
export function studentToIdentity(st: Student): IdentityFields {
  return {
    studentId: st.biometricId,
    admissionNo: st.enrolmentNo,
    grNo: st.grNo,
    rollNumber: st.rollNumber,
    name: st.name,
    dob: st.dateOfBirth,
    fatherName: st.parentName,
    motherName: st.motherName,
    parentMobile: st.parentContact || st.studentContact || st.motherContact,
    parentEmail: st.parentEmail || st.studentEmail,
    className: st.batch || st.standardName,
    address: st.address,
  };
}

/** Adapt a parsed import row into the engine's identity shape. */
export function recordToIdentity(rec: ImportRecord): IdentityFields {
  const st = rec.student;
  return {
    studentId: st.biometricId,
    admissionNo: st.enrolmentNo,
    grNo: st.grNo,
    rollNumber: st.rollNumber,
    name: st.name,
    dob: st.dateOfBirth,
    fatherName: st.parentName,
    motherName: st.motherName,
    parentMobile: st.parentContact || st.studentContact || st.motherContact,
    parentEmail: st.parentEmail || st.studentEmail,
    className: rec.academic.batchName || rec.academic.standardName,
    academicYear: rec.academic.academicYearName,
    address: st.address,
  };
}

/** Build a weighted lookup index over existing students. */
export function buildDuplicateIndex(students: Student[]): DuplicateIndex {
  return buildExistingIndex(students.map((st) => ({ id: st.id, identity: studentToIdentity(st) })));
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

/** A cleaned date is valid only if it is a real YYYY-MM-DD calendar date. */
const isValidDate = (v: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
};
const dkv = (x?: string): string => (x ?? "").trim().toLowerCase();

// ── Column detection ─────────────────────────────────────────────────────────
export interface DetectedMapping {
  sourceHeader: string;
  field: string | null;
  kind: "student" | "academic" | "unmapped";
}

/** Selectable targets for the manual column-mapping override UI. */
export const OVERRIDE_TARGETS: { value: string; label: string }[] = [
  { value: "name", label: "Student Name" },
  { value: "rollNumber", label: "Roll Number" },
  { value: "enrolmentNo", label: "Admission / Enrolment No" },
  { value: "grNo", label: "GR No" },
  { value: "biometricId", label: "Student ID (Biometric)" },
  { value: "gender", label: "Gender" },
  { value: "dateOfBirth", label: "Date of Birth" },
  { value: "parentName", label: "Father / Parent Name" },
  { value: "parentContact", label: "Parent Mobile" },
  { value: "parentEmail", label: "Parent Email" },
  { value: "motherName", label: "Mother Name" },
  { value: "motherContact", label: "Mother Mobile" },
  { value: "guardianName", label: "Guardian Name" },
  { value: "guardianContact", label: "Guardian Mobile" },
  { value: "studentContact", label: "Student Mobile" },
  { value: "studentEmail", label: "Student Email" },
  { value: "address", label: "Address" },
  { value: "standardName", label: "Standard (academic)" },
  { value: "batchName", label: "Class / Batch (academic)" },
  { value: "courseTypeName", label: "Course Type (academic)" },
  { value: "academicYearName", label: "Academic Year (academic)" },
  { value: "", label: "— Ignore column —" },
];

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

/** Academic-ref field keys — used to route a manual override to the right bag. */
const ACADEMIC_FIELDS = new Set<string>([
  "standardName",
  "batchName",
  "courseTypeName",
  "academicYearName",
]);

/**
 * Manual column-mapping override: normalised-header → target field key (a
 * student field or academic ref field), or "" to ignore the column. When a
 * header has an override it wins over auto-detection.
 */
export type ColumnOverrides = Record<string, string>;

/**
 * Map a parsed sheet (header row + data rows) into student write inputs, raw
 * academic refs and dedup keys — using alias-based, normalised header matching.
 * The first non-empty column that maps to a field wins (so "Father Mobile" and
 * "Contact No" don't clobber each other). Unknown columns are ignored. A manual
 * `overrides` map (by normalised header) takes precedence over auto-detection.
 */
export function rowsToImportRecords(
  rows: string[][],
  overrides?: ColumnOverrides
): ImportRecord[] {
  if (rows.length < 2) return [];
  const normHeaders = rows[0].map((h) => normalizeHeader((h ?? "").toString()));
  const resolveField = (nh: string): { field: string; academic: boolean } | null => {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, nh)) {
      const ov = overrides[nh];
      if (!ov) return null; // explicitly ignored
      return { field: ov, academic: ACADEMIC_FIELDS.has(ov) };
    }
    const sf = STUDENT_HEADER_LOOKUP[nh];
    if (sf) return { field: sf, academic: false };
    const af = ACADEMIC_HEADER_LOOKUP[nh];
    if (af) return { field: af, academic: true };
    return null;
  };
  return rows.slice(1).map((cells) => {
    const student: Record<string, string> = {};
    const academic: AcademicRefInput = {};
    normHeaders.forEach((nh, idx) => {
      if (!nh) return;
      const value = (cells[idx] ?? "").toString().trim();
      if (!value) return;
      const target = resolveField(nh);
      if (!target) return;
      // Clean every cell as it is mapped: phones → digits, names → Title Case,
      // dates → YYYY-MM-DD, stray whitespace collapsed.
      if (target.academic) {
        const af = target.field as keyof AcademicRefInput;
        if (!academic[af]) academic[af] = cleanText(value);
      } else if (!student[target.field]) {
        student[target.field] = cleanFieldValue(target.field, value);
      }
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
  // Identities + family grouping are computed up-front over the whole file so
  // siblings (shared parent mobile) land in one family and are NEVER flagged as
  // duplicates of each other.
  const identities = records.map(recordToIdentity);
  const { familyByRow } = groupFamilies(identities);
  // In-file "seen" index — grows as we walk rows, so a later row can match an
  // earlier row in the same file (a genuine re-listing), but a row never matches
  // itself.
  const seen = emptyEngineIndex();
  // In-file duplicate-key sets for field-level validation notes.
  const seenAdmission = new Set<string>();
  const seenStudentId = new Set<string>();
  const seenRoll = new Set<string>();

  return records.map((rec, i) => {
    const identity = identities[i];
    const name = (rec.student.name ?? "").trim();
    const resolved = resolveAcademic(rec.academic, lookups);
    // Unresolved academic refs + bad mobile/email are all soft warnings: they
    // never block a row, the unmatched fields are just left empty.
    const warnings = [...resolved.warnings, ...rowWarnings(rec.student)];
    const missingAcademic = resolved.warnings.length > 0;
    const messages: string[] = [];

    const mob = rec.student.parentContact || rec.student.studentContact;
    const invalidMobile = !!mob && !isValidMobile(mob);
    const missingData = !isValidMobile(identity.parentMobile) || !identity.className;

    let status: ImportRowStatus = "valid";
    let confidence = 0;
    let matchedFields: string[] = [];
    let existingId: string | undefined;

    // Only a missing student name is a hard error.
    if (!name) {
      status = "error";
      messages.push("Missing student name");
    } else {
      // Score against existing students AND earlier rows in this file; the
      // stronger match wins. The engine guarantees mobile/email/name alone can
      // never reach the duplicate band.
      const existingMatch = findBestMatch(identity, existing);
      const inFileMatch = findBestMatch(identity, seen);
      const winner =
        existingMatch.score >= inFileMatch.score ? existingMatch : inFileMatch;
      const fromExisting = winner === existingMatch;

      confidence = winner.score;
      matchedFields = winner.matchedFields;
      // The engine's "new" band maps to the importer's "valid" status.
      const band = classify(winner.score);
      status = band === "new" ? "valid" : band;
      if (status !== "valid") {
        existingId = fromExisting ? winner.existingId : undefined;
        const where = fromExisting ? "an existing student" : "an earlier row in this file";
        const verb = status === "duplicate" ? "Matches" : "Possible match with";
        messages.push(
          `${verb} ${where} (${winner.score}%${
            matchedFields.length ? ` — ${matchedFields.join(", ")}` : ""
          })`
        );
      }
    }
    // ── Field-level validation (warnings — never block except missing name) ──
    const validation: string[] = [];
    const admKey = dkv(identity.admissionNo);
    const grKey = dkv(identity.grNo);
    const sidKey = dkv(identity.studentId);
    const rollKey = dkv(identity.rollNumber);
    if (name) {
      if (!identity.className) validation.push("Missing class");
      if (!admKey && !grKey) validation.push("Missing admission number");
      if (!isValidMobile(identity.parentMobile)) validation.push("Missing/invalid parent mobile");
      const dobV = rec.student.dateOfBirth;
      if (dobV && !isValidDate(dobV)) validation.push("Invalid date of birth");
      const emailV = rec.student.parentEmail || rec.student.studentEmail;
      if (emailV && !EMAIL_RE.test(emailV)) validation.push("Invalid email");
      if (mob && !isValidMobile(mob)) validation.push("Invalid phone");
      if (!resolved.academicYearId) validation.push("Missing academic year");
      if (admKey && (existing.byAdmission.has(admKey) || seenAdmission.has(admKey)))
        validation.push("Duplicate admission number");
      if (sidKey && (existing.byStudentId.has(sidKey) || seenStudentId.has(sidKey)))
        validation.push("Duplicate student id");
      if (rollKey && (existing.byRoll.has(rollKey) || seenRoll.has(rollKey)))
        validation.push("Duplicate roll number");
    }
    if (admKey) seenAdmission.add(admKey);
    if (sidKey) seenStudentId.add(sidKey);
    if (rollKey) seenRoll.add(rollKey);

    // Record this row so subsequent rows can match it (in-file dedup).
    indexAdd(seen, identity);

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
      confidence,
      matchedFields,
      existingId,
      familyId: familyByRow.get(i),
      suggestedAction: suggestedActionFor(status === "error" ? "new" : status),
      invalidMobile,
      missingData,
      validation,
    };
  });
}

// ── Family + preview analytics ────────────────────────────────────────────────
export interface FamilyDashboard {
  familiesCreated: number;
  parents: number;
  children: number;
  singleChildFamilies: number;
  multiChildFamilies: number;
  largestFamily: number;
  sharingMobile: number;
  sharingAddress: number;
  sharingParentName: number;
}

const countShared = (rows: ImportRowPreview[], pick: (r: ImportRowPreview) => string): number => {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let n = 0;
  for (const r of rows) {
    const k = pick(r);
    if (k && (counts.get(k) ?? 0) > 1) n += 1;
  }
  return n;
};

/** Summarise the family structure of an import preview for the dashboard. */
export function buildFamilyDashboard(rows: ImportRowPreview[]): FamilyDashboard {
  const importable = rows.filter((r) => r.status !== "error");
  const sizes = new Map<string, number>();
  for (const r of importable) if (r.familyId) sizes.set(r.familyId, (sizes.get(r.familyId) ?? 0) + 1);
  const sizeValues = [...sizes.values()];
  return {
    familiesCreated: sizes.size,
    parents: sizes.size,
    children: importable.filter((r) => r.familyId).length,
    singleChildFamilies: sizeValues.filter((n) => n === 1).length,
    multiChildFamilies: sizeValues.filter((n) => n > 1).length,
    largestFamily: sizeValues.reduce((m, n) => Math.max(m, n), 0),
    sharingMobile: countShared(importable, (r) =>
      normMobileKey(r.student.parentContact || r.student.studentContact)
    ),
    sharingAddress: countShared(importable, (r) => (r.student.address ?? "").trim().toLowerCase()),
    sharingParentName: countShared(importable, (r) =>
      (r.student.parentName ?? r.student.motherName ?? "").trim().toLowerCase()
    ),
  };
}

const normMobileKey = (v?: string): string => {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 7 ? (d.length > 10 ? d.slice(-10) : d) : "";
};

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
