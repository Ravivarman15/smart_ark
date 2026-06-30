// Hook layer of the Fee feature.
export {
  useFeeStructures,
  useFeeLookups,
  useFeeStructureRevisions,
  useCreateFeeStructure,
  useUpdateFeeStructure,
  useDeleteFeeStructure,
} from "./useFeeStructures";

export { useStudentFees, useFeeInstallments } from "./useStudentFees";

export {
  useCollectPayment,
  useApplyDiscount,
  useApproveDiscount,
  useRejectDiscount,
  useUpdateStudentFee,
  useSetDueDate,
  useScheduleInstallments,
  useQueueFeeReminders,
} from "./useFeeMutations";

export {
  useFeeRefunds,
  useIssueRefund,
  useApproveRefund,
  useRejectRefund,
} from "./useFeeRefunds";

export { useFeeAnalytics, useFeeReminderOutbox } from "./useFeeAnalytics";

export {
  useEligibleStudents,
  useAssignFeeStructure,
  useClassAssignmentPlan,
  useAutoAssignByClass,
} from "./useFeeAssignment";
