import { BaseService } from "@/shared/services";
import { isTaskSchemaMissing } from "../utils/tasksSchema";

/**
 * Watchers are the recipient backbone for the notification seam (Phase 3).
 * Phase 1 keeps the API minimal and fully degradable.
 */
class TaskWatchersService extends BaseService {
  async list(taskId: string): Promise<string[]> {
    const res = await this.db.from("task_watchers" as never).select("profile_id").eq("task_id", taskId);
    if (res.error) {
      if (isTaskSchemaMissing(res.error)) return [];
      return [];
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map((r) => String(r.profile_id));
  }

  async add(taskId: string, profileIds: string[]): Promise<void> {
    if (profileIds.length === 0) return;
    try {
      await this.db
        .from("task_watchers" as never)
        .upsert(profileIds.map((profile_id) => ({ task_id: taskId, profile_id })) as never, {
          onConflict: "task_id,profile_id",
        });
    } catch {
      /* watchers are best-effort in Phase 1 */
    }
  }

  async remove(taskId: string, profileId: string): Promise<void> {
    try {
      await this.db.from("task_watchers" as never).delete().eq("task_id", taskId).eq("profile_id", profileId);
    } catch {
      /* best-effort */
    }
  }
}

export const taskWatchersService = new TaskWatchersService();
