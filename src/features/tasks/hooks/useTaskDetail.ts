import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { taskCommentsService } from "../services/taskComments.service";
import { taskChecklistService } from "../services/taskChecklist.service";
import { taskAttachmentsService } from "../services/taskAttachments.service";
import { taskActivityService } from "../services/taskActivity.service";
import { taskService } from "../services/task.service";
import type { TaskChecklistItem } from "../types/tasks.types";

// ── Comments ──────────────────────────────────────────────────────────────────
export function useTaskComments(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.comments(taskId ?? "none"),
    queryFn: () => taskCommentsService.list(taskId as string),
    enabled: !!taskId,
  });
}

export function useCommentMutations(taskId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.tasks.comments(taskId) });
    qc.invalidateQueries({ queryKey: queryKeys.tasks.activity(taskId) });
  };
  const add = useMutation({
    mutationFn: (input: { body: string; parentId?: string | null; mentions?: string[] }) =>
      taskCommentsService.add({ taskId, authorId: user?.profileId, ...input }),
    onSuccess: invalidate,
    onError: () => toast.error("Failed to post comment"),
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => taskCommentsService.update(id, body),
    onSuccess: invalidate,
    onError: () => toast.error("Failed to edit comment"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => taskCommentsService.remove(id),
    onSuccess: invalidate,
    onError: () => toast.error("Failed to delete comment"),
  });
  return { add, edit, remove };
}

// ── Checklist ─────────────────────────────────────────────────────────────────
export function useTaskChecklist(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.checklist(taskId ?? "none"),
    queryFn: () => taskChecklistService.list(taskId as string),
    enabled: !!taskId,
  });
}

export function useChecklistMutations(taskId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.tasks.checklist(taskId) });
    qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
  };
  // After a checklist change, auto-sync the parent task progress.
  const syncProgress = async () => {
    const items = await taskChecklistService.list(taskId);
    if (items.length === 0) return;
    const done = items.filter((i) => i.isDone).length;
    await taskService.setProgress(taskId, Math.round((done / items.length) * 100), {
      profileId: user?.profileId,
    });
  };
  const add = useMutation({
    mutationFn: ({ label, position }: { label: string; position: number }) =>
      taskChecklistService.add(taskId, label, position),
    onSuccess: async () => {
      await syncProgress();
      invalidate();
    },
    onError: () => toast.error("Failed to add item"),
  });
  const toggle = useMutation({
    mutationFn: (item: TaskChecklistItem) => taskChecklistService.toggle(item, user?.profileId),
    onSuccess: async () => {
      await syncProgress();
      invalidate();
    },
    onError: () => toast.error("Failed to update item"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => taskChecklistService.remove(id),
    onSuccess: async () => {
      await syncProgress();
      invalidate();
    },
    onError: () => toast.error("Failed to remove item"),
  });
  return { add, toggle, remove };
}

// ── Attachments ───────────────────────────────────────────────────────────────
export function useTaskAttachments(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.attachments(taskId ?? "none"),
    queryFn: () => taskAttachmentsService.list(taskId as string),
    enabled: !!taskId,
  });
}

export function useAttachmentMutations(taskId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.tasks.attachments(taskId) });
    qc.invalidateQueries({ queryKey: queryKeys.tasks.activity(taskId) });
  };
  const upload = useMutation({
    mutationFn: (file: File) => taskAttachmentsService.upload(taskId, file, user?.profileId),
    onSuccess: () => {
      invalidate();
      toast.success("Attachment uploaded");
    },
    onError: () => toast.error("Upload failed"),
  });
  const remove = useMutation({
    mutationFn: (att: Parameters<typeof taskAttachmentsService.remove>[0]) =>
      taskAttachmentsService.remove(att),
    onSuccess: invalidate,
    onError: () => toast.error("Failed to remove attachment"),
  });
  return { upload, remove };
}

// ── Activity ──────────────────────────────────────────────────────────────────
export function useTaskActivity(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.activity(taskId ?? "none"),
    queryFn: () => taskActivityService.list(taskId as string),
    enabled: !!taskId,
  });
}
