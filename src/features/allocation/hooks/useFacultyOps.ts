import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import {
  allocationReportsService,
  classAuditService,
  classMonitorService,
  classReminderService,
  facultyInsightsService,
  facultyWorkloadService,
} from "../services";
import type { AllocationReportKey } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Phase-3 faculty-tracking hooks: the realtime board, workload, insights,
// reports, audit and the reminder sweep. Scope is derived from the signed-in
// role so a coordinator's queries are automatically limited to their own staff
// (RLS enforces the same server-side).
// ─────────────────────────────────────────────────────────────────────────────

/** Coordinators are scoped to themselves; management/admin see everything. */
export const useScope = () => {
  const { user } = useAuth();
  const isManagement = user?.role === "management" || user?.role === "admin";
  return useMemo(
    () => ({
      isManagement,
      coordinatorId: isManagement ? undefined : user?.profileId,
      scopeKey: isManagement ? "all" : (user?.profileId ?? "none"),
    }),
    [isManagement, user?.profileId],
  );
};

/**
 * The realtime class monitor. Polls once a minute so the LIVE timers tick and
 * newly started classes appear without a manual refresh.
 */
export const useClassMonitor = (date: string, opts: { refetchMs?: number } = {}) => {
  const { coordinatorId, scopeKey } = useScope();
  return useQuery({
    queryKey: queryKeys.allocation.monitor(date, scopeKey),
    queryFn: () => classMonitorService.board(date, { coordinatorId }),
    refetchInterval: opts.refetchMs ?? 60_000,
    refetchOnWindowFocus: true,
  });
};

/** Faculty workload + expected salary for a window. */
export const useFacultyWorkload = (from: string, to: string, teacherId?: string) => {
  const { coordinatorId, scopeKey } = useScope();
  return useQuery({
    queryKey: queryKeys.allocation.workload(from, to, teacherId ?? scopeKey),
    queryFn: () => facultyWorkloadService.list(from, to, { coordinatorId, teacherId }),
  });
};

/** One teacher's own workload card (My Classes). */
export const useMyWorkload = (from: string, to: string) => {
  const { user } = useAuth();
  const teacherId = user?.profileId;
  return useQuery({
    queryKey: queryKeys.allocation.workload(from, to, `mine:${teacherId ?? "none"}`),
    queryFn: () => facultyWorkloadService.forTeacher(teacherId as string, from, to),
    enabled: !!teacherId,
  });
};

/** Deterministic faculty insight cards. */
export const useFacultyInsights = (from: string, to: string) => {
  const { coordinatorId, scopeKey } = useScope();
  return useQuery({
    queryKey: queryKeys.allocation.insights(from, to, scopeKey),
    queryFn: () => facultyInsightsService.list(from, to, { coordinatorId }),
  });
};

/** One export-ready report dataset. */
export const useAllocationReport = (
  key: AllocationReportKey,
  from: string,
  to: string,
  enabled = true,
) => {
  const { coordinatorId, scopeKey } = useScope();
  return useQuery({
    queryKey: queryKeys.allocation.report(key, from, to, scopeKey),
    queryFn: () => allocationReportsService.build(key, from, to, { coordinatorId }),
    enabled,
  });
};

/** Audit trail — for one class, or recent activity across all classes. */
export const useClassAudit = (classScheduleId?: string, limit = 100) =>
  useQuery({
    queryKey: queryKeys.allocation.audit(classScheduleId ?? `recent:${limit}`),
    queryFn: () =>
      classScheduleId
        ? classAuditService.forSchedule(classScheduleId)
        : classAuditService.recent(limit),
  });

/**
 * Reminder sweep — dispatches the 15-min / 5-min / attendance-missing
 * notifications for a date. Runs while a coordinator or management user has the
 * live board open, which is exactly when classes are happening, so no server
 * cron is required. Each send is stamped in the DB, so multiple open boards can
 * never double-send.
 */
export const useReminderSweep = (date: string, enabled: boolean, everyMs = 120_000) => {
  const { coordinatorId } = useScope();
  const running = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      if (running.current || cancelled) return;
      running.current = true;
      try {
        await classReminderService.runSweep(date, { coordinatorId });
      } catch {
        /* the sweep is best-effort — never surfaces an error to the board */
      } finally {
        running.current = false;
      }
    };
    void tick();
    const timer = setInterval(tick, everyMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [date, enabled, everyMs, coordinatorId]);
};

/** Manual "send due reminders now" action (coordinator override). */
export const useRunReminderSweep = (date: string) => {
  const qc = useQueryClient();
  const { coordinatorId } = useScope();
  return useMutation({
    mutationFn: () => classReminderService.runSweep(date, { coordinatorId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.allocation.all }),
  });
};
