import { BaseService } from "@/shared/services";
import { isTaskSchemaMissing } from "../utils/tasksSchema";
import type { TaskActivityEntry, TaskActivityKind } from "../types/tasks.types";

class TaskActivityService extends BaseService {
  /** Best-effort timeline write — never blocks the action that triggered it. */
  async log(
    taskId: string,
    kind: TaskActivityKind,
    actorId?: string,
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.db.from("task_activity" as never).insert({
        task_id: taskId,
        actor_id: actorId ?? null,
        kind,
        meta,
      } as never);
    } catch {
      /* activity is best-effort */
    }
  }

  async list(taskId: string): Promise<TaskActivityEntry[]> {
    const res = await this.db
      .from("task_activity" as never)
      .select("id, task_id, actor_id, kind, meta, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (res.error) {
      if (isTaskSchemaMissing(res.error)) return [];
      return [];
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      taskId: String(r.task_id),
      actorId: (r.actor_id as string) ?? undefined,
      kind: r.kind as TaskActivityKind,
      meta: (r.meta as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    }));
  }
}

export const taskActivityService = new TaskActivityService();
