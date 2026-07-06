import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { salaryImportService } from "../services";
import type {
  SalaryImportFilters,
  SalaryLine,
} from "../types/financeImport.types";

// ─────────────────────────────────────────────────────────────────────────────
// Hooks for the "Import Staff Salary" popup (Phase 2). Lists salary lines from
// approved/paid payroll runs and posts the selected ones to Expense via the
// idempotent sync service, busting the finance + dashboard + reports trees.
// ─────────────────────────────────────────────────────────────────────────────

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

export const useSalaryLines = (filters: SalaryImportFilters, enabled = true) =>
  useQuery({
    queryKey: [...queryKeys.finance.all, "salary-import", filters] as const,
    queryFn: () => salaryImportService.listSalaryLines(filters),
    enabled,
  });

export const useImportSalaryLines = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (lines: SalaryLine[]) =>
      salaryImportService.importSalaryLines(lines, actor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.finance.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });
    },
  });
};
