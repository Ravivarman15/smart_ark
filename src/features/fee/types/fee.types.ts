// ─────────────────────────────────────────────────────────────────────────────
// Domain types for the Fee feature module.
//
// These are the *app-facing* shapes (camelCase). Services map the snake_case
// database rows onto these so no other layer ever touches raw DB columns.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enumerations ─────────────────────────────────────────────────────────────
export type FeeType = "one_time" | "recurring" | "transport" | "material";
export type RecurringInterval = "monthly" | "quarterly" | "half_yearly" | "yearly";

/** Lifecycle of a student fee record. */
export type FeeStatus = "pending" | "partial" | "paid";

/** Approval state of a discount applied to a student fee. */
export type DiscountStatus = "approved" | "pending" | "rejected";

/** Approval / settlement state of a refund. */
export type RefundStatus =
  | "completed"
  | "pending_approval"
  | "approved"
  | "rejected";

/** Cadence ids for an installment schedule. */
export type InstallmentModeId =
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "weekly"
  | "fortnightly";

export const PAYMENT_METHODS = [
  "Cash",
  "Cheque",
  "Bank Transfer",
  "UPI",
  "Card",
  "Other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ── Fee structure (template) ─────────────────────────────────────────────────
export interface FeeStructure {
  id: string;
  name: string;
  description?: string;
  courseTypeId?: string;
  standardId?: string;
  academicYearId?: string;
  taxId?: string;
  batchId?: string;
  /** Base amount before tax / transport / material. */
  totalAmount: number;
  seatConfirmationAmount: number;
  firstPaymentAmount: number;
  installmentCount: number;
  feeType: FeeType;
  transportFee: number;
  materialFee: number;
  recurringInterval?: RecurringInterval;
  /** Day of month a recurring / installment due date falls on. */
  dueDay?: number;
  createdAt: string;
}

// ── Student fee (per-student ledger) ─────────────────────────────────────────
export interface StudentFee {
  id: string;
  studentId: string;
  feeStructureId?: string;
  studentName?: string;
  batchName?: string;
  totalAmount: number;
  discountAmount: number;
  amountReceived: number;
  amountPending: number;
  seatConfirmationAmount: number;
  firstPaymentAmount: number;
  installmentCount: number;
  dueDate?: string;
  status: FeeStatus;
  /** "approved" when no approval workflow column exists (back-compat). */
  discountStatus: DiscountStatus;
  discountApprovedBy?: string;
  notes?: string;
  createdAt: string;
}

// ── Installment / payment ────────────────────────────────────────────────────
export interface FeeInstallment {
  id: string;
  studentFeeId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  receiptNo?: string;
  notes?: string;
  createdAt: string;
  /** Synthetic — a "Scheduled" installment is a plan, not a real payment. */
  scheduled: boolean;
}

// ── Refund ───────────────────────────────────────────────────────────────────
export interface FeeRefund {
  id: string;
  studentFeeId?: string;
  studentId?: string;
  studentName?: string;
  amount: number;
  reason?: string;
  status: RefundStatus;
  method?: string;
  issuedBy?: string;
  createdAt: string;
}

// ── Fee structure revision (audit history) ───────────────────────────────────
export interface FeeStructureRevision {
  id: string;
  feeStructureId: string;
  snapshot: Record<string, unknown>;
  note?: string;
  revisedBy?: string;
  createdAt: string;
}

// ── Service inputs ───────────────────────────────────────────────────────────
export interface FeeStructureInput {
  name: string;
  description?: string | null;
  courseTypeId?: string | null;
  standardId?: string | null;
  academicYearId?: string | null;
  taxId?: string | null;
  batchId?: string | null;
  feeType: FeeType;
  totalAmount: number;
  seatConfirmationAmount: number;
  firstPaymentAmount: number;
  installmentCount: number;
  transportFee: number;
  materialFee: number;
  recurringInterval?: RecurringInterval | null;
  dueDay?: number | null;
}

export interface CollectPaymentInput {
  studentFeeId: string;
  amount: number;
  method: string;
  notes?: string;
  createdBy?: string;
}

export interface ApplyDiscountInput {
  studentFeeId: string;
  discountAmount: number;
  /** When true the discount applies immediately; otherwise it goes pending. */
  autoApprove?: boolean;
  approverId?: string;
}

export interface UpdateStudentFeeInput {
  totalAmount?: number;
  seatConfirmationAmount?: number;
  firstPaymentAmount?: number;
  installmentCount?: number;
  notes?: string;
}

export interface IssueRefundInput {
  studentFeeId: string;
  studentId?: string;
  studentName?: string;
  amount: number;
  reason: string;
  method?: string;
  /** When true the refund settles immediately; otherwise pending approval. */
  autoApprove?: boolean;
  issuedBy?: string;
}

export interface ScheduleInstallmentsInput {
  studentFeeId: string;
  count: number;
  /** ISO date (yyyy-mm-dd) of the first installment. */
  startDate: string;
  modeId: InstallmentModeId;
  createdBy?: string;
}

// ── Calculation results ──────────────────────────────────────────────────────
export interface FeeBreakdown {
  base: number;
  tax: number;
  transportFee: number;
  materialFee: number;
  grossTotal: number;
  seatConfirmation: number;
  firstPayment: number;
  installmentBalance: number;
  installmentCount: number;
  perInstallment: number;
}

export interface PaymentResult {
  receiptNo: string;
  amount: number;
  amountReceived: number;
  amountPending: number;
  status: FeeStatus;
}

export interface ReceiptData {
  receiptNo: string;
  studentName?: string;
  batchName?: string;
  amount: number;
  paymentMethod: string;
  date: string;
  amountReceivedToDate?: number;
  amountPending?: number;
  notes?: string;
}

// ── Analytics ────────────────────────────────────────────────────────────────
export interface AgingBucket {
  label: string;
  amount: number;
  count: number;
}

export interface MonthlyCollection {
  month: string;
  collected: number;
}

export interface FeeAnalytics {
  totalBilled: number;
  totalCollected: number;
  totalPending: number;
  totalDiscount: number;
  collectionRate: number;
  studentCount: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  overdueCount: number;
  aging: AgingBucket[];
  monthly: MonthlyCollection[];
}
