// ──────────────────────────────────────────────────────────────────────────────
// SCHEDULE VIEW MODEL
//
// Pure date/grouping helpers shared by the coordinator's Class Scheduling page
// and the teacher's My Classes page, so "Today" means the same day, and a list
// of classes reads the same way, in both.
//
// ┌── THE TIMEZONE BUG THIS FILE EXISTS TO STOP REPEATING ─────────────────┐
// │ Every date helper in this module used to be some form of:              │
// │                                                                        │
// │   new Date().toISOString().slice(0, 10)                                │
// │                                                                        │
// │ `toISOString()` is UTC. India is UTC+5:30, so between 00:00 and 05:30  │
// │ IST that expression returns YESTERDAY — a teacher opening the app at   │
// │ 1am would be shown the wrong day's classes.                            │
// │                                                                        │
// │ The month-range version was wrong for everyone, all day:               │
// │                                                                        │
// │   new Date(2026, 7, 1).toISOString().slice(0, 10)   // "2026-07-31"    │
// │                                                                        │
// │ Local midnight on 1 Aug IST is 18:30Z on 31 Jul, so every "this month" │
// │ window was shifted a day at both ends.                                 │
// │                                                                        │
// │ `localIso` reads the LOCAL calendar fields instead, which is the only  │
// │ correct way to name the day a person is actually living in. Schedule   │
// │ dates are DATE columns — a wall-clock day, with no instant attached —  │
// │ so they must never be routed through a UTC instant.                    │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import type { ClassSchedule } from "../types/allocation.types";
import { isSplitSubject, splitSubjectTitle } from "./standardPlan";

/** `YYYY-MM-DD` for a date, in the viewer's own timezone. */
export const localIso = (d: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const todayIso = (): string => localIso();

/** `iso` shifted by `days`, staying in local time. */
export const shiftIso = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  // Constructing from parts (rather than parsing the string) avoids the
  // "YYYY-MM-DD is parsed as UTC midnight" rule in the Date spec.
  return localIso(new Date(y, m - 1, d + days));
};

// ── Range presets ─────────────────────────────────────────────────────────────

export type RangePreset = "today" | "tomorrow" | "week" | "month" | "all" | "date";

export interface DateRange {
  from?: string;
  to?: string;
  /** What the header says the list is showing. */
  label: string;
}

export const RANGE_PRESETS: { id: RangePreset; label: string; short: string }[] = [
  { id: "today", label: "Today", short: "Today" },
  { id: "tomorrow", label: "Tomorrow", short: "Tmrw" },
  { id: "week", label: "This week", short: "Week" },
  { id: "month", label: "This month", short: "Month" },
  { id: "all", label: "All", short: "All" },
];

/**
 * Turn a preset into the `{from,to}` the schedule service filters on.
 *
 * `all` returns an EMPTY range, not a wide one. A guessed upper bound would
 * silently hide classes scheduled beyond it, and "All" that quietly means
 * "all within some window I picked" is the kind of half-truth that costs an
 * afternoon to diagnose.
 */
export const resolveRange = (preset: RangePreset, anchorDate?: string): DateRange => {
  const today = todayIso();
  switch (preset) {
    case "today":
      return { from: today, to: today, label: "Today" };
    case "tomorrow": {
      const t = shiftIso(today, 1);
      return { from: t, to: t, label: "Tomorrow" };
    }
    case "week": {
      // Monday-first, matching the rest of the product.
      const [y, m, d] = today.split("-").map(Number);
      const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
      const from = shiftIso(today, -dow);
      return { from, to: shiftIso(from, 6), label: "This week" };
    }
    case "month": {
      const [y, m] = today.split("-").map(Number);
      return {
        from: localIso(new Date(y, m - 1, 1)),
        to: localIso(new Date(y, m, 0)),
        label: "This month",
      };
    }
    case "date": {
      const d = anchorDate || today;
      return { from: d, to: d, label: formatDay(d) };
    }
    case "all":
    default:
      return { label: "All classes" };
  }
};

