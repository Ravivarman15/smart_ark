import { BaseService } from "@/shared/services";
import { isTaskSchemaMissing } from "../utils/tasksSchema";
import type { TaskAssignee, WorkloadRow } from "../types/tasks.types";
import { taskService } from "./task.service";
import { computeWorkload } from "../utils/taskMetrics";

/**
 * Assignable staff (any active profile) + team workload aggregation.
 * Reuses the same `profiles` read shape as attendance lookups.
 */
class TaskAssigneesService extends BaseService {
  async staff(): Promise<TaskAssignee[]> {
    const res = await this.db.from("profiles").select("id, name, role, is_active").order("name");
    if (res.error) {
      if (isTaskSchemaMissing(res.error)) return [];
      return [];
    }
    return ((res.data ?? []) as Record<string, unknown>[])
      .filter((r) => (r as { is_active?: boolean }).is_active !== false)
      .map((r) => ({ id: String(r.id), name: String(r.name ?? ""), role: String(r.role ?? "") }));
  }

  /** id → {name, role} map for resolving comment/activity authors. */
  async nameMap(): Promise<Map<string, TaskAssignee>> {
    const list = await this.staff();
    return new Map(list.map((s) => [s.id, s]));
  }

  /** Per-staff workload, used by the Team Workload dashboard. */
  async workload(): Promise<WorkloadRow[]> {
    const [list, staff] = await Promise.all([
      taskService.list({ pageSize: 100000, page: 1 }),
      this.staff(),
    ]);
    return computeWorkload(list.rows, staff);
  }
}

export const taskAssigneesService = new TaskAssigneesService();
