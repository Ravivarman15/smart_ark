import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { studentFeeService } from "../services";

// Query hooks for student fee records + their installment history.

/** Student fee ledger. `unpaidOnly` powers the collection view. */
export const useStudentFees = (params?: { unpaidOnly?: boolean }) =>
  useQuery({
    queryKey: queryKeys.fees.list(params),
    queryFn: () => studentFeeService.list(params),
  });

/** Installments + scheduled plan for one fee. Disabled until an id is given. */
export const useFeeInstallments = (studentFeeId: string | null) =>
  useQuery({
    queryKey: queryKeys.fees.installments(studentFeeId ?? ""),
    queryFn: () => studentFeeService.listInstallments(studentFeeId as string),
    enabled: !!studentFeeId,
  });
