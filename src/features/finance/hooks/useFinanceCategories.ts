import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import {
  financeAuditService,
  financeCategoryService,
} from "../services";
import type {
  FinanceCategoryInput,
  FinanceKind,
} from "../types/finance.types";

// Query + mutation hooks for finance categories (expense + income types).
// Every write logs a best-effort `finance_audit` row and invalidates the
// finance query tree so list views refresh.

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.finance.all });

export const useFinanceCategories = (kind?: FinanceKind) =>
  useQuery({
    queryKey: queryKeys.finance.categories({ kind: kind ?? "all" }),
    queryFn: () => financeCategoryService.list(kind),
  });

export const useFinanceCategory = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.finance.category(id ?? ""),
    queryFn: () => financeCategoryService.getById(id as string),
    enabled: !!id,
  });

export const useCreateFinanceCategory = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: FinanceCategoryInput) =>
      financeCategoryService.create(input),
    onSuccess: (cat) => {
      financeAuditService.log(
        "category",
        cat.id,
        "created",
        `${cat.kind === "income" ? "Income" : "Expense"} type "${cat.name}" created`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useUpdateFinanceCategory = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; input: FinanceCategoryInput }) =>
      financeCategoryService.update(args.id, args.input),
    onSuccess: (cat) => {
      financeAuditService.log(
        "category",
        cat.id,
        "updated",
        `${cat.kind === "income" ? "Income" : "Expense"} type edited`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useToggleFinanceCategory = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; isActive: boolean }) =>
      financeCategoryService.setActive(args.id, args.isActive),
    onSuccess: (_d, args) => {
      financeAuditService.log(
        "category",
        args.id,
        args.isActive ? "activated" : "deactivated",
        `Category ${args.isActive ? "activated" : "deactivated"}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useDeleteFinanceCategory = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => financeCategoryService.remove(id),
    onSuccess: (_d, id) => {
      financeAuditService.log("category", id, "deleted", "Category deleted", actor);
      invalidate(qc);
    },
  });
};
