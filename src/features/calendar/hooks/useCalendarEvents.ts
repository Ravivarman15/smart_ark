// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — React Query Hooks
// ──────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { calendarService } from "../services/calendar.service";
import { calendarIntegrationsService } from "../services/calendarIntegrations.service";
import type {
  CalendarEvent,
  CreateCalendarEventInput,
  EventAudienceTargetType,
  EventFilter,
  UpdateCalendarEventInput,
} from "../types/calendar.types";

export const CALENDAR_KEYS = {
  all: ["academic_calendar"] as const,
  list: (filter: EventFilter) => [...CALENDAR_KEYS.all, "list", filter] as const,
  detail: (id: string) => [...CALENDAR_KEYS.all, "detail", id] as const,
  conflicts: (eventPartial: any) => [...CALENDAR_KEYS.all, "conflicts", eventPartial] as const,
  targetCounts: (scope: string, audiences: any) =>
    [...CALENDAR_KEYS.all, "targetCounts", scope, audiences] as const,
  exams: () => [...CALENDAR_KEYS.all, "integrations", "exams"] as const,
  announcements: () => [...CALENDAR_KEYS.all, "integrations", "announcements"] as const,
};

export function useCalendarEvents(filter: EventFilter = {}) {
  return useQuery({
    queryKey: CALENDAR_KEYS.list(filter),
    queryFn: () => calendarService.list(filter),
    staleTime: 60 * 1000,
  });
}

export function useCalendarEvent(id: string | undefined) {
  return useQuery({
    queryKey: CALENDAR_KEYS.detail(id || ""),
    queryFn: () => (id ? calendarService.getById(id) : null),
    enabled: Boolean(id),
    staleTime: 60 * 1000,
  });
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCalendarEventInput) => calendarService.create(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CALENDAR_KEYS.all });
      toast.success(`Event "${data.title}" created successfully!`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create event");
    },
  });
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateCalendarEventInput) => calendarService.update(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CALENDAR_KEYS.all });
      toast.success(`Event "${data.title}" updated!`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update event");
    },
  });
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => calendarService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CALENDAR_KEYS.all });
      toast.success("Event removed from calendar.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete event");
    },
  });
}

export function useTargetCountPreview(
  scope: string,
  audiences: Array<{ target_type: EventAudienceTargetType; target_id?: string }> = []
) {
  return useQuery({
    queryKey: CALENDAR_KEYS.targetCounts(scope, audiences),
    queryFn: () => calendarService.getTargetCountPreview(scope, audiences),
    staleTime: 30 * 1000,
  });
}

export function useIntegratedExams() {
  return useQuery({
    queryKey: CALENDAR_KEYS.exams(),
    queryFn: () => calendarIntegrationsService.getAvailableExams(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useIntegratedAnnouncements() {
  return useQuery({
    queryKey: CALENDAR_KEYS.announcements(),
    queryFn: () => calendarIntegrationsService.getAvailableAnnouncements(),
    staleTime: 5 * 60 * 1000,
  });
}
