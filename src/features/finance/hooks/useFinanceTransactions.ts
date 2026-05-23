import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import {
  financeAuditService,
  financeTransactionService,
} from "../services";
import { formatINR } from "../utils/financeCalc";
import type {
  FinanceFilters,
  FinanceTransactionInput,
  TransactionStatus,
} from "../types/finance.types";

// Query + mutation hooks for finance transactions (expenses + incomes share
// one table — the `type` discriminator differentiates).

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.finance.all });

export const useFinanceTransactions = (filters: FinanceFilters = {}) =>
  useQuery({
    queryKey: queryKeys.finance.expenses(filters),
    queryFn: () => financeTransactionService.list(filters),
  });

export const useFinanceTransaction = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.finance.expense(id ?? ""),
    queryFn: () => financeTransactionService.getById(id as string),
    enabled: !!id,
  });

export const useCreateTransaction = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: FinanceTransactionInput) =>
      financeTransactionService.create(input, actor.actorId),
    onSuccess: (tx) => {
      financeAuditService.log(
        "transaction",
        tx.id,
        "created",
        `${tx.type === "income" ? "Income" : "Expense"} ${formatINR(tx.amount)} — ${tx.category}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useUpdateTransaction = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; input: FinanceTransactionInput }) =>
      financeTransactionService.update(args.id, args.input),
    onSuccess: (tx) => {
      financeAuditService.log(
        "transaction",
        tx.id,
        "updated",
        `${tx.type === "income" ? "Income" : "Expense"} edited`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useApproveTransaction = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) =>
      financeTransactionService.approve(id, {
        id: actor.actorId,
        name: actor.actorName,
      }),
    onSuccess: (_d, id) => {
      financeAuditService.log(
        "transaction",
        id,
        "approved",
        "Transaction approved",
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useRejectTransaction = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; reason: string }) =>
      financeTransactionService.reject(args.id, args.reason, {
        id: actor.actorId,
        name: actor.actorName,
      }),
    onSuccess: (_d, args) => {
      financeAuditService.log(
        "transaction",
        args.id,
        "rejected",
        `Rejected — ${args.reason}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useMarkTransactionPaid = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => financeTransactionService.markPaid(id),
    onSuccess: (_d, id) => {
      financeAuditService.log(
        "transaction",
        id,
        "paid",
        "Marked as paid",
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useSetTransactionStatus = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; status: TransactionStatus }) =>
      financeTransactionService.setStatus(args.id, args.status),
    onSuccess: (_d, args) => {
      financeAuditService.log(
        "transaction",
        args.id,
        `status_${args.status}`,
        `Status → ${args.status}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useDeleteTransaction = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => financeTransactionService.remove(id),
    onSuccess: (_d, id) => {
      financeAuditService.log(
        "transaction",
        id,
        "deleted",
        "Transaction deleted",
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useBulkApproveTransactions = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (ids: string[]) =>
      financeTransactionService.bulkApprove(ids, {
        id: actor.actorId,
        name: actor.actorName,
      }),
    onSuccess: (_d, ids) => {
      for (const id of ids) {
        financeAuditService.log(
          "transaction",
          id,
          "bulk_approved",
          "Bulk approval",
          actor,
        );
      }
      invalidate(qc);
    },
  });
};

export const useBulkDeleteTransactions = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (ids: string[]) => financeTransactionService.bulkDelete(ids),
    onSuccess: (_d, ids) => {
      for (const id of ids) {
        financeAuditService.log(
          "transaction",
          id,
          "bulk_deleted",
          "Bulk delete",
          actor,
        );
      }
      invalidate(qc);
    },
  });
};
