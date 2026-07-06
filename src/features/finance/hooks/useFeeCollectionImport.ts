import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { feeCollectionImportService } from "../services";
import type {
  CollectedPayment,
  FeeCollectionFilters,
} from "../types/financeImport.types";

// ─────────────────────────────────────────────────────────────────────────────
// Hooks for the "Import Student Fee Collection" popup (Phase 1). The list query
// reads collected payments enriched with their imported-status; the mutation
// posts the selected payments to Income via the idempotent sync service and
// invalidates the whole finance + dashboard trees so the new income + KPIs
// refresh immediately (the FinanceRealtimeProvider does the same across tabs).
// ─────────────────────────────────────────────────────────────────────────────

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

export const useCollectedPayments = (
  filters: FeeCollectionFilters,
  enabled = true,
) =>
  useQuery({
    queryKey: [...queryKeys.finance.all, "fee-import", filters] as const,
    queryFn: () => feeCollectionImportService.listCollectedPayments(filters),
    enabled,
  });

export const useImportFeePayments = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (payments: CollectedPayment[]) =>
      feeCollectionImportService.importPayments(payments, actor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.finance.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });
    },
  });
};
