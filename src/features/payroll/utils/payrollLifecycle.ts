import type { PayrollRun, PayrollRunStatus } from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// Payroll lifecycle guards — pure, side-effect-free predicates that protect the
// run state machine (draft → pending → approved → paid → cancelled). Extracted
// from the service so the rules are unit-testable without a database:
//   • duplicate-period prevention   (don't pay the same staff twice for a period)
//   • status transition guards      (only approve a pending run; only pay an
//     approved run — this is what stops a double Finance post).
// ─────────────────────────────────────────────────────────────────────────────

/** Inclusive date-range overlap — treats period_start/end as closed intervals. */
export const periodsOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean => aStart <= bEnd && bStart <= aEnd;

/**
 * Find an existing non-cancelled run whose period overlaps [start, end].
 * Used by generate() to refuse creating a second run for the same period —
 * the caller should cancel/delete the existing run (or "regenerate") instead.
 * `excludeId` lets a regenerate skip the run being replaced.
 */
export const findOverlappingRun = (
  existing: PayrollRun[],
  start: string,
  end: string,
  excludeId?: string,
): PayrollRun | undefined =>
  existing.find(
    (r) =>
      r.id !== excludeId &&
      r.status !== "cancelled" &&
      periodsOverlap(r.periodStart, r.periodEnd, start, end),
  );

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

/** A run may be approved only while it is awaiting approval. */
export const canApprove = (status: PayrollRunStatus): GuardResult => {
  if (status === "pending" || status === "draft") return { ok: true };
  if (status === "approved") return { ok: false, reason: "This run is already approved." };
  if (status === "paid") return { ok: false, reason: "Paid runs cannot be re-approved." };
  return { ok: false, reason: "Cancelled runs cannot be approved." };
};

/**
 * A run may be paid only once, from the approved state. This is the guard that
 * prevents a second Salary expense from being posted to Finance.
 */
export const canPay = (status: PayrollRunStatus): GuardResult => {
  if (status === "approved") return { ok: true };
  if (status === "paid") return { ok: false, reason: "This run is already paid." };
  if (status === "cancelled") return { ok: false, reason: "Cancelled runs cannot be paid." };
  return { ok: false, reason: "Approve the run before processing payment." };
};
