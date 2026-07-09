// ─────────────────────────────────────────────────────────────────────────────
// Public API of the Fee feature module.
// External code imports from "@/features/fee" — never reach into subfolders.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  FeeType,
  RecurringInterval,
  FeeStatus,
  DiscountStatus,
  RefundStatus,
  InstallmentModeId,
  PaymentMethod,
  FeeStructure,
  StudentFee,
  FeeInstallment,
  FeeRefund,
  FeeStructureRevision,
  FeeStructureInput,
  CollectPaymentInput,
  ApplyDiscountInput,
  UpdateStudentFeeInput,
  IssueRefundInput,
  ScheduleInstallmentsInput,
  FeeBreakdown,
  PaymentResult,
  ReceiptData,
  FeeAnalytics,
  AgingBucket,
  MonthlyCollection,
} from "./types/fee.types";
export { PAYMENT_METHODS } from "./types/fee.types";

// ── Calculation layer + receipt utilities ────────────────────────────────────
export {
  round2,
  toAmount,
  formatINR,
  INSTALLMENT_MODES,
  modeById,
  advanceDate,
  buildSchedule,
  computeBreakdown,
  recalcStudentFee,
  collectionRate,
  isOverdue,
  daysOverdue,
  generateReceiptNo,
  buildReceipt,
  receiptToHtml,
  printReceipt,
  type InstallmentMode,
  type ScheduledInstallment,
} from "./utils";

// ── Schemas ──────────────────────────────────────────────────────────────────
export {
  feeStructureSchema,
  collectPaymentSchema,
  discountSchema,
  refundSchema,
  editStudentFeeSchema,
  type FeeStructureFormValues,
  type CollectPaymentFormValues,
  type DiscountFormValues,
  type RefundFormValues,
  type EditStudentFeeFormValues,
} from "./schemas/fee.schema";

// ── Services ─────────────────────────────────────────────────────────────────
export {
  feeStructureService,
  studentFeeService,
  feeRefundService,
  feeReminderService,
  feeAnalyticsService,
  feeLookupsService,
  feeAssignmentService,
  type FeeReminderKind,
  type QueuedFeeMessage,
  type QueueResult,
  type LookupOption,
  type TaxOption,
  type EligibleStudent,
  type AssignFeeStructureInput,
  type AssignResult,
  type PlanStructure,
  type BatchPlanRow,
  type BatchAssignmentPlan,
  type BatchAssignmentChoice,
} from "./services";

// ── Hooks ────────────────────────────────────────────────────────────────────
export {
  useFeeStructures,
  useFeeLookups,
  useFeeStructureRevisions,
  useCreateFeeStructure,
  useUpdateFeeStructure,
  useDeleteFeeStructure,
  useStudentFees,
  useFeeInstallments,
  useCollectPayment,
  useApplyDiscount,
  useApproveDiscount,
  useRejectDiscount,
  useUpdateStudentFee,
  useSetDueDate,
  useScheduleInstallments,
  useQueueFeeReminders,
  useFeeRefunds,
  useIssueRefund,
  useApproveRefund,
  useRejectRefund,
  useFeeAnalytics,
  useFeeReminderOutbox,
  useEligibleStudents,
  useAssignFeeStructure,
  useBatchAssignmentPlan,
  useAutoAssignByBatch,
} from "./hooks";

// ── Components ───────────────────────────────────────────────────────────────
export {
  FeeReceiptDialog,
  RefundDialog,
  RevisionHistoryDialog,
  FeeAnalyticsPanel,
  AssignFeeDialog,
  AutoAssignFeesDialog,
  StudentFeeCommsCard,
} from "./components";
