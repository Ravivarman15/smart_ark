// Pure financial calculations. NO React, NO Supabase, NO side effects.
//
// Single source of truth for every rupee shown on screen. UI components
// must call these — never inline a `* tax / 100` again. Unit tests live
// alongside this file (see calculations.test.ts) once added.
//
// Rounding policy: round HALF AWAY FROM ZERO at *display boundaries only*
// (i.e. when producing a number to render or persist). Intermediate
// products stay full-precision to avoid drift on multi-step computations.

import type { FeeStructure, Installment, Tax } from "../types/fee.types";

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clampZero = (n: number): number => (n < 0 ? 0 : n);

// ── Tax ──────────────────────────────────────────────────────────────────────
export const taxAmount = (amount: number, tax?: Tax | null): number => {
  if (!tax || !amount) return 0;
  return round2((amount * tax.percentage) / 100);
};

export const withTax = (amount: number, tax?: Tax | null): number =>
  round2(amount + taxAmount(amount, tax));

// ── Discount ─────────────────────────────────────────────────────────────────
export const finalAmount = (gross: number, discount = 0): number =>
  clampZero(round2(gross - discount));

// ── Balance / pending ────────────────────────────────────────────────────────
/**
 * Pending balance = (gross − discount) − received + refund.
 * Refund increases pending because money that went out must be re-collected.
 */
export const pendingBalance = (args: {
  gross: number;
  discount?: number;
  received?: number;
  refund?: number;
}): number => {
  const { gross, discount = 0, received = 0, refund = 0 } = args;
  return clampZero(round2(finalAmount(gross, discount) - received + refund));
};

// ── Status derivation ────────────────────────────────────────────────────────
export const deriveFeeStatus = (args: {
  pending: number;
  received: number;
  gross: number;
}): "pending" | "partial" | "paid" => {
  if (args.pending <= 0) return "paid";
  if (args.received > 0) return "partial";
  return "pending";
};

// ── Installment schedule (preview) ───────────────────────────────────────────
/**
 * Compute the per-installment amount given a fee structure + optional tax.
 * Returns the gross total (with tax), the remaining after seat + first pay,
 * and the per-installment amount.
 */
export const installmentSchedule = (s: FeeStructure, tax?: Tax | null) => {
  const grossTotal = withTax(s.totalAmount, tax);
  const remaining = clampZero(grossTotal - s.seatConfirmationAmount - s.firstPaymentAmount);
  const count = Math.max(0, s.installmentCount || 0);
  const perInstallment = count > 0 ? round2(remaining / count) : 0;
  return { grossTotal, remaining, perInstallment, count };
};

// ── Summing installments ─────────────────────────────────────────────────────
export const sumInstallments = (rows: Installment[] | undefined): number =>
  round2((rows ?? []).reduce((acc, r) => acc + (r.amount || 0), 0));

// ── Receipt number ───────────────────────────────────────────────────────────
/**
 * Generate a non-cryptographic receipt number. UI uses this for the
 * paper trail; the canonical receipt id is still the row id in the DB.
 * Format: REC-YYMMDD-XXXX (XXXX is a 4-digit random suffix).
 */
export const generateReceiptNumber = (date: Date = new Date()): string => {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  return `REC-${yy}${mm}${dd}-${rand}`;
};
