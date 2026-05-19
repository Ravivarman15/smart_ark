// Domain types for the Fees feature.
// App-facing — DB row shapes never leak out of services/.

export type FeeStatus = "pending" | "partial" | "paid";
export type PaymentMethod = "Cash" | "Card" | "UPI" | "Cheque" | "Bank Transfer" | "Other";

// ── Fee structures ────────────────────────────────────────────────────────────
export interface FeeStructure {
  id: string;
  name: string;
  courseTypeId?: string;
  standardId?: string;
  taxId?: string;
  academicYearId?: string;
  totalAmount: number;
  seatConfirmationAmount: number;
  firstPaymentAmount: number;
  installmentCount: number;
  createdAt: string;
}

export type CreateFeeStructureInput = Omit<FeeStructure, "id" | "createdAt">;
export type UpdateFeeStructureInput = Partial<CreateFeeStructureInput>;

// ── Installments (individual payments) ────────────────────────────────────────
export interface Installment {
  id: string;
  amount: number;
  /** ISO date string (yyyy-mm-dd). */
  date: string;
  receiptNo: string;
  method: PaymentMethod | string;
  notes?: string;
}

// ── Fee record (per student, aggregated view) ────────────────────────────────
// This mirrors the existing AppDataContext.FeeRecord shape so the bridge
// can preserve all consumer pages 1:1. Internally we now know to source it
// from `student_fees` (master) joined with `fee_installments` (children).
export interface FeeRecord {
  id: string;                 // student_fees.id (preferred) or legacy fee_transactions.id
  studentId?: string;         // present when sourced from student_fees
  student: string;            // student name (denormalised)
  batch: string;              // batch name (denormalised)
  campus?: string;
  amount: number;             // gross total before discount
  finalAmount?: number;       // amount - discount
  discount?: number;
  received?: number;
  refund?: number;
  pending?: number;
  paid: boolean;
  paidDate?: string;
  dueSince?: string;
  taxEnabled?: boolean;
  receiptNo?: string;
  installments?: Installment[];
  status?: FeeStatus;
}

export type CreateFeeRecordInput = Omit<FeeRecord, "id" | "studentId">;

// ── Refund ────────────────────────────────────────────────────────────────────
export interface Refund {
  feeId: string;
  amount: number;
  reason?: string;
  issuedAt: string;
}

// ── Tax ───────────────────────────────────────────────────────────────────────
export interface Tax {
  id: string;
  name: string;
  percentage: number;
}
