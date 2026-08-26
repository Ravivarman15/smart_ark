// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — useAnnouncementFeed Hook
// ──────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveChild } from "@/features/parent-portal/providers/ActiveChildProvider";
import { currentOrganizationId } from "@/core/tenant/tenant";
import { announcementFeedService, type FeedContext } from "../services/announcementFeed.service";
import type { AnnouncementFilter } from "../types/announcements.types";

export const ANNOUNCEMENT_KEYS = {
  all: ["announcements"] as const,
  feed: (orgId: string | null, userId?: string, childId?: string, filter?: AnnouncementFilter) =>
    ["announcements", "feed", orgId, userId, childId, filter] as const,
  unreadCount: (orgId: string | null, userId?: string, childId?: string) =>
    ["announcements", "unread_count", orgId, userId, childId] as const,
  list: (orgId: string | null, filter?: AnnouncementFilter) =>
    ["announcements", "list", orgId, filter] as const,
  detail: (orgId: string | null, id: string) =>
    ["announcements", "detail", orgId, id] as const,
  analytics: (orgId: string | null, id: string) =>
    ["announcements", "analytics", orgId, id] as const,
};

export const useFeedContext = (): FeedContext => {
  const { user, parent } = useAuth();
  let activeChildStudentId: string | undefined;
  let activeChildStandardId: string | undefined;
  let activeChildBatchId: string | undefined;

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const childContext = useActiveChild();
    if (childContext?.activeChild) {
      activeChildStudentId = childContext.activeChild.student.id;
      activeChildStandardId = childContext.activeChild.student.standard_id || undefined;
      activeChildBatchId = childContext.activeChild.student.batch_id || undefined;
    }
  } catch {
    // ActiveChildProvider not mounted (e.g. in staff layout)
  }

  const isParent = !!parent;
  const userId = user?.id || parent?.accountId;
  const role = user?.role;

  return {
    userId,
    role,
    isParent,
    activeChildStudentId,
    activeChildStandardId,
    activeChildBatchId,
  };
};

export const useAnnouncementFeed = (filter?: AnnouncementFilter) => {
  const queryClient = useQueryClient();
  const ctx = useFeedContext();
  const orgId = currentOrganizationId();

  const feedQuery = useQuery({
    queryKey: ANNOUNCEMENT_KEYS.feed(orgId, ctx.userId, ctx.activeChildStudentId, filter),
    queryFn: () => announcementFeedService.getFeed(ctx, filter),
    enabled: !!orgId,
    refetchInterval: 30000, // 30s polling
  });

  const unreadCountQuery = useQuery({
    queryKey: ANNOUNCEMENT_KEYS.unreadCount(orgId, ctx.userId, ctx.activeChildStudentId),
    queryFn: () => announcementFeedService.getUnreadCount(ctx),
    enabled: !!orgId,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (announcementId: string) =>
      announcementFeedService.markAsRead(announcementId, ctx),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.all });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (announcementId: string) =>
      announcementFeedService.acknowledge(announcementId, ctx),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.all });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => announcementFeedService.markAllAsRead(ctx),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.all });
    },
  });

  return {
    announcements: feedQuery.data ?? [],
    isLoading: feedQuery.isLoading,
    unreadCount: unreadCountQuery.data ?? 0,
    isUnreadCountLoading: unreadCountQuery.isLoading,
    markAsRead: markReadMutation.mutateAsync,
    acknowledge: acknowledgeMutation.mutateAsync,
    markAllAsRead: markAllReadMutation.mutateAsync,
    refetch: feedQuery.refetch,
  };
};
