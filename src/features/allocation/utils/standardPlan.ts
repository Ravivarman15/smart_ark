// ──────────────────────────────────────────────────────────────────────────────
// PER-STANDARD CLASS PLAN
//
// A combined class is not "these standards, that subject". A teacher who takes
// 2nd STD and 3rd STD in the same period teaches each of them a DIFFERENT
// subject, often out of a different batch. The old model held one subject for
// the whole room, so the timetable, the attendance sheet and every report
// printed one standard's subject against all of them.
//
// A plan is an ordered list of entries — one per standard. Entry 0 is the
// PRIMARY: the scalar standard_id / subject_id / batch_id / section_id columns
// keep mirroring it, so nothing that already reads them has to change.
//
// Everything here is pure. The interesting rules (when is an entry finished?
// which standard is blocking? what should the class be called?) are decisions,
// not rendering, and they are worth testing without a database.
// ──────────────────────────────────────────────────────────────────────────────

import type { Batch, Subject } from "@/features/setup/types/setup.types";
import type { ClassSchedule, ClassStandardPlanEntry, Section } from "../types/allocation.types";

/**
 * "Every batch of this standard" — an explicit choice, not the absence of one.
 *
 * The whole point of the flow is that a standard is not finished until the
 * operator has said which children it means. An empty select cannot express
 * "I considered it and I want them all", so a sentinel does; it is stripped
 * before the plan reaches the service, where an absent batch already means the
 * whole standard.
 */
export const ALL_BATCHES = "__all";

/** One row of the builder while it is being filled in. */
export interface PlanDraft {
  standardId: string;
  subjectId: string;
  /** "" = not decided yet, {@link ALL_BATCHES}, or a batch id. */
  batchId: string;
  sectionId: string;
}

export const newDraft = (standardId: string): PlanDraft => ({
  standardId,
  subjectId: "",
  batchId: "",
  sectionId: "",
});

// ── What each standard may be given ─────────────────────────────────────────
//
// All three lookups are client-side filters over UNSCOPED lists. The server-side
// `{ standardId }` variants take a single standard, which is exactly the bug
// this module exists to remove — and `.eq("standard_id", x)` additionally drops
// the institute-wide rows (standard_id IS NULL) that every standard shares.

/** Subjects a standard may be taught: its own, plus institute-wide ones. */
export const subjectsForStandard = (subjects: Subject[], standardId: string): Subject[] =>
  subjects.filter((s) => s.isActive !== false && (s.standardId === standardId || !s.standardId));

/** Only the standard's OWN subjects — used to say whether it is configured. */
export const ownSubjectsForStandard = (subjects: Subject[], standardId: string): Subject[] =>
  subjects.filter((s) => s.isActive !== false && s.standardId === standardId);

/** Batches a standard may draw from: its own, plus unscoped ones. */
export const batchesForStandard = (batches: Batch[], standardId: string): Batch[] =>
  batches.filter((b) => b.standardId === standardId || !b.standardId);

/** Sections belong to exactly one standard. */
export const sectionsForStandard = (sections: Section[], standardId: string): Section[] =>
  sections.filter((s) => s.standardId === standardId);

// ── Completeness ────────────────────────────────────────────────────────────

/** What the standard actually has available, which decides what it must be asked. */
export interface DraftOptions {
  hasSubjects: boolean;
  hasBatches: boolean;
}

/**
 * Is this standard fully specified?
 *
 * Subject is required — a class with no subject is the thing being fixed.
 * Batch is required ONLY where batches exist, because an institute that has
 * never created one would otherwise be unable to schedule anything. Where they
 * do exist, {@link ALL_BATCHES} satisfies it: the requirement is a decision,
 * not a narrowing.
 *
 * A standard with NO subjects configured is treated as complete on purpose.
 * Blocking there would trap the operator in a form they can neither finish nor
 * escape, over a Setup problem the UI names explicitly instead.
 */
export const isDraftComplete = (d: PlanDraft, o: DraftOptions): boolean => {
  if (!o.hasSubjects) return true;
  if (!d.subjectId) return false;
  return !o.hasBatches || !!d.batchId;
};

