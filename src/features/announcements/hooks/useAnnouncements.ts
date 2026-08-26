// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — useAnnouncements Management Hook
// ──────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { currentOrganizationId } from "@/core/tenant/tenant";
import { announcementsService } from "../services/announcements.service";
import type {
  AnnouncementFilter,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "../types/announcements.types";
import { ANNOUNCEMENT_KEYS } from "./useAnnouncementFeed";

export const useAnnouncements = (filter?: AnnouncementFilter) => {
  const queryClient = useQueryClient();
  const orgId = currentOrganizationId();

  const listQuery = useQuery({
    queryKey: ANNOUNCEMENT_KEYS.list(orgId, filter),
    queryFn: () => announcementsService.list(filter),
    enabled: !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateAnnouncementInput) => announcementsService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.all });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateAnnouncementInput) => announcementsService.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.all });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => announcementsService.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.all });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => announcementsService.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcementsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.all });
    },
  });

  const extendExpiryMutation = useMutation({
    mutationFn: ({ id, newExpiresAt }: { id: string; newExpiresAt: string }) =>
      announcementsService.extendExpiry(id, newExpiresAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.all });
    },
  });

  return {
    announcements: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    createAnnouncement: createMutation.mutateAsync,
    updateAnnouncement: updateMutation.mutateAsync,
    cancelAnnouncement: cancelMutation.mutateAsync,
    archiveAnnouncement: archiveMutation.mutateAsync,
    deleteAnnouncement: deleteMutation.mutateAsync,
    extendExpiry: extendExpiryMutation.mutateAsync,
    refetch: listQuery.refetch,
  };
};

export const useAnnouncementDetail = (id: string | undefined) => {
  const orgId = currentOrganizationId();

  return useQuery({
    queryKey: ANNOUNCEMENT_KEYS.detail(orgId, id || ""),
    queryFn: () => (id ? announcementsService.getById(id) : null),
    enabled: !!orgId && !!id,
  });
};

export const useAnnouncementAnalytics = (id: string | undefined) => {
  const orgId = currentOrganizationId();

  return useQuery({
    queryKey: ANNOUNCEMENT_KEYS.analytics(orgId, id || ""),
    queryFn: () => (id ? announcementsService.getAnalytics(id) : null),
    enabled: !!orgId && !!id,
  });
};
