import { BaseService, AppError } from "@/shared/services";
import { isTaskSchemaMissing } from "../utils/tasksSchema";
import { taskActivityService } from "./taskActivity.service";
import type { TaskComment } from "../types/tasks.types";

const map = (r: Record<string, unknown>): TaskComment => ({
  id: String(r.id),
  taskId: String(r.task_id),
  authorId: (r.author_id as string) ?? undefined,
  body: String(r.body ?? ""),
  parentId: (r.parent_id as string) ?? undefined,
  mentions: ((r.mentions as string[]) ?? []).map(String),
  createdAt: String(r.created_at),
  updatedAt: (r.updated_at as string) ?? undefined,
});

class TaskCommentsService extends BaseService {
  async list(taskId: string): Promise<TaskComment[]> {
    const res = await this.db
      .from("task_comments" as never)
      .select("id, task_id, author_id, body, parent_id, mentions, created_at, updated_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (res.error) {
      if (isTaskSchemaMissing(res.error)) return [];
      return [];
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(map);
  }

  async add(input: {
    taskId: string;
    body: string;
    authorId?: string;
    parentId?: string | null;
    mentions?: string[];
  }): Promise<TaskComment> {
    const res = await this.db
      .from("task_comments" as never)
      .insert({
        task_id: input.taskId,
        author_id: input.authorId ?? null,
        body: input.body,
        parent_id: input.parentId ?? null,
        mentions: input.mentions ?? [],
      } as never)
      .select("id, task_id, author_id, body, parent_id, mentions, created_at, updated_at")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "task_comments.add");
    await taskActivityService.log(input.taskId, "comment", input.authorId, {});
    return map(res.data as Record<string, unknown>);
  }

  async update(id: string, body: string): Promise<void> {
    const res = await this.db
      .from("task_comments" as never)
      .update({ body, updated_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "task_comments.update");
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.from("task_comments" as never).delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "task_comments.remove");
  }
}

export const taskCommentsService = new TaskCommentsService();
