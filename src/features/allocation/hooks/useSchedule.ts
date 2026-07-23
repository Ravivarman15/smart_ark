import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { scheduleService } from "../services";
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
    mutationFn: (v: { id: string; status: ScheduleStatus; reason?: string }) =>
      scheduleService.setStatus(v.id, v.status, v.reason),
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
  const actor = { id: user?.profileId };
  const isOverride = user?.role === "management" || user?.role === "admin";
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.allocation.all });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };

  const start = useMutation({
    mutationFn: (id: string) => scheduleService.start(id, actor),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: (id: string) => scheduleService.complete(id, actor),
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
