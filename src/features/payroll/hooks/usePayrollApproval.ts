import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import {
  payrollApprovalService,
  payrollEmailService,
  type PayslipEmailResult,
} from "../services";
import type { ItemComponentPatch } from "../types/payroll.types";

// Query + mutation hooks for the Payroll Approval Center. Reads enrich the
// existing run/items with comparisons + anomalies; mutations drive the
// approve→lock / unlock transitions and field-level salary edits. The approve
// mutation also fans out payslip emails (best-effort) and WhatsApp notices.

const useActor = () => {
  const { user } = useAuth();
  return { id: user?.profileId, name: user?.name };
};

const clientMeta = () => ({
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
});

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.payroll.all });

export const useApprovalGrid = (runId: string | null) =>
  useQuery({
    queryKey: queryKeys.payroll.approvalGrid(runId ?? ""),
    queryFn: () => payrollApprovalService.getApprovalGrid(runId as string),
    enabled: !!runId,
  });

export const useApprovalSummary = (runId: string | null) =>
  useQuery({
    queryKey: queryKeys.payroll.approvalSummary(runId ?? ""),
    queryFn: () => payrollApprovalService.getApprovalSummary(runId as string),
    enabled: !!runId,
  });

export const usePendingMonthlyPayroll = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.payroll.pendingMonthly(),
    queryFn: () => payrollApprovalService.getPendingMonthly(),
    enabled,
    refetchInterval: 5 * 60 * 1000, // keep the dashboard alert fresh
  });

export const useItemHistory = (itemId: string | null) =>
  useQuery({
    queryKey: queryKeys.payroll.itemHistory(itemId ?? ""),
    queryFn: () => payrollApprovalService.getItemHistory(itemId as string),
    enabled: !!itemId,
  });

export const useUpdateItemBreakdown = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { itemId: string; patch: ItemComponentPatch; reason: string }) =>
      payrollApprovalService.updateItemBreakdown(args.itemId, args.patch, {
        actor,
        reason: args.reason,
        clientMeta: clientMeta(),
      }),
    onSuccess: () => invalidateAll(qc),
  });
};

export interface ApproveResult {
  staffCount: number;
  totalNet: number;
  emails: PayslipEmailResult[];
}

export const useApproveAndLock = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation<ApproveResult, Error, { runId: string; month: string }>({
    mutationFn: async ({ runId, month }) => {
      const { staffCount, totalNet } = await payrollApprovalService.approveAndLock(runId, {
        actor,
        clientMeta: clientMeta(),
      });

      // Email automation is best-effort — a failed send never un-approves
      // payroll. Each employee's branded email carries their OWN net salary.
      let emails: PayslipEmailResult[] = [];
      try {
        emails = await payrollEmailService.sendApprovedPayslips(runId, month);
        const sent = emails.filter((e) => e.status === "sent").length;
        await payrollApprovalService.recordEmailsSent(runId, sent);
      } catch {
        /* email automation is best-effort */
      }
      return { staffCount, totalNet, emails };
    },
    onSuccess: () => invalidateAll(qc),
  });
};

export const useUnlockPayroll = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { runId: string; reason: string }) =>
      payrollApprovalService.unlock(args.runId, args.reason, {
        actor,
        clientMeta: clientMeta(),
      }),
    onSuccess: () => invalidateAll(qc),
  });
};
