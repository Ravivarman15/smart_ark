// ──────────────────────────────────────────────────────────────────────────────
// task.service — the tasks table CRUD + aggregates.
//
// GRACEFUL DEGRADATION
//   • Reads use `select("*")`, which never errors on a column the DB lacks — so
//     a pre-migration database (only the 7 legacy columns) still returns rows.
//   • Extended fields are read when present, otherwise synthesised (status from
//     the legacy `status_by_user` blob, priority "medium", progress 0).
//   • Writes use safeInsert/UpdateWithColumnFallback, which drop only the columns
//     the schema is actually missing — so create/update keep working too.
//   • Category names are joined client-side (a relational select would 400 when
//     task_categories is absent).
// ──────────────────────────────────────────────────────────────────────────────

import {
  BaseService,
  AppError,
  safeInsertWithColumnFallback,
  safeUpdateWithColumnFallback,
} from "@/shared/services";
import {
  isTaskSchemaMissing,
  deriveOverdue,
  statusFromLegacy,
  todayISO,
} from "../utils/tasksSchema";
import { canTransition, transitionError } from "../utils/workflow";
import { computeKpis } from "../utils/taskMetrics";
import { taskCategoriesService } from "./taskCategories.service";
import { taskActivityService } from "./taskActivity.service";
import { taskChecklistService } from "./taskChecklist.service";
import type {
  Task,
  TaskInput,
  TaskFilters,
  TaskListResult,
  TaskKpis,
  TaskStatus,
  TaskPriority,
} from "../types/tasks.types";

type Row = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
  v === null || v === undefined ? undefined : String(v);
const num = (v: unknown): number | undefined =>
  v === null || v === undefined || v === "" ? undefined : Number(v);

class TaskService extends BaseService {
  // ── Read ──────────────────────────────────────────────────────────────────
  private mapRow(r: Row, catMap: Map<string, { name: string; color?: string }>): Task {
    const assignedTo = ((r.assigned_to as string[]) ?? []).map(String);
    const statusByUser = (r.status_by_user as Record<string, string>) ?? {};
    const hasExtended = Object.prototype.hasOwnProperty.call(r, "status") && r.status != null;
    const status = (hasExtended ? (r.status as TaskStatus) : statusFromLegacy(statusByUser, assignedTo)) as TaskStatus;
    const categoryId = str(r.category_id);
    const cat = categoryId ? catMap.get(categoryId) : undefined;
    const dueDate = str(r.due_date);
    const dueTime = str(r.due_time);
    return {
      id: String(r.id),
      title: String(r.title ?? ""),
      description: String(r.description ?? ""),
      status,
      priority: ((r.priority as TaskPriority) ?? "medium") as TaskPriority,
      categoryId,
      categoryName: cat?.name,
      categoryColor: cat?.color,
      progress: num(r.progress) ?? (status === "completed" ? 100 : 0),
      assignedTo,
      startDate: str(r.start_date),
      startTime: str(r.start_time),
      dueDate,
      dueTime,
      estimatedHours: num(r.estimated_hours),
      actualHours: num(r.actual_hours),
      createdBy: str(r.created_by),
      createdAt: String(r.created_at ?? ""),
      updatedAt: str(r.updated_at),
      isOverdue: deriveOverdue(dueDate, status, dueTime),
    };
  }

  /** Fetch every task (mapped). Filtering/sort/pagination is applied by `list`. */
  private async fetchAll(): Promise<{ rows: Task[]; degraded: boolean }> {
    const res = await this.db
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (res.error) {
      // The base tasks table predates this module — a hard error here is real.
      throw AppError.fromSupabase(res.error, "tasks");
    }
    const data = (res.data ?? []) as Row[];
    const degraded = data.length > 0 && !Object.prototype.hasOwnProperty.call(data[0], "status");
    const catMap = await taskCategoriesService.map();
    return { rows: data.map((r) => this.mapRow(r, catMap)), degraded };
  }

