// Pure attendance derivation utilities. NO React, NO Supabase.
// All date/time policy lives here so a "shift change" is a single-file edit.

import { APP_CONFIG } from "@/core/constants/config";
import type { CheckInStatus, CheckOutStatus } from "../types/staff.types";

/**
 * "Late" if check-in is after the configured cut-off (default 08:59).
 * Pure: pass a Date, get a boolean. Drives both check-in approval AND
 * the historical analytics colour-coding.
 */
export const isCheckInLate = (checkIn: Date): boolean => {
  const cutoff = APP_CONFIG.checkInLateAfter;
  return (
    checkIn.getHours() > cutoff.hour ||
    (checkIn.getHours() === cutoff.hour && checkIn.getMinutes() > cutoff.minute)
  );
};

/**
 * "Early" check-out if before 16:00. (Matches existing AppDataContext rule.)
 * When shift-end logic moves to per-campus config, change here only.
 */
export const isCheckOutEarly = (checkOut: Date): boolean => checkOut.getHours() < 16;

export const deriveCheckInStatus = (checkIn: Date): CheckInStatus =>
  isCheckInLate(checkIn) ? "late" : "on-time";

export const deriveCheckOutStatus = (checkOut: Date): CheckOutStatus =>
  isCheckOutEarly(checkOut) ? "early" : "on-time";

/** Display helper: HH:MM in user's locale. */
export const formatTime = (d: Date): string =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Convert DB enum ↔ app status. Two values worth normalising. */
export const dbCheckInStatus = (s: "on-time" | "late"): "on_time" | "late" =>
  s === "late" ? "late" : "on_time";

export const dbCheckOutStatus = (s: "on-time" | "early"): "on_time" | "early" =>
  s === "early" ? "early" : "on_time";

export const appCheckOutStatus = (s: string | null | undefined): CheckOutStatus =>
  s === "early" ? "early" : s === "on_time" ? "on-time" : "pending";
