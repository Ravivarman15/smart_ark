// Pure utilities for enquiry status / mapping. NO React, NO Supabase.

import type { EnquiryStatus } from "../types/enquiry.types";

/**
 * Map DB enum (snake_case) ↔ app status (kebab-case).
 * Keep both directions next to each other so they can't drift.
 */
const APP_TO_DB: Record<EnquiryStatus, string> = {
  interested: "interested",
  "follow-up": "follow_up",
  converted: "converted",
  "not-interested": "not_interested",
};

const DB_TO_APP: Record<string, EnquiryStatus> = {
  interested: "interested",
  follow_up: "follow-up",
  converted: "converted",
  not_interested: "not-interested",
};

export const toDbStatus = (s: EnquiryStatus): string => APP_TO_DB[s] ?? "interested";
export const toAppStatus = (s: string | null | undefined): EnquiryStatus =>
  (s && DB_TO_APP[s]) || "interested";

// ── Status transitions ───────────────────────────────────────────────────────
/**
 * Returns whether a transition is allowed. Mirrors UX rules:
 *   - any status can move to follow-up
 *   - converted is terminal (no reverse)
 *   - not-interested is reversible only back to interested
 */
export const canTransitionStatus = (from: EnquiryStatus, to: EnquiryStatus): boolean => {
  if (from === to) return false;
  if (from === "converted") return false;
  if (from === "not-interested" && to !== "interested") return false;
  return true;
};

// ── Visual helpers ───────────────────────────────────────────────────────────
export const statusLabel = (s: EnquiryStatus): string =>
  ({
    interested: "Interested",
    "follow-up": "Follow-up",
    converted: "Converted",
    "not-interested": "Not interested",
  }[s]);

export const priorityWeight = (p?: "high" | "medium" | "low"): number =>
  p === "high" ? 3 : p === "medium" ? 2 : 1;

/**
 * Sort enquiries: pending statuses first, then by priority desc, then by date desc.
 * Pure — pass to Array.prototype.sort.
 */
export const compareEnquiries = (
  a: { status: EnquiryStatus; priority?: "high" | "medium" | "low"; date: string },
  b: { status: EnquiryStatus; priority?: "high" | "medium" | "low"; date: string }
): number => {
  const terminal = (s: EnquiryStatus) => s === "converted" || s === "not-interested";
  if (terminal(a.status) !== terminal(b.status)) return terminal(a.status) ? 1 : -1;
  const pw = priorityWeight(b.priority) - priorityWeight(a.priority);
  if (pw !== 0) return pw;
  return b.date.localeCompare(a.date);
};
