// Pure helpers for attendance governance. NO React, NO Supabase.
// Period-key derivation, lock-window math, label maps.

import { monthStart, monthEnd, addDays } from "../../utils/dates";
import type {
  ApprovalRequestType,
  ApprovalStatus,
  ClosingStatus,
  GovScope,
  LockPeriodType,
} from "../types/governance.types";

/** ISO week number (1–53) for a YYYY-MM-DD date. */
export const isoWeek = (date: string): number => {
  const d = new Date(`${date}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day + 3); // nearest Thursday
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const diff = (d.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - ((firstThursday.getDay() + 6) % 7) + 3) / 7);
};

/** Monday of the ISO week containing `date`. */
export const weekStart = (date: string): string => {
  const d = new Date(`${date}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  return addDays(date, -day);
};

/** Derive { periodKey, fromDate, toDate } for a lock anchored at `date`. */
export const lockWindow = (
  periodType: LockPeriodType,
  date: string,
): { periodKey: string; fromDate: string; toDate: string } => {
  if (periodType === "day") {
    return { periodKey: date, fromDate: date, toDate: date };
  }
  if (periodType === "week") {
    const from = weekStart(date);
    const to = addDays(from, 6);
    return { periodKey: `${date.slice(0, 4)}-W${String(isoWeek(date)).padStart(2, "0")}`, fromDate: from, toDate: to };
  }
  // month
  return { periodKey: date.slice(0, 7), fromDate: monthStart(date), toDate: monthEnd(date) };
};

/** Month bounds for a 'YYYY-MM' key. */
export const monthWindow = (month: string): { from: string; to: string } => {
  const anchor = `${month}-01`;
  return { from: monthStart(anchor), to: monthEnd(anchor) };
};

/** Does a lock window cover `date`? Scope must match (or be "all"). */
export const coversDate = (
  lock: { scope: GovScope; fromDate: string; toDate: string; locked: boolean },
  scope: GovScope,
  date: string,
): boolean => {
  if (!lock.locked) return false;
  if (lock.scope !== "all" && scope !== "all" && lock.scope !== scope) return false;
  return date >= lock.fromDate && date <= lock.toDate;
};

// ── Label maps ────────────────────────────────────────────────────────────────
export const SCOPE_LABEL: Record<GovScope, string> = {
  student: "Student",
  staff: "Staff",
  all: "All attendance",
};

export const PERIOD_LABEL: Record<LockPeriodType, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

export const REQUEST_LABEL: Record<ApprovalRequestType, string> = {
  correction: "Attendance Correction",
  backdated: "Backdated Entry",
  bulk_import: "Bulk Import",
  reopen: "Month Reopen",
  unlock: "Attendance Unlock",
};

export const APPROVAL_STATUS_META: Record<ApprovalStatus, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
  approved: { label: "Approved", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" },
  rejected: { label: "Rejected", tone: "border-rose-500/40 bg-rose-500/10 text-rose-700" },
  returned: { label: "Returned", tone: "border-sky-500/40 bg-sky-500/10 text-sky-700" },
};

export const CLOSING_STATUS_META: Record<ClosingStatus, { label: string; tone: string }> = {
  open: { label: "Open", tone: "border-slate-500/40 bg-slate-500/10 text-slate-700" },
  closed: { label: "Closed", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" },
  reopened: { label: "Reopened", tone: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
};

/** Compact JSON → readable "k: v" lines for audit / approval diff display. */
export const summarizeValue = (v?: Record<string, unknown> | null): string => {
  if (!v) return "—";
  return Object.entries(v)
    .filter(([, val]) => val !== null && val !== undefined && val !== "")
    .map(([k, val]) => `${k}: ${String(val)}`)
    .join(", ");
};
