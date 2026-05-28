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
import type { StudentWriteInput } from "../types/student.types";
import { IMPORT_ACADEMIC_COLUMN_MAP, IMPORT_COLUMN_MAP } from "./constants";

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
  /** Hard errors — block the row. */
  errors: string[];
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
  /** Student write payload with resolved ids merged in — ready to commit. */
  student: StudentWriteInput;
  resolved: ResolvedAcademic;
  raw: AcademicRefInput;
}

// ── Matching ──────────────────────────────────────────────────────────────────
// Alias-safe key: lowercase, strip spaces/dashes/underscores so "11 A", "11-A",
// "11_a" and "11A" all collapse to "11a".
const aliasKey = (s: string): string =>
  s.trim().toLowerCase().replace(/[\s\-_]+/g, "");

const findByName = <T extends { id: string; name: string }>(
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
 *  - standard / batch / course type / academic year must each exist when a
 *    value is supplied (a blank cell is fine — the field is optional).
 *  - a supplied batch must belong to the supplied standard (when both given
 *    and the batch is linked to a standard in Setup).
 *  - missing values are inherited from the batch where possible (a batch knows
 *    its standard / course type / academic year), so a sheet that only names a
 *    batch still links the student to the full academic chain.
 */
export function resolveAcademic(
  ref: AcademicRefInput,
  lookups: ImportLookups
): ResolvedAcademic {
  const errors: string[] = [];
  const out: ResolvedAcademic = { errors };

  let standard: Standard | undefined;
  if (ref.standardName) {
    standard = findByName(lookups.standards, ref.standardName);
    if (!standard) errors.push(`Standard "${ref.standardName}" not found in Setup`);
    else {
      out.standardId = standard.id;
      out.standardName = standard.name;
    }
  }

  let batch: Batch | undefined;
  if (ref.batchName) {
    batch = findByName(lookups.batches, ref.batchName);
    if (!batch) errors.push(`Batch "${ref.batchName}" not found in Setup`);
    else {
      out.batchId = batch.id;
      out.batchName = batch.name;
      if (standard && batch.standardId && batch.standardId !== standard.id) {
        errors.push(
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
    if (!ct) errors.push(`Course type "${ref.courseTypeName}" not found in Setup`);
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
    if (!yr) errors.push(`Academic year "${ref.academicYearName}" not found in Setup`);
    else {
      out.academicYearId = yr.id;
      out.academicYearName = yr.name;
    }
  } else if (batch?.academicYearId) {
    out.academicYearId = batch.academicYearId;
  }

  return out;
}

// ── CSV extraction ────────────────────────────────────────────────────────────
/**
 * Map a parsed CSV (with header row) into student write inputs PLUS the raw
 * academic name refs. Old templates without academic columns yield empty refs,
 * so they still import — only the new columns add mapping behaviour.
 */
export function csvToImportRows(
  rows: string[][]
): { student: StudentWriteInput; academic: AcademicRefInput }[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const student: Record<string, string> = {};
    const academic: AcademicRefInput = {};
    header.forEach((h, idx) => {
      const value = (cells[idx] ?? "").trim();
      const studentField = IMPORT_COLUMN_MAP[h];
      if (studentField) student[studentField] = value;
      const academicField = IMPORT_ACADEMIC_COLUMN_MAP[h];
      if (academicField && value) academic[academicField] = value;
    });
    return { student: student as unknown as StudentWriteInput, academic };
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
