import { BaseService, AppError } from "@/shared/services";
import { isTaskSchemaMissing } from "../utils/tasksSchema";
import { taskActivityService } from "./taskActivity.service";
import type { TaskChecklistItem } from "../types/tasks.types";

const map = (r: Record<string, unknown>): TaskChecklistItem => ({
  id: String(r.id),
  taskId: String(r.task_id),
  label: String(r.label ?? ""),
  isDone: r.is_done === true,
  position: Number(r.position ?? 0),
  doneBy: (r.done_by as string) ?? undefined,
  doneAt: (r.done_at as string) ?? undefined,
});

class TaskChecklistService extends BaseService {
  async list(taskId: string): Promise<TaskChecklistItem[]> {
    const res = await this.db
      .from("task_checklist_items" as never)
      .select("id, task_id, label, is_done, position, done_by, done_at")
      .eq("task_id", taskId)
      .order("position", { ascending: true });
    if (res.error) {
      if (isTaskSchemaMissing(res.error)) return [];
      return [];
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(map);
  }

  async add(taskId: string, label: string, position: number): Promise<TaskChecklistItem> {
    const res = await this.db
      .from("task_checklist_items" as never)
      .insert({ task_id: taskId, label, position } as never)
      .select("id, task_id, label, is_done, position, done_by, done_at")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "task_checklist.add");
    await taskActivityService.log(taskId, "checklist", undefined, { label });
    return map(res.data as Record<string, unknown>);
  }

  async toggle(item: TaskChecklistItem, doneBy?: string): Promise<void> {
    const next = !item.isDone;
    const res = await this.db
      .from("task_checklist_items" as never)
      .update({
        is_done: next,
        done_by: next ? doneBy ?? null : null,
        done_at: next ? new Date().toISOString() : null,
      } as never)
      .eq("id", item.id);
    if (res.error) throw AppError.fromSupabase(res.error, "task_checklist.toggle");
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.from("task_checklist_items" as never).delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "task_checklist.remove");
  }
}

export const taskChecklistService = new TaskChecklistService();
