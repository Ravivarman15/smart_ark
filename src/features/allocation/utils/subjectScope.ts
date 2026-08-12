// ──────────────────────────────────────────────────────────────────────────────
// SUBJECT SCOPING
//
// A subject belongs to a standard. Std 2 has its own subjects, Std 4 has
// different ones, and a teacher covering both across a morning must be offered
// the RIGHT list each time they pick a standard.
//
// ┌── WHY THE OLD BEHAVIOUR WAS WRONG IN TWO SEPARATE WAYS ────────────────┐
// │ The scheduling form loaded subjects with:                              │
// │                                                                        │
// │   useSubjects({ standardId: form.standardIds[0] })                     │
// │                                                                        │
// │ 1. PRIMARY-ONLY. `standardIds[0]` is whichever standard was clicked    │
// │    FIRST. Pick Std 2 then Std 4 and the dropdown still lists Std 2's   │
// │    subjects — the exact complaint. Deselecting back to Std 4 alone     │
// │    fixed it, which made the bug look random.                           │
// │                                                                        │
// │ 2. SHARED SUBJECTS VANISHED. That hook issues                          │
// │    `.eq("standard_id", X)`, which excludes rows where standard_id IS   │
// │    NULL — the institute-wide subjects (Library, PT, Moral Science).    │
// │    They were unreachable from this form entirely, while the batch      │
// │    timetable page included them. Two screens, two answers, same data.  │
// │                                                                        │
// │ Both are fixed by loading subjects UNSCOPED once and filtering here:   │
// │ the union across every selected standard, plus the shared ones.        │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import type { Subject } from "@/features/setup/types/setup.types";

export interface SubjectGroup {
  /** Standard id, or `null` for institute-wide subjects. */
  standardId: string | null;
  label: string;
  subjects: Subject[];
}

/**
 * Subjects offered for the given standards, grouped by standard.
 *
 * With no standard selected, everything is returned — the operator has not
 * narrowed anything yet, and an empty dropdown would read as "no subjects
 * exist" rather than "choose a standard first".
 */
export const subjectsForStandards = (
  subjects: Subject[],
  standardIds: string[],
  standardName: (id: string) => string,
): SubjectGroup[] => {
  const active = subjects.filter((s) => s.isActive !== false);

  if (standardIds.length === 0) {
    return active.length ? [{ standardId: null, label: "All subjects", subjects: active }] : [];
  }

  const groups: SubjectGroup[] = [];
  for (const id of standardIds) {
    const forStandard = active.filter((s) => s.standardId === id);
    // A standard with no subjects still gets a group, so the UI can say WHICH
    // standard is unconfigured rather than showing one undifferentiated empty
    // list when a teacher covers three.
    groups.push({ standardId: id, label: standardName(id), subjects: forStandard });
  }

  const shared = active.filter((s) => !s.standardId);
  if (shared.length) {
    groups.push({ standardId: null, label: "All standards", subjects: shared });
  }
  return groups;
};

/** Flat list of every subject id the current standard selection permits. */
export const allowedSubjectIds = (groups: SubjectGroup[]): Set<string> =>
  new Set(groups.flatMap((g) => g.subjects.map((s) => s.id)));

/**
 * Is the chosen subject still valid for the chosen standards?
 *
 * Called after every standard change. Without it, picking Std 2 → Maths, then
 * switching to Std 4, leaves Std 2's Maths silently attached to a Std 4 class:
 * the dropdown shows the right options while the FORM still holds the wrong
 * value, and the class is saved against a subject that standard does not
 * teach. A stale value that no longer appears in its own list is worse than a
 * blank one, because nothing on screen reveals it.
 */
export const isSubjectStillValid = (subjectId: string, groups: SubjectGroup[]): boolean =>
  !subjectId || allowedSubjectIds(groups).has(subjectId);
