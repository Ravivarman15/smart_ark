import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import {
  financeAuditService,
  recurringTransactionService,
} from "../services";
import type { RecurringTransactionInput } from "../types/finance.types";

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.finance.all });

export const useRecurringTransactions = () =>
  useQuery({
    queryKey: queryKeys.finance.recurring(),
    queryFn: () => recurringTransactionService.list(),
  });

export const useRecurringTransaction = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.finance.recurringOne(id ?? ""),
    queryFn: () => recurringTransactionService.getById(id as string),
    enabled: !!id,
  });

export const useCreateRecurring = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: RecurringTransactionInput) =>
      recurringTransactionService.create(input, actor.actorId),
    onSuccess: (r) => {
      financeAuditService.log(
        "recurring",
        r.id,
        "created",
        `Recurring "${r.title}" (${r.frequency}) created`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useUpdateRecurring = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; input: RecurringTransactionInput }) =>
      recurringTransactionService.update(args.id, args.input),
    onSuccess: (r) => {
      financeAuditService.log(
        "recurring",
        r.id,
        "updated",
        "Recurring edited",
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useToggleRecurring = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; isActive: boolean }) =>
      recurringTransactionService.setActive(args.id, args.isActive),
    onSuccess: (_d, args) => {
      financeAuditService.log(
        "recurring",
        args.id,
        args.isActive ? "activated" : "paused",
        `Recurring ${args.isActive ? "activated" : "paused"}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useRunRecurring = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) =>
      recurringTransactionService.runOnce(id, actor.actorId),
    onSuccess: (txId, recurringId) => {
      financeAuditService.log(
        "recurring",
        recurringId,
        "run",
        `Generated transaction ${txId}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useDeleteRecurring = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => recurringTransactionService.remove(id),
    onSuccess: (_d, id) => {
      financeAuditService.log(
        "recurring",
        id,
        "deleted",
        "Recurring deleted",
        actor,
      );
      invalidate(qc);
    },
  });
};
