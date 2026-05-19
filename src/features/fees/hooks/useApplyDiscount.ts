import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feesService } from "../services/fees.service";

/**
 * Apply a discount to a fee. Not optimistic — discount math affects
 * pending/status across multiple fields and we'd rather re-fetch the row
 * truth than try to mirror the formula client-side.
 */
export const useApplyDiscount = () => {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { feeRefId: string; discount: number }>({
    mutationFn: ({ feeRefId, discount }) => feesService.applyDiscount(feeRefId, discount),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.all }),
  });
};
