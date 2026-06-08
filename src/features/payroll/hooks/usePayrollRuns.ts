import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { payrollRunService, payrollAuditService } from "../services";
import { formatINR } from "../utils/payrollCalc";
import type {
  GeneratePayrollInput,
  PayrollRunStatus,
} from "../types/payroll.types";

// Query + mutation hooks for Salary Processing (generate / approve / pay) and
// Salary Records (register, history, slip). Finance sync + audit run inside the
// service / onSuccess; the realtime provider keeps everything live.

const useActor = () => {
  const { user } = useAuth();
  return { id: user?.profileId, name: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.payroll.all });

export const usePayrollRuns = (filters: {
  status?: PayrollRunStatus;
  from?: string;
  to?: string;
} = {}) =>
  useQuery({
    queryKey: queryKeys.payroll.runs(filters),
    queryFn: () => payrollRunService.listRuns(filters),
  });

export const usePayrollRun = (runId: string | null) =>
  useQuery({
    queryKey: queryKeys.payroll.run(runId ?? ""),
    queryFn: () => payrollRunService.getDetail(runId as string),
    enabled: !!runId,
  });

export const useMyPayrollItems = (staffId: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.payroll.myItems(staffId ?? ""),
    queryFn: () => payrollRunService.itemsForStaff(staffId as string),
    enabled: !!staffId,
  });

export const useGeneratePayroll = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: GeneratePayrollInput) =>
      payrollRunService.generate(input, actor),
    onSuccess: (runId, input) => {
      payrollAuditService.log({
        entityType: "run",
        entityId: runId,
        action: "generated",
        detail: `${input.title} (${input.periodType})`,
        actor: { actorId: actor.id, actorName: actor.name },
      });
      invalidate(qc);
    },
  });
};

export const useApprovePayroll = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (runId: string) => payrollRunService.approve(runId, actor),
    onSuccess: (_d, runId) => {
      payrollAuditService.log({
        entityType: "run",
        entityId: runId,
        action: "approved",
        actor: { actorId: actor.id, actorName: actor.name },
      });
      invalidate(qc);
    },
  });
};

export const useProcessPayment = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { runId: string; paymentMethod?: string }) =>
      payrollRunService.pay(args.runId, args.paymentMethod, actor),
    onSuccess: (res, args) => {
      payrollAuditService.log({
        entityType: "run",
        entityId: args.runId,
        action: "paid",
        detail: res.financeTxnId ? "Synced to Finance" : "Paid (no finance sync)",
        actor: { actorId: actor.id, actorName: actor.name },
      });
      invalidate(qc);
    },
  });
};

export const useSetRunStatus = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { runId: string; status: PayrollRunStatus }) =>
      args.status === "cancelled"
        ? payrollRunService.cancel(args.runId)
        : payrollRunService.setRunStatus(args.runId, args.status),
    onSuccess: (_d, args) => {
      payrollAuditService.log({
        entityType: "run",
        entityId: args.runId,
        action: `status_${args.status}`,
        actor: { actorId: actor.id, actorName: actor.name },
      });
      invalidate(qc);
    },
  });
};

export const useDeletePayrollRun = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (runId: string) => payrollRunService.deleteRun(runId),
    onSuccess: (_d, runId) => {
      payrollAuditService.log({
        entityType: "run",
        entityId: runId,
        action: "deleted",
        actor: { actorId: actor.id, actorName: actor.name },
      });
      invalidate(qc);
    },
  });
};

export const useUpdatePayrollItem = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: {
      itemId: string;
      patch: {
        incentives?: number;
        allowances?: number;
        deductions?: number;
        penalties?: number;
        notes?: string;
      };
    }) => payrollRunService.updateItemAmounts(args.itemId, args.patch),
    onSuccess: (_d, args) => {
      payrollAuditService.log({
        entityType: "item",
        entityId: args.itemId,
        action: "adjusted",
        detail: formatINR(args.patch.deductions ?? args.patch.incentives ?? 0),
        actor: { actorId: actor.id, actorName: actor.name },
      });
      invalidate(qc);
    },
  });
};
