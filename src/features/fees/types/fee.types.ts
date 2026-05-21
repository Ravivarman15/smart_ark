// Domain types for the Fees feature.
// App-facing — DB row shapes never leak out of services/.

export type FeeStatus = "pending" | "partial" | "paid";
export type PaymentMethod = "Cash" | "Card" | "UPI" | "Cheque" | "Bank Transfer" | "Other";

/** Kind of fee a structure represents. */
export type FeeType = "one_time" | "recurring" | "transport" | "material";
export type RecurringInterval = "monthly" | "quarterly" | "half_yearly" | "yearly";

// ── Fee structures ────────────────────────────────────────────────────────────
export interface FeeStructure {
  id: string;
  name: string;
  description?: string;
  courseTypeId?: string;
  /** Denormalised course-type label (DB column is NOT NULL). */
  courseType?: string;
  standardId?: string;
  /** Denormalised standard label (DB column is NOT NULL). */
  standardName?: string;
  batchId?: string;
  taxId?: string;
  academicYearId?: string;
  feeType: FeeType;
  totalAmount: number;
  transportFee: number;
  materialFee: number;
  discountAmount: number;
  seatConfirmationAmount: number;
  firstPaymentAmount: number;
  installmentCount: number;
  recurringInterval?: RecurringInterval;
  /** Day-of-month a recurring / installment due date lands on. */
  dueDay?: number;
  isActive: boolean;
  totalStudents: number;
  createdAt: string;
}

/** Form payload to create / update a fee structure. */
export interface FeeStructureWriteInput {
  name: string;
  description?: string;
  courseTypeId?: string;
  standardId?: string;
  batchId?: string;
  taxId?: string;
  academicYearId?: string;
  feeType: FeeType;
  totalAmount: number;
  transportFee?: number;
  materialFee?: number;
  discountAmount?: number;
  seatConfirmationAmount?: number;
  firstPaymentAmount?: number;
  installmentCount?: number;
  recurringInterval?: RecurringInterval;
  dueDay?: number;
  isActive?: boolean;
}

export type CreateFeeStructureInput = FeeStructureWriteInput;
export type UpdateFeeStructureInput = Partial<FeeStructureWriteInput>;

/** One immutable history entry for a fee structure. */
export interface FeeStructureRevision {
  id: string;
  feeStructureId: string;
  snapshot: Record<string, unknown>;
  note?: string;
  createdAt: string;
}

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

/** A computed (not-yet-paid) item in an installment plan. */
export interface PlannedInstallment {
  label: string;
  amount: number;
  dueDate?: string;
}

// ── Fee record (per student, aggregated view) ────────────────────────────────
// Mirrors AppDataContext.FeeRecord so the bridge preserves consumer pages 1:1.
export interface FeeRecord {
  id: string;                 // student_fees.id (preferred) or legacy fee_transactions.id
  studentId?: string;
  student: string;
  batch: string;
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

/** A refund as stored in the fee_refunds audit table. */
export interface FeeRefundRecord {
  id: string;
  studentFeeId?: string;
  studentId?: string;
  studentName?: string;
  amount: number;
  reason?: string;
  status: "completed" | "pending_approval" | "approved" | "rejected";
  method?: string;
  createdAt: string;
}

// ── Tax ───────────────────────────────────────────────────────────────────────
export interface Tax {
  id: string;
  name: string;
  percentage: number;
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export interface FeeAnalytics {
  totalBilled: number;
  totalCollected: number;
  totalPending: number;
  totalDiscount: number;
  totalRefunded: number;
  /** Percentage 0–100. */
  collectionRate: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  studentCount: number;
}

/** Generic { id, name } picker option. */
export interface LookupOption {
  id: string;
  name: string;
}
