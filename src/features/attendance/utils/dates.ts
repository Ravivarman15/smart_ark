// Pure date helpers for the attendance module. NO React, NO Supabase.
// All dates are handled as `YYYY-MM-DD` strings (local), matching the DB
// `date` columns and the existing students-feature pages.
//
// IMPORTANT: format from LOCAL components (getFullYear/Month/Date), never via
// toISOString(). toISOString() emits UTC, so in a +offset timezone (e.g. IST
// +5:30) a local-midnight date round-tripped through UTC lands on the PREVIOUS
// calendar day — which silently broke addDays/previousDay/dateRange/weekStart
// by a full day. Local-component formatting is timezone-independent.

/** YYYY-MM-DD from a Date's LOCAL calendar components. */
const fmtLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Today as YYYY-MM-DD (local). */
export const today = (): string => fmtLocal(new Date());

/** N days ago as YYYY-MM-DD (local). */
export const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmtLocal(d);
};

/** Shift a YYYY-MM-DD string by `delta` days. */
export const addDays = (date: string, delta: number): string => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return fmtLocal(d);
};

/** The day before `date`. Used by "Copy Yesterday". */
export const previousDay = (date: string): string => addDays(date, -1);

/** First day of the month containing `date`. */
export const monthStart = (date: string): string => `${date.slice(0, 7)}-01`;

/** Last day of the month containing `date`. */
export const monthEnd = (date: string): string => {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
};

/** Inclusive list of YYYY-MM-DD between from..to (capped to avoid runaway ranges). */
export const dateRange = (from: string, to: string, cap = 366): string[] => {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < cap) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
};

/** "Mon", "Tue" … for a YYYY-MM-DD. */
export const weekdayShort = (date: string): string =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });

/** Format YYYY-MM-DD → "12 Jun 2026". */
export const formatDate = (date: string): string => {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

/** Format an ISO timestamp → "09:14 AM" (local). Empty string if missing. */
export const formatClock = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/** Compose a YYYY-MM-DD + "HH:MM" into an ISO timestamp (local time). */
export const composeTimestamp = (date: string, time: string): string | undefined => {
  if (!date || !time) return undefined;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

/** "HH:MM" (local) extracted from an ISO timestamp — for editing inputs. */
export const clockInput = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
