// Service layer of the Fee feature. External code imports from "@/features/fee".
export { feeStructureService } from "./feeStructure.service";
export { studentFeeService } from "./studentFee.service";
export { feeRefundService } from "./feeRefund.service";
export {
  feeReminderService,
  type FeeReminderKind,
  type QueuedFeeMessage,
  type QueueResult,
} from "./feeReminder.service";
export { feeAnalyticsService } from "./feeAnalytics.service";
export {
  feeReceiptDeliveryService,
  type DeliverReceiptInput,
  type DeliverReceiptResult,
} from "./feeReceiptDelivery.service";
export {
  feeCommsService,
  FEE_CONTEXTS,
  type ReceiptRow,
  type ReceiptFilters,
} from "./feeComms.service";
export {
  feeLookupsService,
  type LookupOption,
  type TaxOption,
} from "./feeLookups.service";
export {
  feeAssignmentService,
  type EligibleStudent,
  type AssignFeeStructureInput,
  type AssignResult,
  type PlanStructure,
  type BatchPlanRow,
  type BatchAssignmentPlan,
  type BatchAssignmentChoice,
} from "./feeAssignment.service";
