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
  // The shared print-window page shell. Exported so any receipt surface wraps
  // ReceiptBody the same way instead of hand-rolling a second document, which
  // is exactly how the parent portal drifted.
  receiptPrintDocument,
} from "./receipt";