// ── Day labelling ─────────────────────────────────────────────────────────────

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue, 12 Aug 2026" — year dropped when it is the current one. */
export const formatDay = (iso: string, today = todayIso()): string => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const sameYear = String(y) === today.slice(0, 4);
  return `${WEEKDAY[date.getDay()]}, ${d} ${MONTH[m - 1]}${sameYear ? "" : ` ${y}`}`;
};

/** "Today" / "Tomorrow" / "Yesterday", else the formatted day. */
export const relativeDay = (iso: string, today = todayIso()): string => {
  if (iso === today) return "Today";
  if (iso === shiftIso(today, 1)) return "Tomorrow";
  if (iso === shiftIso(today, -1)) return "Yesterday";
  return formatDay(iso, today);
};

// ── Grouping ──────────────────────────────────────────────────────────────────

export interface DayGroup {
  date: string;
  /** "Today", "Tomorrow", … */
  heading: string;
  /** "Tue, 12 Aug" — always the calendar date, even when heading is relative. */
  subheading: string;
  isToday: boolean;
  isPast: boolean;
  items: ClassSchedule[];
  /** Minutes of teaching on this day, cancelled classes excluded. */
  totalMinutes: number;
}

/**
 * Group classes into ordered days, each ordered by start time.
 *
 * The schedule service ALREADY orders by `schedule_date, start_time`, so this
 * sort is not the fix for anything — it is here so that a list rendered from a
 * cache merge, an optimistic insert, or a future caller that forgets to order
 * still reads chronologically. Ordering that depends on every upstream caller
 * remembering to sort is ordering that will eventually be wrong.
 */
export const groupByDay = (
  schedules: ClassSchedule[],
  today = todayIso(),
): DayGroup[] => {
  const byDate = new Map<string, ClassSchedule[]>();
  for (const s of schedules) {
    const key = s.scheduleDate;
    if (!key) continue;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(s);
  }

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => {
      const ordered = [...items].sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) ||
          a.endTime.localeCompare(b.endTime) ||
          // Two classes at the same hour are ordered by what they are, so the
          // list is stable across refetches instead of shuffling.
          (a.standardName ?? "").localeCompare(b.standardName ?? "") ||
          (a.subjectName ?? "").localeCompare(b.subjectName ?? ""),
      );
      return {
        date,
        heading: relativeDay(date, today),
        subheading: formatDay(date, today),
        isToday: date === today,
        isPast: date < today,
        items: ordered,
        totalMinutes: ordered
          .filter((c) => c.status !== "cancelled")
          .reduce((n, c) => n + (c.durationMinutes || 0), 0),
      };
    });
};

/**
 * "Std 4 · A · Maths" — every standard of a combined class, not just the
 * primary, otherwise a Std 2 + Std 4 class reads as if it only covers one.
 *
 * When the standards are doing DIFFERENT subjects the compact form stops being
 * true: "2nd STD + 3rd STD · Maths" names a subject half the room is not
 * taking. Those classes are titled per standard instead —
 * "2nd STD · Maths  +  3rd STD · Science" — which is longer and is the only
 * rendering that is correct for everyone in it.
 */
export const classLabel = (c: ClassSchedule, separator = " · "): string => {
  if (isSplitSubject(c)) return splitSubjectTitle(c) || "Class";
  return (
    [
      c.standardNames?.length ? c.standardNames.join(" + ") : c.standardName,
      c.sectionName,
      c.subjectName,
    ]
      .filter(Boolean)
      .join(separator) || "Class"
  );
};

export const classTitle = (c: ClassSchedule): string => classLabel(c);

/** "1h 30m", or "45m" when under the hour. */
export const durationLabel = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/** "9:00 AM – 10:30 AM" from two `HH:MM` strings. */
export const timeRangeLabel = (start: string, end: string): string => {
  const one = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    if (!Number.isFinite(h)) return t;
    const suffix = h < 12 ? "AM" : "PM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
  };
  return `${one(start)} – ${one(end)}`;
};
