// ─────────────────────────────────────────────────────────────────────────────
// CENTRALISED FEE CALCULATION LAYER
//
// Every rupee figure the Fee module shows or writes flows through here. No UI
// component and no service may do its own fee arithmetic — that is how a fee
// system silently drifts out of balance. One module, one set of rules:
//
//   • round2()            — the only rounding (matches NUMERIC(10,2) in the DB)
//   • computeBreakdown()  — fee-structure → payment schedule preview
//   • recalcStudentFee()  — the single source of truth for pending + status
//   • buildSchedule()     — split a balance into dated installments
//
// Pure functions, no I/O — trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  FeeBreakdown,
  FeeStatus,
  InstallmentModeId,
} from "../types/fee.types";

/** Round to 2 decimals — the precision of NUMERIC(10,2). The only rounding. */
export const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Coerce a form value to a non-negative number; junk / blank / negative → 0. */
export const toAmount = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
};

/** Indian-rupee display formatting. */
export const formatINR = (n: number | null | undefined): string =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// ── Installment cadence ──────────────────────────────────────────────────────
export interface InstallmentMode {
  id: InstallmentModeId;
  label: string;
  months?: number;
  days?: number;
}

export const INSTALLMENT_MODES: InstallmentMode[] = [
  { id: "monthly", label: "Monthly", months: 1 },
  { id: "quarterly", label: "Quarterly", months: 3 },
  { id: "half_yearly", label: "Half-Yearly", months: 6 },
  { id: "weekly", label: "Weekly", days: 7 },
  { id: "fortnightly", label: "Fortnightly", days: 14 },
];

export const modeById = (id: InstallmentModeId): InstallmentMode =>
  INSTALLMENT_MODES.find((m) => m.id === id) ?? INSTALLMENT_MODES[0];

/** Advance a date by exactly one installment period. */
export const advanceDate = (date: Date, mode: InstallmentMode): Date => {
  const d = new Date(date);
  if (mode.months) d.setMonth(d.getMonth() + mode.months);
  else if (mode.days) d.setDate(d.getDate() + mode.days);
  return d;
};

export interface ScheduledInstallment {
  date: Date;
  amount: number;
}

/**
 * Split `pending` into `count` installments starting at `start` on cadence
 * `mode`. Each row is rounded to 2dp and the LAST row absorbs the rounding
 * remainder, so the schedule always sums back to exactly `pending`.
 */
export const buildSchedule = (
  pending: number,
  count: number,
  start: Date,
  mode: InstallmentMode,
): ScheduledInstallment[] => {
  const total = round2(pending);
  if (count <= 0 || total <= 0) return [];
  const base = Math.floor((total / count) * 100) / 100;
  const last = round2(total - base * (count - 1));
  const rows: ScheduledInstallment[] = [];
  let cur = new Date(start);
  for (let i = 0; i < count; i++) {
    rows.push({ date: new Date(cur), amount: i === count - 1 ? last : base });
    if (i < count - 1) cur = advanceDate(cur, mode);
  }
  return rows;
};

// ── Fee-structure breakdown ──────────────────────────────────────────────────
export interface BreakdownInput {
  baseAmount: number | string;
  taxPercentage?: number;
  transportFee?: number | string;
  materialFee?: number | string;
  seatConfirmation?: number | string;
  firstPayment?: number | string;
  installmentCount?: number;
}

/**
 * Turn a fee-structure definition into a full payment-schedule breakdown.
 *   grossTotal = base + tax + transport + material
 *   installmentBalance = grossTotal − seatConfirmation − firstPayment
 */
export const computeBreakdown = (i: BreakdownInput): FeeBreakdown => {
  const base = toAmount(i.baseAmount);
  const transportFee = toAmount(i.transportFee);
  const materialFee = toAmount(i.materialFee);
  const tax = round2(base * (toAmount(i.taxPercentage) / 100));
  const grossTotal = round2(base + tax + transportFee + materialFee);
  const seatConfirmation = toAmount(i.seatConfirmation);
  const firstPayment = toAmount(i.firstPayment);
  const installmentBalance = round2(
    Math.max(0, grossTotal - seatConfirmation - firstPayment),
  );
  const installmentCount = Math.max(0, Math.floor(i.installmentCount ?? 0));
  const perInstallment =
    installmentCount > 0 ? round2(installmentBalance / installmentCount) : 0;
  return {
    base,
    tax,
    transportFee,
    materialFee,
    grossTotal,
    seatConfirmation,
    firstPayment,
    installmentBalance,
    installmentCount,
    perInstallment,
  };
};

// ── Student-fee recalculation ────────────────────────────────────────────────
export interface RecalcInput {
  totalAmount: number;
  /** Only an APPROVED discount should be passed here. */
  discountAmount?: number;
  amountReceived?: number;
}

export interface RecalcResult {
  amountPending: number;
  status: FeeStatus;
}

/**
 * THE single source of truth for a student fee's `amount_pending` and
 * `status`. Every write path (collect, discount, edit, refund) recalculates
 * through this function so the ledger can never diverge.
 *
 *   pending = max(0, total − discount − received)
 *   status  = paid     when pending is 0
 *           = partial  when something has been received
 *           = pending  otherwise
 */
export const recalcStudentFee = (i: RecalcInput): RecalcResult => {
  const total = toAmount(i.totalAmount);
  const discount = toAmount(i.discountAmount);
  const received = toAmount(i.amountReceived);
  const amountPending = round2(Math.max(0, total - discount - received));
  const status: FeeStatus =
    amountPending <= 0 ? "paid" : received > 0 ? "partial" : "pending";
  return { amountPending, status };
};

/** Collected ÷ (collected + pending), as a 0-100 integer percentage. */
export const collectionRate = (collected: number, pending: number): number => {
  const denom = round2(collected + pending);
  return denom > 0 ? Math.round((collected / denom) * 100) : 0;
};

/** A fee is overdue when it has a past due date and money is still owed. */
export const isOverdue = (
  dueDate: string | null | undefined,
  pending: number,
): boolean => {
  if (!dueDate || pending <= 0) return false;
  const due = new Date(`${dueDate}T23:59:59`);
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
};

/** Whole days a fee is past its due date (0 when not overdue). */
export const daysOverdue = (
  dueDate: string | null | undefined,
  pending: number,
): number => {
  if (!isOverdue(dueDate, pending)) return 0;
  const due = new Date(`${dueDate}T00:00:00`).getTime();
  return Math.floor((Date.now() - due) / 86_400_000);
};

/**
 * A unique, human-readable receipt number. Base36 of the epoch millisecond
 * keeps it short, sortable and collision-free for practical volumes.
 */
export const generateReceiptNo = (): string =>
  `REC-${Date.now().toString(36).toUpperCase()}`;
