import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { financeAuditService, financeBudgetService } from "../services";
import { formatINR } from "../utils/financeCalc";
import type { FinanceBudgetInput } from "../types/finance.types";

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.finance.all });

export const useFinanceBudgets = () =>
  useQuery({
    queryKey: queryKeys.finance.budgets(),
    queryFn: () => financeBudgetService.list(),
  });

export const useFinanceBudget = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.finance.budget(id ?? ""),
    queryFn: () => financeBudgetService.getById(id as string),
    enabled: !!id,
  });

export const useCreateBudget = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: FinanceBudgetInput) =>
      financeBudgetService.create(input, actor.actorId),
    onSuccess: (b) => {
      financeAuditService.log(
        "budget",
        b.id,
        "created",
        `Budget ${formatINR(b.amount)} (${b.period}) created`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useUpdateBudget = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; input: FinanceBudgetInput }) =>
      financeBudgetService.update(args.id, args.input),
    onSuccess: (b) => {
      financeAuditService.log("budget", b.id, "updated", "Budget edited", actor);
      invalidate(qc);
    },
  });
};

export const useDeleteBudget = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => financeBudgetService.remove(id),
    onSuccess: (_d, id) => {
      financeAuditService.log("budget", id, "deleted", "Budget deleted", actor);
      invalidate(qc);
    },
  });
};
