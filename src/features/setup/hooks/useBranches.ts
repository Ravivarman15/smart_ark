import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { branchesService } from "../services/branches.service";
import { billingService } from "@/features/billing/services/billing.service";
import { LOOKUP_STALE_TIME, invalidateSetupLookups } from "../lib/setupSync";
import type { BranchInput } from "../types/setup.types";

// A branch change is not a Setup-only change: `campuses` is read by the student
// form, the finance filter bar, live classes, reports and the comms recipient
// picker. invalidateSetupLookups() fans it out to all of them — without it a
// brand-new branch is missing from every dropdown until the next hard reload.

export const useBranches = () =>
  useQuery({
    queryKey: queryKeys.setup.branches(),
    queryFn: () => branchesService.list(),
    staleTime: LOOKUP_STALE_TIME,
    retry: 2,
    meta: { errorMessage: "Failed to load branches" },
  });

export interface BranchAllowance {
  used: number;
  /** null = unlimited (Enterprise, or an org with no active subscription). */
  limit: number | null;
  atLimit: boolean;
}

/**
 * How many branches this organization's plan allows, and how many are used.
 *
 * Reuses `usage_status()` through the existing billing service rather than
 * adding a second caller of the same RPC — that function is where "branches"
 * is defined for billing, and a private copy of the rule here would be a
 * second definition to keep in step.
 *
 * NOTE it counts `campuses`, while the directory lists `organization_branches`.
 * They agree by construction now (branches are only ever created through
 * create_branch, which writes both), but the count shown to the user is
 * deliberately the one billing charges for.
 *
 * FAILS OPEN. A usage read that errors leaves `data` undefined, and the page
 * treats undefined as "unknown", never as "at limit" — the database trigger is
 * the real enforcement, so a UI that guesses wrong should guess permissive and
 * let the server say no.
 */
export const useBranchUsage = () =>
  useQuery({
    queryKey: queryKeys.setup.branchUsage(),
    queryFn: async (): Promise<BranchAllowance> => {
      const usage = (await billingService.usage()) as Record<
        string,
        { used?: number; limit?: number | null } | undefined
      > | null;
      const row = usage?.branches;
      const used = Number(row?.used ?? 0);
      const limit = row?.limit === null || row?.limit === undefined ? null : Number(row.limit);
      return { used, limit, atLimit: limit !== null && used >= limit };
    },
    staleTime: LOOKUP_STALE_TIME,
    retry: 1,
  });

const refresh = (qc: ReturnType<typeof useQueryClient>) => {
  invalidateSetupLookups(qc);
  qc.refetchQueries({ queryKey: queryKeys.setup.branches() });
  // The plan usage panel reads a different namespace, and "2 of 5" going stale
  // right after you add a branch is exactly when people notice.
  qc.invalidateQueries({ queryKey: queryKeys.setup.branchUsage() });
};

export const useCreateBranch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BranchInput) => branchesService.create(input),
    onSuccess: () => {
      refresh(qc);
      toast.success("Branch created");
    },
    onError: (err) => {
      console.error("[useCreateBranch] error:", err);
      // Includes the plan-limit message raised by the database trigger, which
      // already names the count and tells the user to upgrade.
      toast.error(err instanceof Error ? err.message : "Failed to create branch", {
        duration: 10_000,
      });
    },
  });
};

export const useUpdateBranch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<BranchInput> }) =>
      branchesService.update(id, input),
    onSuccess: () => {
      refresh(qc);
      toast.success("Branch updated");
    },
    onError: (err) => {
      console.error("[useUpdateBranch] error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update branch", {
        duration: 10_000,
      });
    },
  });
};

export const useDeleteBranch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => branchesService.remove(id),
    onSuccess: () => {
      refresh(qc);
      toast.success("Branch deleted");
    },
    onError: (err) => {
      console.error("[useDeleteBranch] error:", err);
      // "still in use by students (12), batches (3)" — the whole point of the
      // long duration is that this one is worth reading.
      toast.error(err instanceof Error ? err.message : "Failed to delete branch", {
        duration: 12_000,
      });
    },
  });
};
