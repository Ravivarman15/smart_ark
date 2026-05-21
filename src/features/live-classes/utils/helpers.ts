// Pure helpers for the Live Class feature — NO React, NO Supabase.

import { z, type ZodTypeAny } from "zod";
import type { LiveClass, LiveClassStats } from "../types/liveClass.types";

// ── zod validate helper ──────────────────────────────────────────────────────
export type ValidateResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

export function validate<S extends ZodTypeAny>(
  schema: S,
  data: unknown
): ValidateResult<z.infer<S>> {
  const res = schema.safeParse(data);
  if (res.success) return { ok: true, data: res.data };
  const errors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

// ── Date / time formatting ───────────────────────────────────────────────────
export const formatClassDate = (d?: string | null): string => {
  if (!d) return "—";
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/** "9:00 AM" from a 24h "09:00" string. */
export const formatTime = (t?: string | null): string => {
  if (!t) return "—";
  const [hRaw, mRaw] = t.split(":");
  const h = Number(hRaw);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${(mRaw ?? "00").padStart(2, "0")} ${period}`;
};

export const formatTimeRange = (start?: string, end?: string): string =>
  `${formatTime(start)} – ${formatTime(end)}`;

// ── Status derivation ────────────────────────────────────────────────────────
/**
 * Live status derived from the wall clock. A class explicitly marked
 * 'cancelled' or 'completed' keeps that status; otherwise we infer
 * scheduled vs. ongoing vs. completed from start/end date-time.
 */
export const liveStatusFor = (c: {
  status: string;
  startDate: string;
  startTime: string;
  endTime: string;
}): "scheduled" | "ongoing" | "completed" | "cancelled" => {
  if (c.status === "cancelled") return "cancelled";
  if (c.status === "completed") return "completed";
  const now = new Date();
  const start = new Date(`${c.startDate}T${(c.startTime || "00:00")}:00`);
  const end = new Date(`${c.startDate}T${(c.endTime || "23:59")}:00`);
  if (Number.isNaN(start.getTime())) return "scheduled";
  if (now < start) return "scheduled";
  if (now <= end) return "ongoing";
  return "completed";
};

export const isUpcoming = (c: LiveClass): boolean => {
  const s = liveStatusFor(c);
  return s === "scheduled" || s === "ongoing";
};

// ── Stats ────────────────────────────────────────────────────────────────────
export const computeStats = (rows: LiveClass[]): LiveClassStats => {
  const stats: LiveClassStats = {
    total: rows.length,
    upcoming: 0,
    ongoing: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const c of rows) {
    const s = liveStatusFor(c);
    if (s === "ongoing") stats.ongoing += 1;
    if (s === "scheduled" || s === "ongoing") stats.upcoming += 1;
    if (s === "completed") stats.completed += 1;
    if (s === "cancelled") stats.cancelled += 1;
  }
  return stats;
};

// ── Misc ─────────────────────────────────────────────────────────────────────
export const initials = (name?: string): string =>
  (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
