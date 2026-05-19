// Public API of the fees feature.
// External code (pages, AppDataContext bridge, other features) should
// import from "@/features/fees" — never reach into subfolders.

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  FeeStatus,
  PaymentMethod,
  FeeStructure,
  CreateFeeStructureInput,
  UpdateFeeStructureInput,
  Installment,
  FeeRecord,
  CreateFeeRecordInput,
  Refund,
  Tax,
} from "./types/fee.types";

// ── Schemas ─────────────────────────────────────────────────────────────────
export {
  feeStructureSchema,
  feeRecordSchema,
  installmentSchema,
  refundSchema,
  discountSchema,
  type FeeStructureFormValues,
  type FeeRecordFormValues,
  type InstallmentFormValues,
  type RefundFormValues,
  type DiscountFormValues,
} from "./schemas/fee.schema";

// ── Utils (calculations + formatters) ───────────────────────────────────────
export {
  taxAmount,
  withTax,
  finalAmount,
  pendingBalance,
  deriveFeeStatus,
  installmentSchedule,
  sumInstallments,
  generateReceiptNumber,
  formatINR,
  formatINRDecimal,
  formatPaymentDate,
} from "./utils";

// ── Services ────────────────────────────────────────────────────────────────
export {
  feesService,
  feeStructuresService,
  installmentsService,
  refundsService,
} from "./services";

// ── Hooks ───────────────────────────────────────────────────────────────────
export {
  useFees,
  useFee,
  useFeeStructures,
  useCreateFeeStructure,
  useUpdateFeeStructure,
  useDeleteFeeStructure,
  useCreateFee,
  useMarkFeePaid,
  useApplyDiscount,
  useInstallments,
  useAddInstallment,
  useIssueRefund,
} from "./hooks";

// ── Components ──────────────────────────────────────────────────────────────
export {
  FeeStatusBadge,
  FeeSummaryCard,
  InstallmentTable,
  PaymentHistoryTable,
  RefundDialog,
} from "./components";
