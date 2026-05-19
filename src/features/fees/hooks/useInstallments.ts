import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { installmentsService } from "../services/installments.service";
import { useAuth } from "@/contexts/AuthContext";

const installmentsKey = (studentFeeId: string) =>
  ["fees", "installments", studentFeeId] as const;

/** Installments for a given student_fees row. */
export const useInstallments = (studentFeeId: string | undefined) =>
  useQuery({
    queryKey: studentFeeId ? installmentsKey(studentFeeId) : ["fees", "installments", "noop"],
    queryFn: () => installmentsService.listForFee(studentFeeId as string),
    enabled: !!studentFeeId,
  });

interface AddArgs {
  feeRefId: string;
  amount: number;
  method: string;
  notes?: string;
}

/**
 * Record a payment. Not optimistic — receipt numbers + totals must come
 * from the authoritative service result (UI shouldn't fake a receipt #).
 */
export const useAddInstallment = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<Awaited<ReturnType<typeof installmentsService.add>>, Error, AddArgs>({
    mutationFn: (args) =>
      installmentsService.add({ ...args, createdByProfileId: user?.profileId }),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.fees.all });
      // Best-effort: if the caller had a studentFeeId, the per-fee
      // installments list would invalidate too. Caller-side invalidation
      // is encouraged when they know the id.
      qc.invalidateQueries({ queryKey: installmentsKey(args.feeRefId) });
    },
  });
};
