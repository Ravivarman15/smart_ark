import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { classReminderService, scheduleService } from "../services";
import { captureContext } from "../utils/clientContext";
import type {
  ScheduleFilters,
  ScheduleInput,
  ScheduleStatus,
} from "../types/allocation.types";

/** List schedules (filtered). RLS scopes what each role can read. */
export const useSchedules = (filters: ScheduleFilters = {}) =>
  useQuery({
    queryKey: queryKeys.allocation.schedules(filters as Record<string, unknown>),
    queryFn: () => scheduleService.list(filters),
  });

/** A teacher's own schedule (My Classes). */
export const useMySchedule = (filters: ScheduleFilters = {}) => {
  const { user } = useAuth();
  const teacherId = user?.profileId;
  return useQuery({
    queryKey: queryKeys.allocation.schedules({ ...filters, mine: teacherId ?? "none" }),
    queryFn: () => scheduleService.list({ ...filters, teacherId }),
    enabled: !!teacherId,
  });
};

export const useScheduleMutations = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const actor = { id: user?.profileId };
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.allocation.all });
    // teaching hours feed dashboards + payroll previews
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };

  const create = useMutation({
    mutationFn: (input: ScheduleInput) =>
      scheduleService.create(input, { coordinatorId: user?.profileId, actor }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; input: ScheduleInput }) =>
      scheduleService.update(v.id, v.input, actor),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: ScheduleStatus; reason?: string }) => {
      await scheduleService.setStatus(v.id, v.status, v.reason);
      // Cancelling a class also informs the students/parents of that batch
      // (settings-gated event, default OFF). Done here rather than inside the
      // service to keep the schedule ↔ reminder services free of a cycle.
      if (v.status === "cancelled") {
        const sched = await scheduleService.get(v.id);
        if (sched) await classReminderService.notifyCancellation(sched);
      }
    },
    onSuccess: invalidate,
  });
  const reschedule = useMutation({
    mutationFn: (v: { id: string; date: string; start: string; end: string }) =>
      scheduleService.reschedule(v.id, v.date, v.start, v.end, actor),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => scheduleService.remove(id),
    onSuccess: invalidate,
  });

  return { create, update, setStatus, reschedule, remove };
};

/** Phase-2 lifecycle + operations (start / complete / substitute / transfer). */
export const useScheduleOps = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const actor = { id: user?.profileId, name: user?.name, role: user?.role };
  const isOverride = user?.role === "management" || user?.role === "admin";
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.allocation.all });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };

  // Smart Start / End — capture device, browser, IP and (when already granted)
  // GPS so the class-tracking audit is complete. Capture never blocks: it
  // resolves with whatever it could read.
  const start = useMutation({
    mutationFn: async (id: string) =>
      scheduleService.start(id, actor, await captureContext({ geo: true })),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: async (id: string) =>
      scheduleService.complete(id, actor, await captureContext()),
    onSuccess: invalidate,
  });
  const assignSubstitute = useMutation({
    mutationFn: (v: { id: string; substituteId: string }) =>
      scheduleService.assignSubstitute(v.id, v.substituteId, { isOverride, actor }),
    onSuccess: invalidate,
  });
  const transfer = useMutation({
    mutationFn: (v: { id: string; newTeacherId: string }) =>
      scheduleService.transfer(v.id, v.newTeacherId, actor),
    onSuccess: invalidate,
  });

  return { start, complete, assignSubstitute, transfer };
};
