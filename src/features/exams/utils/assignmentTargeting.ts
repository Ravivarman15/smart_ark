import type { AssignmentDraft, AssignmentScope } from "../types/mcqExam.types";

// ═════════════════════════════════════════════════════════════════════════════
// WHO IS THIS TEST FOR
//
// One pure module deciding which students an exam's assignment scopes resolve
// to. The staff UI uses it to show a live count; `_shared/testEngine.ts` asks
// the same question in SQL on every attempt.
//
// ┌── THE TWO ANSWERS MUST AGREE, AND ONE OF THEM IS AUTHORITATIVE ────────┐
// │ The count on the assignment screen is a PREVIEW. The check that        │
// │ actually admits a student runs on the server, against the database, on │
// │ every single start — because hiding a card is not access control and a │
// │ number computed in a browser is not a permission.                      │
// │                                                                        │
// │ They are kept in step by sharing this file's RULES (below) rather than │
// │ its code: the SQL cannot import TypeScript. `assignmentTargeting.test` │
// │ pins the rules so a change here without a matching change there fails  │
// │ the build rather than quietly admitting the wrong students.            │
// └────────────────────────────────────────────────────────────────────────┘
//
// ── THE RULES ───────────────────────────────────────────────────────────────
//   no assignments  → the WHOLE ORGANIZATION. This is the pre-existing meaning
//                     of an unassigned exam; narrowing it here would silently
//                     close exams that are already running.
//   scope "all"     → the whole organization, said explicitly
//   scope "standard"→ every student of that standard
//   scope "batch"   → every student of that batch
//   scope "student" → exactly that student
//   scope "subject" → NOT a targeting scope. An exam whose ONLY rows are
//                     subject reaches nobody, which is what it did before this
//                     module existed. `_shared/testEngine.ts` already agrees:
//                     rows exist, none match, so no student is admitted.
//
// Scopes are a UNION, never an intersection. Selecting Class 10 and also
// naming a student from Class 12 assigns to both — which is what a person
// building a list expects, and the opposite (intersection) would silently
// assign to nobody.
// ═════════════════════════════════════════════════════════════════════════════

/** The minimum a student row needs for targeting. */
export interface TargetableStudent {
  id: string;
  batchId?: string | null;
  standardId?: string | null;
  isActive?: boolean;
}

/**
 * `subject` is stored as an assignment scope but does not target anybody — it
 * records which subject the exam belongs to, for filtering. Treating it as a
 * target would assign a test to zero students and look like a bug in the roster.
 */
export const TARGETING_SCOPES: AssignmentScope[] = [
  "all",
  "standard",
  "batch",
  "student",
];

export const isTargetingScope = (s: AssignmentScope): boolean =>
  TARGETING_SCOPES.includes(s);

/** Scopes that actually narrow the audience — everything except "all". */
const narrowing = (drafts: AssignmentDraft[]): AssignmentDraft[] =>
  drafts.filter((d) => isTargetingScope(d.scopeType) && d.scopeType !== "all");

/**
 * Does this exam target the whole organization?
 *
 * True in exactly two cases: an explicit "all", or NO ASSIGNMENT ROWS AT ALL.
 *
 * Note what is deliberately excluded — an exam whose only rows are `subject`.
 * Those carry no audience, so it is tempting to treat them as "nothing narrows
 * it, therefore everyone". That would be a behaviour change on live data in the
 * worst possible direction: before this module existed, a subject-only exam
 * reached NOBODY, and quietly promoting it to reach every student in the
 * institution is not a fix anyone asked for. Rows exist means somebody tried to
 * choose an audience; if none of them name one, the honest answer is that the
 * selection is incomplete, and the UI says so in words.
 */
export const targetsEveryone = (drafts: AssignmentDraft[]): boolean =>
  drafts.some((d) => d.scopeType === "all") || drafts.length === 0;

/**
 * Is this student eligible?
 *
 * Mirrors `isEligible()` in _shared/testEngine.ts exactly. Inactive students
 * are excluded from COUNTS but not from this predicate: a student deactivated
 * mid-exam must still be able to finish the paper in front of them, and
 * throwing them out at the next autosave would lose their work.
 */
export const isTargeted = (
  drafts: AssignmentDraft[],
  student: TargetableStudent,
): boolean => {
  if (targetsEveryone(drafts)) return true;
  return narrowing(drafts).some((d) => {
    if (!d.scopeId) return false;
    if (d.scopeType === "student") return d.scopeId === student.id;
    if (d.scopeType === "batch") return d.scopeId === student.batchId;
    if (d.scopeType === "standard") return d.scopeId === student.standardId;
    return false;
  });
};

export interface TargetingSummary {
  /** Distinct students who will receive it. */
  eligible: number;
  /** Selected but deactivated — counted separately, never silently dropped. */
  inactive: number;
  /** How many named students were already covered by a class or batch. */
  redundant: number;
  everyone: boolean;
}

/**
 * Summarise a selection against a roster.
 *
 * `redundant` exists because the commonest way to get this wrong is to select
 * Class 10 and then also search for three of its students, then wonder why the
 * count did not move. Saying "already covered by Class 10" is more useful than
 * a number that refuses to change.
 */
export const summarise = (
  drafts: AssignmentDraft[],
  roster: TargetableStudent[],
): TargetingSummary => {
  const everyone = targetsEveryone(drafts);
  const matched = roster.filter((s) => isTargeted(drafts, s));

  const named = new Set(
    drafts.filter((d) => d.scopeType === "student" && d.scopeId).map((d) => d.scopeId as string),
  );
  const cohortOnly = narrowing(drafts).filter((d) => d.scopeType !== "student");
  const redundant = everyone
    ? named.size
    : roster.filter(
        (s) => named.has(s.id) && isTargeted(cohortOnly, s) && cohortOnly.length > 0,
      ).length;

  return {
    eligible: matched.filter((s) => s.isActive !== false).length,
    inactive: matched.filter((s) => s.isActive === false).length,
    redundant,
    everyone,
  };
};

/**
 * Collapse a selection to what is worth storing.
 *
 * An explicit "all" makes every other scope meaningless, so the rest are
 * dropped rather than persisted as noise that a later reader has to reason
 * about. Duplicate scopes are removed for the same reason.
 */
export const normaliseDrafts = (drafts: AssignmentDraft[]): AssignmentDraft[] => {
  const usable = drafts.filter(
    (d) => d.scopeType === "all" || (!!d.scopeId && !!d.scopeType),
  );
  if (usable.some((d) => d.scopeType === "all")) {
    return [{ scopeType: "all", scopeId: "", scopeName: "Everyone" }];
  }
  const seen = new Set<string>();
  return usable.filter((d) => {
    const key = `${d.scopeType}:${d.scopeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Human summary for the publish screen. Deliberately never says "0 students". */
export const describeTargeting = (s: TargetingSummary): string => {
  if (s.everyone) return "Everyone in your institution";
  if (s.eligible === 0) {
    // A test assigned to nobody is a mistake worth naming, not a count to show.
    return "No students match this selection yet";
  }
  return `${s.eligible} student${s.eligible === 1 ? "" : "s"}`;
};
