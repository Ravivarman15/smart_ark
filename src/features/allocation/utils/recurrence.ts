import type { RepeatPattern } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Recurrence engine — expands one allocation into concrete dated occurrences.
//
// ALL date maths uses UTC epoch arithmetic (`Date.UTC`) rather than
// `new Date("YYYY-MM-DD")`, which is parsed as LOCAL time and silently drifts a
// day in +05:30 / -08:00 timezones. Every function here is pure so it is unit
// tested without touching the database.
// ─────────────────────────────────────────────────────────────────────────────

/** Hard ceiling so a bad `repeatUntil` can never generate an unbounded series. */
export const MAX_OCCURRENCES = 400;

export const toUtc = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
};

export const fromUtc = (t: number): string => new Date(t).toISOString().slice(0, 10);

const DAY = 24 * 60 * 60 * 1000;

/** 0=Sun … 6=Sat for an ISO date (UTC-safe). */
export const dayOfWeek = (iso: string): number => new Date(toUtc(iso)).getUTCDay();

export interface RecurrenceInput {
  scheduleDate: string;
  repeatPattern?: RepeatPattern;
  /** 0=Sun … 6=Sat. Empty ⇒ every day the pattern produces. */
  repeatDays?: number[];
  repeatUntil?: string;
  /** Phase-1 flag — treated as `weekly` when no explicit pattern is given. */
  repeatWeekly?: boolean;
}

/** Normalise the Phase-1 boolean and the Phase-3 pattern into one value. */
export const effectivePattern = (input: RecurrenceInput): RepeatPattern => {
  if (input.repeatPattern && input.repeatPattern !== "none") return input.repeatPattern;
  if (input.repeatPattern === "none") return "none";
  return input.repeatWeekly ? "weekly" : "none";
};

/**
 * Expand an allocation into its occurrence dates.
 *
 *   • none    → just the start date
 *   • daily   → every day up to repeatUntil, filtered by repeatDays when given
 *   • weekly  → the same weekday each week; with repeatDays, every listed
 *               weekday of every week in range (a real Mon/Wed/Fri timetable)
 *   • monthly → the same day-of-month each month (months that are too short are
 *               skipped rather than rolling into the next month)
 *
 * A recurrence with no `repeatUntil` degrades to a single occurrence — we never
 * guess an end date.
 */
export const expandRecurrence = (input: RecurrenceInput): string[] => {
  const pattern = effectivePattern(input);
  const start = input.scheduleDate;
  if (pattern === "none" || !input.repeatUntil) return [start];

  const until = toUtc(input.repeatUntil);
  const startT = toUtc(start);
  if (!Number.isFinite(until) || until < startT) return [start];

  const days = (input.repeatDays ?? []).filter((d) => d >= 0 && d <= 6);
  const dates: string[] = [];

  if (pattern === "daily" || pattern === "weekly") {
    // Weekly with no explicit day mask keeps the start date's weekday.
    const mask =
      days.length > 0
        ? new Set(days)
        : pattern === "weekly"
          ? new Set([new Date(startT).getUTCDay()])
          : null; // daily + no mask ⇒ every day
    // Weekly with an explicit mask still walks day-by-day; the mask does the
    // filtering, which naturally yields "every Mon/Wed/Fri in the range".
    for (let t = startT; t <= until && dates.length < MAX_OCCURRENCES; t += DAY) {
      if (!mask || mask.has(new Date(t).getUTCDay())) dates.push(fromUtc(t));
    }
  } else {
    // monthly — same day-of-month, skipping months that are too short.
    const s = new Date(startT);
    const dom = s.getUTCDate();
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    while (dates.length < MAX_OCCURRENCES) {
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      if (dom <= daysInMonth) {
        const t = Date.UTC(y, m, dom);
        if (t > until) break;
        if (t >= startT) dates.push(fromUtc(t));
      }
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      // Safety: bail once the first-of-month passes the end date.
      if (Date.UTC(y, m, 1) > until) break;
    }
  }

  return dates.length > 0 ? dates : [start];
};

// ── Academic dimensions ──────────────────────────────────────────────────────

/**
 * Academic year for a date, June→May (the Indian academic calendar this ERP
 * uses everywhere else). Returns e.g. "2026-2027".
 */
export const academicYearOf = (iso: string): string => {
  const [y, m] = iso.split("-").map(Number);
  return (m ?? 1) >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};

/** Calendar month (1-12) of an ISO date — UTC safe. */
export const monthOf = (iso: string): number => Number(iso.split("-")[1] ?? 0);

/** The rolling list of academic years offered in the allocation form. */
export const academicYearOptions = (today = new Date()): string[] => {
  const iso = today.toISOString().slice(0, 10);
  const [start] = academicYearOf(iso).split("-").map(Number);
  return [-1, 0, 1, 2].map((o) => `${start + o}-${start + o + 1}`);
};

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
