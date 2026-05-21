import type { DayOfWeek } from "../types/setup.types";

// ── Timetable grid geometry ──────────────────────────────────────────────────
// The weekly grid renders Monday–Saturday by default. Sunday (0) is kept in
// the type space but excluded here — surface it later by appending 0.
export const TIMETABLE_DAYS: DayOfWeek[] = [1, 2, 3, 4, 5, 6];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export const DAY_SHORT: Record<DayOfWeek, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/** Default number of teaching periods per day. Cells beyond this are unused. */
export const TIMETABLE_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

// ── Formatting helpers ───────────────────────────────────────────────────────

/** "09:00" + "10:30" → "09:00 – 10:30"; gracefully degrades on missing input. */
export const formatTimeRange = (start?: string, end?: string): string => {
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start} →`;
  if (end) return `→ ${end}`;
  return "—";
};

/** ISO date ("2026-05-20") → locale short date; safe on null/empty. */
export const formatDate = (value?: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
};

/** Compose a human label for a tax row's value. */
export const formatTaxValue = (taxType: "percentage" | "fixed", percentage?: number, amount?: number): string =>
  taxType === "fixed"
    ? `₹${Number(amount ?? 0).toLocaleString()}`
    : `${Number(percentage ?? 0)}%`;

// ── Batch health ─────────────────────────────────────────────────────────────
export const BATCH_HEALTH_OPTIONS = ["strong", "moderate", "risk"] as const;
export type BatchHealth = (typeof BATCH_HEALTH_OPTIONS)[number];

export const HEALTH_CLASS: Record<string, string> = {
  strong: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/15",
  moderate: "text-amber-700 dark:text-amber-400 bg-amber-500/15",
  risk: "text-red-700 dark:text-red-400 bg-red-500/15",
};
