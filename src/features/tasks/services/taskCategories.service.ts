import { BaseService } from "@/shared/services";
import { isTaskSchemaMissing } from "../utils/tasksSchema";
import type { TaskCategory } from "../types/tasks.types";

class TaskCategoriesService extends BaseService {
  async list(): Promise<TaskCategory[]> {
    const res = await this.db
      .from("task_categories" as never)
      .select("id, name, color, icon, is_active")
      .order("name");
    if (res.error) {
      if (isTaskSchemaMissing(res.error)) return [];
      return [];
    }
    return ((res.data ?? []) as Record<string, unknown>[])
      .filter((r) => r.is_active !== false)
      .map((r) => ({
        id: String(r.id),
        name: String(r.name),
        color: (r.color as string) ?? undefined,
        icon: (r.icon as string) ?? undefined,
        isActive: r.is_active !== false,
      }));
  }

  /** id → {name, color} map for client-side category resolution. */
  async map(): Promise<Map<string, { name: string; color?: string }>> {
    const list = await this.list();
    return new Map(list.map((c) => [c.id, { name: c.name, color: c.color }]));
  }
}

export const taskCategoriesService = new TaskCategoriesService();
