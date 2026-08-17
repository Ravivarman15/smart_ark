import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { communicationService } from "../services/communication.service";

/**
 * How often an open thread re-checks for the other side's reply.
 *
 * Polling, not realtime. A Supabase channel would be tidier, but it is a live
 * socket per open conversation and this table sees a handful of messages a day
 * per family — the subscription would cost more than it saves. Ten seconds is
 * below the threshold at which a chat feels stuck, and React Query pauses the
 * interval entirely when the tab is in the background.
 */
const THREAD_POLL_MS = 10_000;
const INBOX_POLL_MS = 30_000;

export const useStudentMessages = (studentId: string | undefined) =>
  useQuery({
    queryKey: studentId
      ? queryKeys.students.messages(studentId)
      : ["students", "messages", "noop"],
    queryFn: () => communicationService.list(studentId as string),
    enabled: !!studentId,
    refetchInterval: studentId ? THREAD_POLL_MS : false,
  });

export const useSendMessage = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({ studentId, body }: { studentId: string; body: string }) =>
      communicationService.send(studentId, body, user?.profileId),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.messages(args.studentId) });
      qc.invalidateQueries({ queryKey: queryKeys.students.conversations() });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Message failed"),
  });
};

/** Staff inbox — every family with a conversation, unread first. */
export const useChatConversations = () =>
  useQuery({
    queryKey: queryKeys.students.conversations(),
    queryFn: () => communicationService.conversations(),
    refetchInterval: INBOX_POLL_MS,
  });

/**
 * Mark inbound messages read once staff has the thread open.
 *
 * Deliberately NOT wired to `onSuccess: invalidate`. Marking read changes only
 * `read_at`, and refetching the thread on every open would fight the poll above
 * for no visible change. The inbox is invalidated instead, because that is
 * where the count is actually shown.
 */
export const useMarkMessagesRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => communicationService.markRead(ids),
    onSuccess: (changed) => {
      if (changed > 0) {
        qc.invalidateQueries({ queryKey: queryKeys.students.conversations() });
      }
    },
    // Silent: a failed read receipt must never interrupt someone reading.
    onError: () => undefined,
  });
};
