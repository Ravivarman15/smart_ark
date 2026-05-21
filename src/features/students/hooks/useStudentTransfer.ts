import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { transferService } from "../services/transfer.service";
import type { TransferInput, TransferStatus } from "../types/student.types";

export const useStudentTransfers = (status?: TransferStatus) =>
  useQuery({
    queryKey: queryKeys.students.transfers(status),
    queryFn: () => transferService.list(status ? { status } : undefined),
  });

export const useTransferStudents = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: TransferInput) => transferService.transfer(input, user?.profileId),
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success(`${count} student${count === 1 ? "" : "s"} transferred`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Transfer failed"),
  });
};

export const useRollbackTransfer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transferId: string) => transferService.rollback(transferId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success("Transfer rolled back");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Rollback failed"),
  });
};
