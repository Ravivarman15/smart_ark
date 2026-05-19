import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feesService } from "../services/fees.service";
import { useAuth } from "@/contexts/AuthContext";
import type { CreateFeeRecordInput } from "../types/fee.types";

/**
 * Create a manual fee record (legacy fee_transactions). Modern flow is via
 * the admissions workflow which writes student_fees directly.
 */
export const useCreateFee = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<{ id: string }, Error, CreateFeeRecordInput>({
    mutationFn: (input) => feesService.create(input, user?.profileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.all }),
  });
};
