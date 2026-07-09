import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac";
import {
  studentFeeService,
  feeReminderService,
  feeReceiptDeliveryService,
} from "../services";
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

/**
 * Collect a payment and return the receipt result. On success, the branded fee
 * receipt is auto-delivered to the parent over Email + WhatsApp via the existing
 * communication engine — fire-and-forget, gated by the `fee_paid` automation
 * toggle (default OFF), and never able to fail the collection itself. This one
 * hook backs single, installment and bulk collection, so all three auto-notify.
 */
export const useCollectPayment = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Omit<CollectPaymentInput, "createdBy">) => {
      const result = await studentFeeService.collectPayment({
        ...input,
        createdBy: user?.profileId,
      });
      // Deliver the branded receipt IMMEDIATELY over Email + WhatsApp and await
      // the outcome so the UI can confirm it (or show the exact reason it
      // didn't). The service never throws — it always resolves a per-channel
      // result — so a comms hiccup can never fail or roll back the collection.
      const delivery = await feeReceiptDeliveryService.deliverReceipt({
        studentFeeId: input.studentFeeId,
        receiptNo: result.receiptNo,
        amount: result.amount,
        amountReceived: result.amountReceived,
        amountPending: result.amountPending,
        paymentMethod: input.method,
        notes: input.notes,
        actorId: user?.profileId,
      });
      return { ...result, delivery };
    },
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
