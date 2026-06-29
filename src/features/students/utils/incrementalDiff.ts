// ──────────────────────────────────────────────────────────────────────────────
// INCREMENTAL IMPORT — field-level diff
//
// When a re-exported sheet is imported, a matched student should be UPDATED in
// place, not duplicated, and only the fields that actually CHANGED should be
// written — never overwriting existing data with blanks. This pure module
// computes the per-field diff (previous → new) and the minimal update patch.
//
// Academic placement (standard / batch / course type / year / campus) is
// deliberately EXCLUDED: a class promotion must go through the dedicated
// year-transfer flow so historical academic records are never silently
// overwritten (Final-phase §5).
// ──────────────────────────────────────────────────────────────────────────────

import type { Student, StudentWriteInput } from "../types/student.types";

export interface FieldDiff {
  field: keyof StudentWriteInput;
  label: string;
  prev: string;
  next: string;
}

type FieldSpec = {
  key: keyof StudentWriteInput;
  label: string;
  existing: (s: Student) => string | undefined;
};

// Personal / contact / identity fields institutions revise month-to-month.
const DIFF_FIELDS: FieldSpec[] = [
  { key: "rollNumber", label: "Roll number", existing: (s) => s.rollNumber },
  { key: "gender", label: "Gender", existing: (s) => s.gender },
  { key: "bloodGroup", label: "Blood group", existing: (s) => s.bloodGroup },
  { key: "dateOfBirth", label: "Date of birth", existing: (s) => s.dateOfBirth },
  { key: "address", label: "Address", existing: (s) => s.address },
  { key: "studentEmail", label: "Student email", existing: (s) => s.studentEmail },
  { key: "studentContact", label: "Student mobile", existing: (s) => s.studentContact },
  { key: "parentName", label: "Parent name", existing: (s) => s.parentName },
  { key: "parentContact", label: "Parent mobile", existing: (s) => s.parentContact },
  { key: "parentContact2", label: "Alternate mobile", existing: (s) => s.parentContact2 },
  { key: "parentEmail", label: "Parent email", existing: (s) => s.parentEmail },
  { key: "motherName", label: "Mother name", existing: (s) => s.motherName },
  { key: "motherContact", label: "Mother mobile", existing: (s) => s.motherContact },
  { key: "guardianName", label: "Guardian name", existing: (s) => s.guardianName },
  { key: "guardianContact", label: "Guardian mobile", existing: (s) => s.guardianContact },
  { key: "category", label: "Category / Board", existing: (s) => s.category },
  { key: "groupName", label: "Group", existing: (s) => s.groupName },
  { key: "enrolmentNo", label: "Admission / Enrolment no", existing: (s) => s.enrolmentNo },
  { key: "grNo", label: "GR no", existing: (s) => s.grNo },
];

const norm = (v?: string): string => (v ?? "").trim();

/**
 * Fields that changed between an existing student and an incoming row. A field
 * is "changed" only when the incoming value is NON-EMPTY and differs — so a
 * blank cell never wipes existing data.
 */
export function diffStudent(existing: Student, incoming: StudentWriteInput): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const f of DIFF_FIELDS) {
    const next = norm(incoming[f.key] as string | undefined);
    if (!next) continue; // never overwrite with a blank
    const prev = norm(f.existing(existing));
    if (next !== prev) out.push({ field: f.key, label: f.label, prev, next });
  }
  return out;
}

/** Minimal update payload — only the changed fields. Empty ⇒ nothing to update. */
export function changedPatch(
  existing: Student,
  incoming: StudentWriteInput
): Partial<StudentWriteInput> {
  const patch: Partial<StudentWriteInput> = {};
  for (const d of diffStudent(existing, incoming)) {
    (patch as Record<string, string>)[d.field] = d.next;
  }
  return patch;
}

/** True when the incoming row carries academic placement different from the
 *  existing record — a promotion candidate (handled via year-transfer, NOT a
 *  silent update). */
export function isPromotionCandidate(existing: Student, incoming: StudentWriteInput): boolean {
  const yChanged =
    !!incoming.academicYearId && incoming.academicYearId !== (existing.academicYearId ?? "");
  const bChanged = !!incoming.batchId && incoming.batchId !== (existing.batchId ?? "");
  return yChanged || bChanged;
}
