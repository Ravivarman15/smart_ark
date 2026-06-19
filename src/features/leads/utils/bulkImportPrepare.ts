// Pure validation + in-memory assignment for the Bulk Lead Import engine.
// Runs over already-parsed rows: validates name + mobile, removes duplicates
// (in-file and against existing leads), maps the course, and distributes leads
// to counselors using the same "least-active" rule as assignment.service — but
// in-memory (snapshot counts + local increment) so 20k rows never hit the DB
// per row. No I/O → unit-tested.

import { normalizeMobile, matchCourse } from "./bulkImportMapping";
import type { ColumnMapping, ImportRowError, PreparedLead } from "../types/bulkImport.types";
import type { CounselorCourseMapping } from "../types/lead.types";

export interface PrepareResult {
  prepared: PreparedLead[];
  errors: ImportRowError[];      // invalid rows (missing/invalid)
  duplicates: ImportRowError[];  // skipped duplicates (in-file or existing)
}

const pick = (row: Record<string, string>, header?: string): string =>
  header ? (row[header] ?? "").trim() : "";

/**
 * Validate + normalise parsed rows against the chosen column mapping.
 * `rowOffset` is the spreadsheet row of the first data row (header is row 1, so
 * data starts at row 2 by default) — used for human-friendly error reporting.
 */
export function prepareRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  courses: string[],
  existingMobiles: Set<string>,
  source = "bulk_import",
  rowOffset = 2,
): PrepareResult {
  const prepared: PreparedLead[] = [];
  const errors: ImportRowError[] = [];
  const duplicates: ImportRowError[] = [];
  const seenInFile = new Set<string>();

  rows.forEach((raw, i) => {
    const rowNumber = i + rowOffset;
    const studentName = pick(raw, mapping.student_name);
    const mobileRaw = pick(raw, mapping.mobile);

    if (!studentName) {
      errors.push({ rowNumber, errorType: "MISSING_NAME", errorMessage: "Student name is required", raw });
      return;
    }
    if (!mobileRaw) {
      errors.push({ rowNumber, errorType: "MISSING_MOBILE", errorMessage: "Mobile number is required", raw });
      return;
    }
    const mobile = normalizeMobile(mobileRaw);
    if (!mobile) {
      errors.push({ rowNumber, errorType: "INVALID_MOBILE", errorMessage: `"${mobileRaw}" is not a valid 10-digit mobile`, raw });
      return;
    }
    if (existingMobiles.has(mobile)) {
      duplicates.push({ rowNumber, errorType: "DUPLICATE_MOBILE", errorMessage: `Mobile ${mobile} already exists as a lead`, raw });
      return;
    }
    if (seenInFile.has(mobile)) {
      duplicates.push({ rowNumber, errorType: "DUPLICATE_IN_FILE", errorMessage: `Mobile ${mobile} is duplicated within the file`, raw });
      return;
    }
    seenInFile.add(mobile);

    prepared.push({
      rowNumber,
      studentName,
      parentName: pick(raw, mapping.parent_name) || undefined,
      mobile,
      standard: pick(raw, mapping.class) || undefined,
      school: pick(raw, mapping.school) || undefined,
      board: pick(raw, mapping.board) || undefined,
      course: matchCourse(pick(raw, mapping.course), courses),
      source: pick(raw, mapping.source) || source,
      raw,
    });
  });

  return { prepared, errors, duplicates };
}

export interface Assigner {
  /** Returns a counselor profile id or null (→ caller marks UNASSIGNED). */
  assign(course?: string): string | null;
}

/**
 * Build an in-memory counselor assigner mirroring assignment.service's rule:
 * course-specific mappings win, highest priority tier, then fewest active leads
 * (local snapshot incremented on each assignment → natural round-robin).
 */
export function buildAssigner(
  mappings: CounselorCourseMapping[],
  activeCounts: Map<string, number>,
): Assigner {
  const counts = new Map(activeCounts);
  return {
    assign(course?: string): string | null {
      if (!mappings.length) return null;
      const matched = mappings.filter((m) =>
        !m.course ? true : course ? m.course.toLowerCase() === course.toLowerCase() : false,
      );
      if (!matched.length) return null;
      const courseSpecific = matched.filter((m) => m.course);
      const pool = courseSpecific.length ? courseSpecific : matched;
      const maxPriority = Math.max(...pool.map((m) => m.priority));
      const top = pool.filter((m) => m.priority === maxPriority);
      const ids = Array.from(new Set(top.map((m) => m.counselorId)));
      if (!ids.length) return null;
      ids.sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
      const chosen = ids[0];
      counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
      return chosen;
    },
  };
}
