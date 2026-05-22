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

export { buildReceipt, receiptToHtml, printReceipt } from "./receipt";
