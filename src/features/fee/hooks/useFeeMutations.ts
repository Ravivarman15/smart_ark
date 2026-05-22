import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac";
import { studentFeeService, feeReminderService } from "../services";
import type {
  CollectPaymentInput,
  ScheduleInstallmentsInput,
  StudentFee,
  UpdateStudentFeeInput,
} from "../types/fee.types";

// ─────────────────────────────────────────────────────────────────────────────
// Mutations against the student-fee ledger. Each one invalidates the whole
// `fees` query tree so balances, analytics and installment views stay in sync.
//
// Discount approval is RBAC-aware: a user who holds `fee.discount.approve`
// applies discounts that take effect immediately; everyone else creates a
// PENDING discount that an approver must clear.
// ─────────────────────────────────────────────────────────────────────────────

const invalidateFees = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.fees.all });

/** Collect a payment and return the receipt result. */
export const useCollectPayment = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: Omit<CollectPaymentInput, "createdBy">) =>
      studentFeeService.collectPayment({
        ...input,
        createdBy: user?.profileId,
      }),
    onSuccess: () => invalidateFees(qc),
  });
};

/** Apply a discount — auto-approved only if the user may approve discounts. */
export const useApplyDiscount = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { canDo } = useCanDo();
  return useMutation({
    mutationFn: (input: { studentFeeId: string; discountAmount: number }) =>
      studentFeeService.applyDiscount({
        ...input,
        autoApprove: canDo("fee.discount.approve"),
        approverId: user?.profileId,
      }),
    onSuccess: () => invalidateFees(qc),
  });
};

export const useApproveDiscount = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (studentFeeId: string) =>
      studentFeeService.approveDiscount(studentFeeId, user?.profileId),
    onSuccess: () => invalidateFees(qc),
  });
};

export const useRejectDiscount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentFeeId: string) =>
      studentFeeService.rejectDiscount(studentFeeId),
    onSuccess: () => invalidateFees(qc),
  });
};

export const useUpdateStudentFee = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: UpdateStudentFeeInput }) =>
      studentFeeService.updateRecord(args.id, args.input),
    onSuccess: () => invalidateFees(qc),
  });
};

export const useSetDueDate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; dueDate: string }) =>
      studentFeeService.setDueDate(args.id, args.dueDate),
    onSuccess: () => invalidateFees(qc),
  });
};

export const useScheduleInstallments = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: Omit<ScheduleInstallmentsInput, "createdBy">) =>
      studentFeeService.scheduleInstallments({
        ...input,
        createdBy: user?.profileId,
      }),
    onSuccess: () => invalidateFees(qc),
  });
};

/** Queue WhatsApp/SMS reminders for the supplied (unpaid) fees. */
export const useQueueFeeReminders = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (fees: StudentFee[]) =>
      feeReminderService.queueDueReminders(fees, user?.profileId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.fees.analytics("reminders") }),
  });
};
