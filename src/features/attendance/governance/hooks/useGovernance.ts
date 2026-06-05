import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { useMarker } from "../../hooks/useMarker";
import {
  approvalsService,
  closingService,
  complianceService,
  governanceAuditService,
  locksService,
} from "../services";
import type {
  ApprovalInput,
  ApprovalRequestType,
  ApprovalStatus,
  AttendanceApproval,
  GovScope,
  LockInput,
  LockPeriodType,
} from "../types/governance.types";

const onErr = (err: unknown) => toast.error(err instanceof Error ? err.message : "Action failed");

// ── Locks ─────────────────────────────────────────────────────────────────────
export const useAttendanceLocks = () =>
  useQuery({ queryKey: queryKeys.attendance.locks(), queryFn: () => locksService.list() });

export const useLockMutations = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  const bust = () => qc.invalidateQueries({ queryKey: queryKeys.attendance.all });

  const lock = useMutation({
    mutationFn: (input: LockInput) => locksService.lock(input, marker),
    onSuccess: () => {
      bust();
      toast.success("Period locked");
    },
    onError: onErr,
  });

  const setLocked = useMutation({
    mutationFn: (v: { id: string; locked: boolean; reason?: string }) =>
      locksService.setLocked(v.id, v.locked, marker, v.reason),
    onSuccess: (_d, v) => {
      bust();
      toast.success(v.locked ? "Period locked" : "Period unlocked");
    },
    onError: onErr,
  });

  const remove = useMutation({
    mutationFn: (id: string) => locksService.remove(id),
    onSuccess: () => {
      bust();
      toast.success("Lock removed");
    },
    onError: onErr,
  });

  return { lock, setLocked, remove };
};

// ── Closings ──────────────────────────────────────────────────────────────────
export const useAttendanceClosings = () =>
  useQuery({ queryKey: queryKeys.attendance.closings(), queryFn: () => closingService.list() });

export const useClosingMutations = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  const bust = () => qc.invalidateQueries({ queryKey: queryKeys.attendance.all });

  const close = useMutation({
    mutationFn: (v: { scope: GovScope; month: string; remarks?: string }) =>
      closingService.close(v.scope, v.month, v.remarks, marker),
    onSuccess: () => {
      bust();
      toast.success("Month closed");
    },
    onError: onErr,
  });

  const reopen = useMutation({
    mutationFn: (v: { scope: GovScope; month: string; reason: string }) =>
      closingService.reopen(v.scope, v.month, v.reason, marker),
    onSuccess: () => {
      bust();
      toast.success("Month reopened");
    },
    onError: onErr,
  });

  return { close, reopen };
};

// ── Approvals ─────────────────────────────────────────────────────────────────
export const useAttendanceApprovals = (filters: { status?: ApprovalStatus | "all"; requestType?: ApprovalRequestType | "all" } = {}) =>
  useQuery({
    queryKey: queryKeys.attendance.approvals(filters),
    queryFn: () => approvalsService.list(filters),
  });

export const useApprovalMutations = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  const bust = () => qc.invalidateQueries({ queryKey: queryKeys.attendance.all });

  const create = useMutation({
    mutationFn: (input: ApprovalInput) => approvalsService.create(input, marker),
    onSuccess: () => {
      bust();
      toast.success("Request submitted for approval");
    },
    onError: onErr,
  });

  const decide = useMutation({
    mutationFn: (v: { approval: AttendanceApproval; decision: Exclude<ApprovalStatus, "pending">; note?: string }) =>
      approvalsService.decide(v.approval, v.decision, v.note, marker),
    onSuccess: (_d, v) => {
      bust();
      toast.success(`Request ${v.decision}`);
    },
    onError: onErr,
  });

  return { create, decide };
};

// ── Audit center ──────────────────────────────────────────────────────────────
export const useGovernanceAudit = (filters: { entityType?: string; action?: string } = {}) =>
  useQuery({
    queryKey: queryKeys.attendance.govAudit(filters),
    queryFn: () => governanceAuditService.list(filters),
  });

// ── Compliance ────────────────────────────────────────────────────────────────
export const useComplianceSnapshot = () =>
  useQuery({
    queryKey: queryKeys.attendance.compliance(),
    queryFn: () => complianceService.snapshot(),
    staleTime: 60 * 1000,
  });

export type { LockPeriodType };
