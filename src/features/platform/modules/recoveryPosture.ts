// ──────────────────────────────────────────────────────────────────────────────
// RECOVERY POSTURE
//
// ┌── THE SENTENCE THIS FILE EXISTS TO ENFORCE ────────────────────────────┐
// │ "A restore that has not been tested is not a backup."                  │
// │                                                                        │
// │ That was already written on the Backups page, as prose, next to a      │
// │ requirement to verify PITR monthly. Prose does not know what month it  │
// │ is. Nothing recorded whether a rehearsal had ever happened, so the     │
// │ page could state the standard and be eleven months out of compliance   │
// │ with it at the same time, and look identical either way.               │
// │                                                                        │
// │ So the standard becomes a stored policy, rehearsals become records,    │
// │ and this computes the one thing an operator needs: are we covered, and │
// │ if not, by how far are we out?                                         │
// └────────────────────────────────────────────────────────────────────────┘
//
// Pure and synchronous. The interesting cases — never rehearsed, last one
// failed, due tomorrow, overdue by a quarter — are all awkward to reproduce
// against a real database and trivial to assert here.
// ──────────────────────────────────────────────────────────────────────────────

import type { DrPolicy, DrRehearsal } from "../services/platform.service";

export type PostureLevel =
  /** Rehearsed within the interval, and it passed. */
  | "verified"
  /** Passed, but the next one is due within a week. */
  | "due_soon"
  /** Past the interval, or never done at all. */
  | "overdue"
  /** The most recent rehearsal FAILED — worse than overdue. */
  | "failing";

export interface RecoveryPosture {
  level: PostureLevel;
  /** The most recent rehearsal of any outcome, or null. */
  last: DrRehearsal | null;
  /** The most recent PASSING rehearsal — what compliance actually rests on. */
  lastPass: DrRehearsal | null;
  /** ISO date the next rehearsal is due. Null when none has ever passed. */
  nextDue: string | null;
  /** Whole days until due; negative when overdue. Null when never rehearsed. */
  daysUntilDue: number | null;
  /** One sentence, written for the person who has to act on it. */
  headline: string;
}

const DAY = 86_400_000;

const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

const wholeDaysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to) - startOfDay(from)) / DAY);

/**
 * Where the platform stands on tested recovery.
 *
 * ┌── WHY A FAILED REHEARSAL IS ITS OWN LEVEL ─────────────────────────────┐
 * │ Folding it into "overdue" would say the same thing about two very      │
 * │ different situations: nobody has got round to testing (a scheduling    │
 * │ problem), and we tested and could not restore (an outage waiting to    │
 * │ happen). The second is the finding the whole ritual exists to produce, │
 * │ and it must not be reported in the same words as the first.            │
 * │                                                                        │
 * │ A failure also does NOT reset the clock. Compliance dates from the     │
 * │ last rehearsal that actually worked, so a failed attempt leaves the    │
 * │ platform exactly as un-verified as it was the day before.              │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export const recoveryPosture = (
  policy: DrPolicy,
  rehearsals: readonly DrRehearsal[],
  now: Date = new Date(),
): RecoveryPosture => {
  const sorted = [...rehearsals].sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  const last = sorted[0] ?? null;
  const lastPass = sorted.find((r) => r.outcome === "pass") ?? null;

  if (!last) {
    return {
      level: "overdue",
      last: null,
      lastPass: null,
      nextDue: null,
      daysUntilDue: null,
      headline:
        "No restore has ever been rehearsed. Until one is, the backups are untested and the RTO below is an estimate, not a measurement.",
    };
  }

  if (last.outcome === "fail") {
    return {
      level: "failing",
      last,
      lastPass,
      nextDue: null,
      daysUntilDue: null,
      headline: lastPass
        ? `The most recent rehearsal FAILED on ${last.performedAt.slice(0, 10)}. The last successful one was ${lastPass.performedAt.slice(0, 10)} — recovery is unproven until a passing rehearsal replaces it.`
        : `The only rehearsal on record FAILED on ${last.performedAt.slice(0, 10)}. Recovery has never been demonstrated to work.`,
    };
  }

  const from = new Date(lastPass!.performedAt);
  const due = new Date(from.getTime() + policy.rehearsalIntervalDays * DAY);
  const days = wholeDaysBetween(now, due);
  const nextDue = due.toISOString().slice(0, 10);

  if (days < 0) {
    return {
      level: "overdue",
      last,
      lastPass,
      nextDue,
      daysUntilDue: days,
      headline: `Rehearsal overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} — the last passing restore was ${lastPass!.performedAt.slice(0, 10)}.`,
    };
  }

  if (days <= 7) {
    return {
      level: "due_soon",
      last,
      lastPass,
      nextDue,
      daysUntilDue: days,
      headline:
        days === 0
          ? "The next restore rehearsal is due today."
          : `The next restore rehearsal is due in ${days} day${days === 1 ? "" : "s"}, on ${nextDue}.`,
    };
  }

  return {
    level: "verified",
    last,
    lastPass,
    nextDue,
    daysUntilDue: days,
    headline: `Recovery verified on ${lastPass!.performedAt.slice(0, 10)}. Next rehearsal due ${nextDue}.`,
  };
};

/**
 * Was the measured restore time inside the stated RTO?
 *
 * Returns null when a rehearsal did not record a duration — "unknown" and
 * "within target" must not look alike on a compliance page.
 */
export const meetsRto = (r: DrRehearsal, policy: DrPolicy): boolean | null =>
  r.minutesToRestore == null ? null : r.minutesToRestore <= policy.rtoHours * 60;

/**
 * The RTO the evidence actually supports.
 *
 * The policy states a target; the rehearsals state what was achieved. When a
 * measured restore exceeded the target, the target is aspirational and the
 * page should say so rather than repeat it as though it were established.
 */
export const measuredRto = (
  rehearsals: readonly DrRehearsal[],
): { worstMinutes: number; measured: number } | null => {
  const timed = rehearsals.filter(
    (r) => r.outcome === "pass" && r.minutesToRestore != null,
  ) as (DrRehearsal & { minutesToRestore: number })[];
  if (timed.length === 0) return null;
  return {
    worstMinutes: Math.max(...timed.map((r) => r.minutesToRestore)),
    measured: timed.length,
  };
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};