  async list(filters: TaskFilters = {}): Promise<TaskListResult> {
    const { rows, degraded } = await this.fetchAll();
    const f = filters;
    let out = rows;

    if (f.mineProfileId) out = out.filter((t) => t.assignedTo.includes(f.mineProfileId!));
    if (f.search) {
      const q = f.search.toLowerCase();
      out = out.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
      );
    }
    if (f.status && f.status !== "all") out = out.filter((t) => t.status === f.status);
    if (f.priority && f.priority !== "all") out = out.filter((t) => t.priority === f.priority);
    if (f.categoryId && f.categoryId !== "all") out = out.filter((t) => t.categoryId === f.categoryId);
    if (f.assigneeId && f.assigneeId !== "all") out = out.filter((t) => t.assignedTo.includes(f.assigneeId!));
    if (f.overdueOnly) out = out.filter((t) => t.isOverdue);
    if (f.dueToday) {
      const today = todayISO();
      out = out.filter((t) => t.dueDate === today);
    }

    out = this.sort(out, f.sortBy ?? "created_at", f.sortDir ?? "desc");

    const total = out.length;
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return { rows: out.slice(start, start + pageSize), total, degraded };
  }

  private sort(rows: Task[], by: NonNullable<TaskFilters["sortBy"]>, dir: "asc" | "desc"): Task[] {
    const mul = dir === "asc" ? 1 : -1;
    const prRank: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (by) {
        case "due_date":
          cmp = (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
          break;
        case "priority":
          cmp = prRank[a.priority] - prRank[b.priority];
          break;
        case "progress":
          cmp = a.progress - b.progress;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        default:
          cmp = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      }
      return cmp * mul;
    });
  }

  async get(id: string): Promise<Task | null> {
    const res = await this.db.from("tasks").select("*").eq("id", id).maybeSingle();
    if (res.error) {
      if (isTaskSchemaMissing(res.error)) return null;
      throw AppError.fromSupabase(res.error, "tasks");
    }
    if (!res.data) return null;
    const catMap = await taskCategoriesService.map();
    return this.mapRow(res.data as Row, catMap);
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  async create(input: TaskInput, actor?: { profileId?: string }): Promise<Task | null> {
    const assignedTo = input.assignedTo ?? [];
    const statusByUser: Record<string, string> = {};
    assignedTo.forEach((id) => (statusByUser[id] = "pending"));

    const row: Row = {
      title: input.title,
      description: input.description ?? "",
      due_date: input.dueDate || null,
      assigned_to: assignedTo,
      status_by_user: statusByUser,
      created_by: actor?.profileId ?? null,
      // extended columns (dropped automatically if the schema lacks them)
      status: input.status ?? (assignedTo.length ? "assigned" : "draft"),
      priority: input.priority ?? "medium",
      category_id: input.categoryId ?? null,
      progress: input.progress ?? 0,
      start_date: input.startDate || null,
      start_time: input.startTime || null,
      due_time: input.dueTime || null,
      estimated_hours: input.estimatedHours ?? null,
      actual_hours: input.actualHours ?? null,
    };

    const result = await safeInsertWithColumnFallback<Row>(this.db, "tasks", row, {
      returning: "*",
      label: "tasks.create",
    });
    if (result.error) throw AppError.fromSupabase(result.error as never, "tasks.create");
    const catMap = await taskCategoriesService.map();
    const task = result.data ? this.mapRow(result.data, catMap) : null;
    if (task) {
      await taskActivityService.log(task.id, "created", actor?.profileId, { title: task.title });
    }
    return task;
  }

  async update(id: string, patch: TaskInput, actor?: { profileId?: string }): Promise<void> {
    const row: Row = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.priority !== undefined) row.priority = patch.priority;
    if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
    if (patch.progress !== undefined) row.progress = patch.progress;
    if (patch.assignedTo !== undefined) row.assigned_to = patch.assignedTo;
    if (patch.startDate !== undefined) row.start_date = patch.startDate || null;
    if (patch.startTime !== undefined) row.start_time = patch.startTime || null;
    if (patch.dueDate !== undefined) row.due_date = patch.dueDate || null;
    if (patch.dueTime !== undefined) row.due_time = patch.dueTime || null;
    if (patch.estimatedHours !== undefined) row.estimated_hours = patch.estimatedHours;
    if (patch.actualHours !== undefined) row.actual_hours = patch.actualHours;

    const result = await safeUpdateWithColumnFallback(this.db, "tasks", row, { id }, { label: "tasks.update" });
    if (result.error) throw AppError.fromSupabase(result.error as never, "tasks.update");
    // A reassignment is a distinct, audit-worthy event.
    const kind = patch.assignedTo !== undefined ? "assigned" : "updated";
    await taskActivityService.log(id, kind, actor?.profileId, {});
  }

  /**
   * Status change (Kanban drag + detail drawer). Validates the workflow
   * transition; pass `from` to avoid a round-trip when the caller knows the
   * current status. Auto-sets progress=100 on completion.
   */
  async setStatus(
    id: string,
    status: TaskStatus,
    actor?: { profileId?: string },
    from?: TaskStatus,
  ): Promise<void> {
    let current = from;
    if (!current) current = (await this.get(id))?.status;
    if (current && !canTransition(current, status)) {
      throw AppError.validation(transitionError(current, status));
    }
    const row: Row = { status, updated_at: new Date().toISOString() };
    if (status === "completed") row.progress = 100;
    const result = await safeUpdateWithColumnFallback(this.db, "tasks", row, { id }, { label: "tasks.setStatus" });
    if (result.error) throw AppError.fromSupabase(result.error as never, "tasks.setStatus");
    await taskActivityService.log(id, "status_changed", actor?.profileId, { from: current, status });
  }

  /**
   * Progress is decoupled from the workflow: reaching 100% does NOT silently
   * complete the task (that must follow the review workflow). Marking a task
   * Completed sets progress=100 via setStatus.
   */
  async setProgress(id: string, progress: number, actor?: { profileId?: string }): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    const row: Row = { progress: clamped, updated_at: new Date().toISOString() };
    const result = await safeUpdateWithColumnFallback(this.db, "tasks", row, { id }, { label: "tasks.setProgress" });
    if (result.error) throw AppError.fromSupabase(result.error as never, "tasks.setProgress");
    await taskActivityService.log(id, "progress", actor?.profileId, { progress: clamped });
  }

  /** Clone a task (fresh as Draft, 0% progress) including its checklist items. */
  async duplicate(id: string, actor?: { profileId?: string }): Promise<Task | null> {
    const t = await this.get(id);
    if (!t) return null;
    const copy = await this.create(
      {
        title: `${t.title} (Copy)`,
        description: t.description,
        status: "draft",
        priority: t.priority,
        categoryId: t.categoryId ?? null,
        progress: 0,
        assignedTo: t.assignedTo,
        startDate: t.startDate ?? null,
        startTime: t.startTime ?? null,
        dueDate: t.dueDate ?? null,
        dueTime: t.dueTime ?? null,
        estimatedHours: t.estimatedHours ?? null,
      },
      actor,
    );
    if (copy) {
      const items = await taskChecklistService.list(id);
      for (let i = 0; i < items.length; i++) {
        await taskChecklistService.add(copy.id, items[i].label, i);
      }
    }
    return copy;
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.from("tasks").delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "tasks.delete");
  }

  /** Bulk status change — invalid transitions are skipped, not fatal. */
  async bulkSetStatus(
    ids: string[],
    status: TaskStatus,
    actor?: { profileId?: string },
  ): Promise<{ applied: number; skipped: number }> {
    const results = await Promise.allSettled(ids.map((id) => this.setStatus(id, status, actor)));
    const skipped = results.filter((r) => r.status === "rejected").length;
    return { applied: ids.length - skipped, skipped };
  }

  async bulkSetPriority(ids: string[], priority: TaskPriority): Promise<void> {
    const row: Row = { priority, updated_at: new Date().toISOString() };
    await Promise.all(
      ids.map((id) => safeUpdateWithColumnFallback(this.db, "tasks", row, { id }, { label: "tasks.bulkPriority" })),
    );
  }

  async bulkRemove(ids: string[]): Promise<void> {
    const res = await this.db.from("tasks").delete().in("id", ids);
    if (res.error) throw AppError.fromSupabase(res.error, "tasks.bulkDelete");
  }

  // ── Aggregates ──────────────────────────────────────────────────────────────
  async kpis(scope: { mineProfileId?: string } = {}): Promise<TaskKpis> {
    const { rows } = await this.fetchAll();
    const tasks = scope.mineProfileId
      ? rows.filter((t) => t.assignedTo.includes(scope.mineProfileId!))
      : rows;
    return computeKpis(tasks);
  }
}

export const taskService = new TaskService();