/**
 * The first standard still missing something, or null.
 *
 * This is what gates "add another standard". Returning the ENTRY rather than a
 * boolean is what lets the UI name it — "choose a subject for 3rd STD" is
 * actionable where "complete the form" is not.
 */
export const firstIncompleteDraft = (
  drafts: PlanDraft[],
  optionsFor: (standardId: string) => DraftOptions,
): PlanDraft | null =>
  drafts.find((d) => !isDraftComplete(d, optionsFor(d.standardId))) ?? null;

export const isPlanComplete = (
  drafts: PlanDraft[],
  optionsFor: (standardId: string) => DraftOptions,
): boolean => firstIncompleteDraft(drafts, optionsFor) === null;

// ── Draft → form values ─────────────────────────────────────────────────────

/**
 * Collapse the builder into the shape the schedule form and service take.
 *
 * The scalars come from entry 0 and are NOT a summary of the rest: they are the
 * primary standard's own subject/batch/section, which is what every existing
 * filter, report and RLS predicate has always meant by them.
 */
export const draftsToInput = (
  drafts: PlanDraft[],
): {
  standardIds: string[];
  subjectId: string;
  batchId: string;
  sectionId: string;
  standardPlan: ClassStandardPlanEntry[];
} => {
  const plan: ClassStandardPlanEntry[] = drafts
    .filter((d) => d.standardId)
    .map((d) => ({
      standardId: d.standardId,
      subjectId: d.subjectId || undefined,
      // The sentinel never leaves the form. Downstream, "no batch" already
      // means the whole standard, so the two agree.
      batchId: d.batchId && d.batchId !== ALL_BATCHES ? d.batchId : undefined,
      sectionId: d.sectionId || undefined,
    }));
  const primary = plan[0];
  return {
    standardIds: plan.map((e) => e.standardId),
    subjectId: primary?.subjectId ?? "",
    batchId: primary?.batchId ?? "",
    sectionId: primary?.sectionId ?? "",
    standardPlan: plan,
  };
};

/** Batch narrowing per standard, for the roster query. */
export const batchByStandard = (
  plan: readonly ClassStandardPlanEntry[],
): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const e of plan) out[e.standardId] = e.batchId;
  return out;
};

// ── Reading a stored class back ─────────────────────────────────────────────

/**
 * The plan of a class, derived where the column is empty.
 *
 * Rows written before this column existed are not migrated — an UPDATE across
 * every tenant's timetable to store what a pure function can compute is a
 * rewrite of historical records for no gain. Their one subject genuinely DID
 * apply to every standard on the row, because that was the model, so repeating
 * it per standard reports the row faithfully rather than inventing detail.
 */
export const effectivePlan = (c: ClassSchedule): ClassStandardPlanEntry[] => {
  if (c.standardPlan?.length) return c.standardPlan;
  return c.standardIds.map((id, i) => ({
    standardId: id,
    standardName: c.standardNames[i] ?? (i === 0 ? c.standardName : undefined),
    subjectId: c.subjectId,
    subjectName: c.subjectName,
    batchId: c.batchId,
    batchName: c.batchName,
    sectionId: c.sectionId,
    sectionName: c.sectionName,
  }));
};

/**
 * Does this class teach different subjects to different standards?
 *
 * The distinction drives every label: "Std 2 + Std 4 · Maths" is the correct,
 * shorter rendering when the room really is doing one subject, and a lie when
 * it is not.
 */
export const isSplitSubject = (c: ClassSchedule): boolean => {
  const plan = c.standardPlan ?? [];
  if (plan.length < 2) return false;
  return new Set(plan.map((e) => e.subjectId ?? "")).size > 1;
};

/** "2nd STD · Maths + 3rd STD · Science" — one segment per standard. */
export const splitSubjectTitle = (c: ClassSchedule): string =>
  effectivePlan(c)
    .map((e) => [e.standardName, e.sectionName, e.subjectName].filter(Boolean).join(" · "))
    .filter(Boolean)
    .join("  +  ");
