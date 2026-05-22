import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac";
import { feeRefundService } from "../services";
import type { IssueRefundInput } from "../types/fee.types";

// Refund hooks. Issuing a refund auto-settles only when the user holds
// `fee.refund.approve`; otherwise it is recorded as pending approval.

export const useFeeRefunds = () =>
  useQuery({
    queryKey: queryKeys.fees.refunds(),
    queryFn: () => feeRefundService.list(),
  });

export const useIssueRefund = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { canDo } = useCanDo();
  return useMutation({
    mutationFn: (
      input: Omit<IssueRefundInput, "autoApprove" | "issuedBy">,
    ) =>
      feeRefundService.issue({
        ...input,
        autoApprove: canDo("fee.refund.approve"),
        issuedBy: user?.profileId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.all }),
  });
};

export const useApproveRefund = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (refundId: string) => feeRefundService.approve(refundId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.all }),
  });
};

export const useRejectRefund = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (refundId: string) => feeRefundService.reject(refundId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.all }),
  });
};
