// Barrel for the Fee calculation + receipt utilities.
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
  type InstallmentMode,
  type ScheduledInstallment,
  type BreakdownInput,
  type RecalcInput,
  type RecalcResult,
} from "./feeCalc";

export {
  buildReceipt,
  receiptToHtml,
  printReceipt,
  // The shared page shell + the canonical branded renderer. Exported so any
  // future receipt surface reuses ReceiptBody instead of hand-rolling a second
  // design, which is exactly how the parent portal drifted.
  receiptPrintDocument,
  receiptToBrandedPrintHtml,
} from "./receipt";
