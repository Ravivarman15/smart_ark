import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feesService } from "../services/fees.service";

/**
 * List all fee records (merged: student_fees + legacy fee_transactions).
 * Heavier than the per-student lookup — pages that only need one record
 * should use `useFee(id)` instead.
 */
export const useFees = () =>
  useQuery({
    queryKey: queryKeys.fees.list(),
    queryFn: () => feesService.list(),
  });
