import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feesService } from "../services/fees.service";
import type { FeeRecord } from "../types/fee.types";

/**
 * Mark a legacy fee_transactions row as paid.
 * Optimistic: flips the row's `paid` immediately in the cached list.
 */
export const useMarkFeePaid = () => {
  const qc = useQueryClient();

  return useMutation<void, Error, string, { snapshot?: FeeRecord[] }>({
    mutationFn: (id) => feesService.markPaid(id),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.fees.list() });
      const snapshot = qc.getQueryData<FeeRecord[]>(queryKeys.fees.list());
      if (snapshot) {
        qc.setQueryData<FeeRecord[]>(
          queryKeys.fees.list(),
          snapshot.map((f) =>
            f.id === id ? { ...f, paid: true, paidDate: new Date().toISOString().split("T")[0] } : f
          )
        );
      }
      return { snapshot };
    },

    onError: (_e, _id, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(queryKeys.fees.list(), ctx.snapshot);
    },

    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.fees.all }),
  });
};
