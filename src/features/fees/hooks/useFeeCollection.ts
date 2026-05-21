import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feesService } from "../services/fees.service";
import type { FeeRecord } from "../types/fee.types";

/** All fee records (student_fees + legacy fee_transactions) for collection. */
export const useFeeCollection = () =>
  useQuery({
    queryKey: queryKeys.fees.collection(),
    queryFn: () => feesService.list(),
  });

/** The fee record for a single student (by student id). */
export const useStudentFees = (studentId?: string) =>
  useQuery({
    queryKey: queryKeys.fees.collection(),
    queryFn: () => feesService.list(),
    enabled: !!studentId,
    select: (rows: FeeRecord[]) =>
      rows.find((r) => r.studentId === studentId) ?? null,
  });
