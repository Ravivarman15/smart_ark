// ──────────────────────────────────────────────────────────────────────────────
// Automation smart-rules — PURE, no React / no Supabase.
//
// The decision layer the dispatcher consults: is the event enabled, which
// channels apply, are we inside quiet hours, and which recipients are duplicates
// of something already queued today. Unit-tested directly so a rule regression
// fails the build.
// ──────────────────────────────────────────────────────────────────────────────

import type { AutomationChannel } from "../types/communication.types";

/** Parse "HH:MM" → minutes-since-midnight, or null if malformed/empty. */
export function toMinutes(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Is `now` inside the quiet window [start, end)? Supports windows that wrap
 * midnight (e.g. 21:00–08:00). Returns false when either bound is unset/equal
 * (no quiet window configured).
 */
export function isWithinQuietHours(now: string, start?: string | null, end?: string | null): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const n = toMinutes(now);
  if (s === null || e === null || n === null || s === e) return false;
  return s < e ? n >= s && n < e : n >= s || n < e;
}

/** Expand a channel setting into the concrete channels to send on. */
export function resolveChannels(channel: AutomationChannel): ("whatsapp" | "email")[] {
  if (channel === "both") return ["whatsapp", "email"];
  if (channel === "email") return ["email"];
  return ["whatsapp"];
}

/** Should this event dispatch at all? */
export function shouldDispatch(setting: { enabled: boolean }): { ok: boolean; reason?: string } {
  return setting.enabled ? { ok: true } : { ok: false, reason: "event disabled" };
}

/**
 * Split a batch into fresh items and duplicates, given the set of dedupe keys
 * already present (e.g. context_ids queued today) — also drops in-batch repeats.
 */
export function partitionDuplicates<T>(
  items: T[],
  existing: Set<string>,
  keyOf: (item: T) => string,
): { fresh: T[]; duplicates: number } {
  const seen = new Set(existing);
  const fresh: T[] = [];
  let duplicates = 0;
  for (const item of items) {
    const k = keyOf(item);
    if (seen.has(k)) {
      duplicates += 1;
      continue;
    }
    seen.add(k);
    fresh.push(item);
  }
  return { fresh, duplicates };
}
