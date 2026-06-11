import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { taskService } from "../services/task.service";
import { taskWatchersService } from "../services/taskWatchers.service";
import type { TaskInput, TaskStatus, TaskPriority } from "../types/tasks.types";

export function useTaskMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const actor = { profileId: user?.profileId };
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.tasks.all });

  const create = useMutation({
    mutationFn: async (input: TaskInput) => {
      const task = await taskService.create(input, actor);
      if (task && input.assignedTo?.length) {
        await taskWatchersService.add(task.id, input.assignedTo);
      }
      return task;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Task created");
    },
    onError: (e) => {
      console.error(e);
      toast.error("Failed to create task");
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskInput }) => {
      await taskService.update(id, patch, actor);
      // Keep watchers in sync when the assignee set changes (reassign).
      if (patch.assignedTo) await taskWatchersService.add(id, patch.assignedTo);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Task updated");
    },
    onError: (e) => {
      console.error(e);
      toast.error("Failed to update task");
    },
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => taskService.duplicate(id, actor),
    onSuccess: () => {
      invalidate();
      toast.success("Task duplicated");
    },
    onError: () => toast.error("Failed to duplicate task"),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status, from }: { id: string; status: TaskStatus; from?: TaskStatus }) =>
      taskService.setStatus(id, status, actor, from),
    onSuccess: () => invalidate(),
    onError: (e) => {
      console.error(e);
      // Surface the workflow-validation message (e.g. invalid transition).
      toast.error(e instanceof Error ? e.message : "Failed to change status");
    },
  });

  const setProgress = useMutation({
    mutationFn: ({ id, progress }: { id: string; progress: number }) =>
      taskService.setProgress(id, progress, actor),
    onSuccess: () => invalidate(),
    onError: (e) => {
      console.error(e);
      toast.error("Failed to update progress");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => taskService.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Task deleted");
    },
    onError: (e) => {
      console.error(e);
      toast.error("Failed to delete task");
    },
  });

  const bulkStatus = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: TaskStatus }) =>
      taskService.bulkSetStatus(ids, status, actor),
    onSuccess: (res) => {
      invalidate();
      if (res.skipped > 0) {
        toast.warning(`Updated ${res.applied}, skipped ${res.skipped} (invalid transition)`);
      } else {
        toast.success("Tasks updated");
      }
    },
    onError: () => toast.error("Bulk update failed"),
  });

  const bulkPriority = useMutation({
    mutationFn: ({ ids, priority }: { ids: string[]; priority: TaskPriority }) =>
      taskService.bulkSetPriority(ids, priority),
    onSuccess: () => {
      invalidate();
      toast.success("Tasks updated");
    },
    onError: () => toast.error("Bulk update failed"),
  });

  const bulkRemove = useMutation({
    mutationFn: (ids: string[]) => taskService.bulkRemove(ids),
    onSuccess: () => {
      invalidate();
      toast.success("Tasks deleted");
    },
    onError: () => toast.error("Bulk delete failed"),
  });

  return { create, update, duplicate, setStatus, setProgress, remove, bulkStatus, bulkPriority, bulkRemove };
}
