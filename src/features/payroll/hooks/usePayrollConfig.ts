import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { payrollConfigService, payrollAuditService, payrollNotifyService } from "../services";
import { formatINR } from "../utils/payrollCalc";
import type {
  PayrollRuleInput,
  PayrollSettingsInput,
  RoleRateInput,
  ShiftInput,
  StaffRateInput,
} from "../types/payroll.types";

// Query + mutation hooks for Salary Configuration (role rates, staff overrides,
// shifts, rules, settings). Audit logging happens in onSuccess; the realtime
// provider keeps the cache live across clients.

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.payroll.all });

// ── Role rates ────────────────────────────────────────────────────────────────
export const useRoleRates = () =>
  useQuery({
    queryKey: queryKeys.payroll.roleRates(),
    queryFn: () => payrollConfigService.listRoleRates(),
  });

export const useSaveRoleRate = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: RoleRateInput) =>
      payrollConfigService.upsertRoleRate(input, actor.actorId),
    onSuccess: (id, input) => {
      payrollAuditService.log({
        entityType: "role_rate",
        entityId: id,
        action: "saved",
        detail: `${input.role} → ${formatINR(input.hourlyRate)}/hr`,
        actor,
      });
      invalidate(qc);
    },
  });
};

export const useDeleteRoleRate = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => payrollConfigService.removeRoleRate(id),
    onSuccess: (_d, id) => {
      payrollAuditService.log({ entityType: "role_rate", entityId: id, action: "deleted", actor });
      invalidate(qc);
    },
  });
};

// ── Staff rates ───────────────────────────────────────────────────────────────
export const useStaffRates = () =>
  useQuery({
    queryKey: queryKeys.payroll.staffRates(),
    queryFn: () => payrollConfigService.listStaffRates(),
  });

export const useSaveStaffRate = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: StaffRateInput) =>
      payrollConfigService.upsertStaffRate(input, actor.actorId),
    onSuccess: (id, input) => {
      payrollAuditService.log({
        entityType: "staff_rate",
        entityId: id,
        action: "saved",
        detail: input.hourlyRate ? `${formatINR(input.hourlyRate)}/hr` : "salary updated",
        actor,
      });
      invalidate(qc);
    },
  });
};

export const useDeleteStaffRate = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => payrollConfigService.removeStaffRate(id),
    onSuccess: (_d, id) => {
      payrollAuditService.log({ entityType: "staff_rate", entityId: id, action: "deleted", actor });
      invalidate(qc);
    },
  });
};

// ── Shifts ────────────────────────────────────────────────────────────────────
export const useShifts = () =>
  useQuery({
    queryKey: queryKeys.payroll.shifts(),
    queryFn: () => payrollConfigService.listShifts(),
  });

export const useSaveShift = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { input: ShiftInput; id?: string; notify?: string[] }) =>
      payrollConfigService.saveShift(args.input, args.id, actor.actorId),
    onSuccess: (id, args) => {
      payrollAuditService.log({
        entityType: "shift",
        entityId: id,
        action: args.id ? "updated" : "created",
        detail: `${args.input.startTime}–${args.input.endTime} (${args.input.scope}:${args.input.scopeRef})`,
        actor,
      });
      // Notify affected staff of the timing change (best-effort).
      for (const staffId of args.notify ?? []) {
        void payrollNotifyService.notifyShiftChange({
          staffId,
          startTime: args.input.startTime,
          endTime: args.input.endTime,
        });
      }
      invalidate(qc);
    },
  });
};

export const useDeleteShift = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => payrollConfigService.removeShift(id),
    onSuccess: (_d, id) => {
      payrollAuditService.log({ entityType: "shift", entityId: id, action: "deleted", actor });
      invalidate(qc);
    },
  });
};

// ── Rules ─────────────────────────────────────────────────────────────────────
export const useRules = () =>
  useQuery({
    queryKey: queryKeys.payroll.rules(),
    queryFn: () => payrollConfigService.listRules(),
  });

export const useSaveRule = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { input: PayrollRuleInput; id?: string }) =>
      payrollConfigService.saveRule(args.input, args.id, actor.actorId),
    onSuccess: (id, args) => {
      payrollAuditService.log({
        entityType: "rule",
        entityId: id,
        action: args.id ? "updated" : "created",
        detail: `${args.input.ruleType}: ${args.input.name}`,
        actor,
      });
      invalidate(qc);
    },
  });
};

export const useDeleteRule = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => payrollConfigService.removeRule(id),
    onSuccess: (_d, id) => {
      payrollAuditService.log({ entityType: "rule", entityId: id, action: "deleted", actor });
      invalidate(qc);
    },
  });
};

// ── Settings ──────────────────────────────────────────────────────────────────
export const usePayrollSettings = () =>
  useQuery({
    queryKey: queryKeys.payroll.settings(),
    queryFn: () => payrollConfigService.getSettings(),
  });

export const useUpdatePayrollSettings = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: PayrollSettingsInput) =>
      payrollConfigService.updateSettings(input),
    onSuccess: () => {
      payrollAuditService.log({
        entityType: "settings",
        entityId: "singleton",
        action: "updated",
        actor,
      });
      invalidate(qc);
    },
  });
};

// ── Lookups ───────────────────────────────────────────────────────────────────
export const useRoleOptions = () =>
  useQuery({
    queryKey: queryKeys.payroll.lookups("roles"),
    queryFn: () => payrollConfigService.roleOptions(),
  });

export const useDepartmentOptions = () =>
  useQuery({
    queryKey: queryKeys.payroll.lookups("departments"),
    queryFn: () => payrollConfigService.departmentOptions(),
  });
