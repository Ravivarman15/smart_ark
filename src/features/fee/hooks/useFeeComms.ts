import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import {
  feeCommsService,
  feeReceiptDeliveryService,
  type ReceiptFilters,
} from "../services";
import { studentsService } from "@/features/students/services";

// ─────────────────────────────────────────────────────────────────────────────
// Fee Communication hooks — thin react-query wrappers over feeCommsService
// (reads) + feeReceiptDeliveryService (resend) + studentsService (contact fix).
// All maths lives in utils/feeCommsCalc.ts; the page composes these.
// ─────────────────────────────────────────────────────────────────────────────

/** Every active student's best contact — powers Health + Missing Contact. */
export const useFeeContacts = () =>
  useQuery({
    queryKey: queryKeys.fees.comms("contacts"),
    queryFn: () => feeCommsService.contacts(),
    staleTime: 60_000,
  });

/** Fee-context delivery rows for the recent window — powers Health + Delivery. */
export const useFeeDelivery = (sinceDays = 120) =>
  useQuery({
    queryKey: queryKeys.fees.comms(`delivery:${sinceDays}`),
    queryFn: () => feeCommsService.deliveryRows(sinceDays),
    staleTime: 30_000,
  });

/** Recent failed fee messages — Delivery Dashboard. */
export const useFeeRecentFailures = () =>
  useQuery({
    queryKey: queryKeys.fees.comms("failures"),
    queryFn: () => feeCommsService.recentFailures(25),
    staleTime: 30_000,
  });

/** Collected receipts (with per-channel delivery status) — Bulk Resend. */
export const useFeeReceipts = (filters: ReceiptFilters) =>
  useQuery({
    queryKey: queryKeys.fees.comms(`receipts:${JSON.stringify(filters)}`),
    queryFn: () => feeCommsService.receipts(filters),
    staleTime: 30_000,
  });

export interface ResendTarget {
  studentFeeId: string;
  receiptNo: string;
  amount: number;
  amountPending?: number;
  paymentMethod: string;
  date?: string;
}

/**
 * Bulk (re)send receipts through the EXISTING delivery service. `force` bypasses
 * the enable-gate + duplicate guard (an explicit admin resend). Runs sequentially
 * so a large batch never stampedes the edge functions; returns a per-receipt log.
 */
export const useResendReceipts = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { targets: ResendTarget[]; force?: boolean }) => {
      const results: Array<{
        receiptNo: string;
        whatsapp: string;
        email: string;
        skipped: boolean;
        error?: string;
      }> = [];
      for (const t of args.targets) {
        const r = await feeReceiptDeliveryService.deliverReceipt({
          studentFeeId: t.studentFeeId,
          receiptNo: t.receiptNo,
          amount: t.amount,
          amountPending: t.amountPending ?? 0,
          paymentMethod: t.paymentMethod,
          date: t.date,
          actorId: user?.profileId,
          force: args.force,
        });
        results.push({
          receiptNo: t.receiptNo,
          whatsapp: r.whatsapp,
          email: r.email,
          skipped: r.skipped,
          error: r.emailError ?? r.whatsappError,
        });
      }
      return results;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.comms("receipts") }),
  });
};

/** Bulk-update missing/invalid student contact fields — Missing Contact Center. */
export const useUpdateStudentContacts = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      updates: Array<{ id: string; parentEmail?: string; parentContact?: string }>,
    ) => {
      let ok = 0;
      for (const u of updates) {
        try {
          await studentsService.update(u.id, {
            ...(u.parentEmail !== undefined ? { parentEmail: u.parentEmail } : {}),
            ...(u.parentContact !== undefined ? { parentContact: u.parentContact } : {}),
          });
          ok += 1;
        } catch {
          /* skip the row that failed; report the rest */
        }
      }
      return ok;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.comms("contacts") }),
  });
};
