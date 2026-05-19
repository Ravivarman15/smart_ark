import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { refundsService } from "../services/refunds.service";

interface IssueArgs {
  feeRefId: string;
  amount: number;
  reason?: string;
}

/**
 * Issue a refund. Not optimistic — financial state must reflect server truth.
 * Once a `refunds` audit table is added, this hook should also invalidate the
 * "refund history" query key.
 */
export const useIssueRefund = () => {
  const qc = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof refundsService.issue>>,
    Error,
    IssueArgs
  >({
    mutationFn: (args) => refundsService.issue(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.all }),
  });
};
