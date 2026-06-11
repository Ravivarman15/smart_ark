// ──────────────────────────────────────────────────────────────────────────────
// Task module domain types (Phase 1)
// ──────────────────────────────────────────────────────────────────────────────
// Task-level `status` drives the workflow + Kanban board. `assigned_to` stays a
// UUID[] for multi-assignee. `overdue` is never stored — it is derived
// (see deriveOverdue in utils/tasksSchema.ts).
// ──────────────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "draft"
  | "assigned"
  | "accepted"
  | "in_progress"
  | "under_review"
  | "completed"
  | "rejected"
  | "cancelled";

export type TaskPriority = "critical" | "high" | "medium" | "low";

/** Display-only pseudo-status — never persisted. */
export type TaskDisplayStatus = TaskStatus | "overdue";

export type TaskActivityKind =
  | "created"
  | "status_changed"
  | "progress"
  | "assigned"
  | "comment"
  | "checklist"
  | "attachment"
  | "updated";

export interface TaskCategory {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  isActive: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  progress: number; // 0–100
  assignedTo: string[]; // profile ids
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  dueTime?: string;
  estimatedHours?: number;
  actualHours?: number;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  /** Derived: due date passed and not in a terminal state. */
  isOverdue: boolean;
  // Optional aggregates (enriched on detail / list when child tables exist).
  checklistTotal?: number;
  checklistDone?: number;
  commentCount?: number;
  attachmentCount?: number;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId?: string;
  authorName?: string;
  body: string;
  parentId?: string;
  mentions: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface TaskChecklistItem {
  id: string;
  taskId: string;
  label: string;
  isDone: boolean;
  position: number;
  doneBy?: string;
  doneAt?: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  uploadedBy?: string;
  fileName: string;
  filePath: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
}

export interface TaskActivityEntry {
  id: string;
  taskId: string;
  actorId?: string;
  actorName?: string;
  kind: TaskActivityKind;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface TaskAssignee {
  id: string; // profile id
  name: string;
  role: string;
}

// ── Filters / pagination ──────────────────────────────────────────────────────
export interface TaskFilters {
  search?: string;
  status?: TaskStatus | "all";
  priority?: TaskPriority | "all";
  categoryId?: string | "all";
  assigneeId?: string | "all";
  /** Restrict to tasks assigned to this profile (the "My Tasks" scope). */
  mineProfileId?: string;
  overdueOnly?: boolean;
  dueToday?: boolean;
  sortBy?: "due_date" | "priority" | "created_at" | "status" | "progress";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface TaskListResult {
  rows: Task[];
  total: number;
  /** True when the extended schema is missing and we fell back to legacy reads. */
  degraded: boolean;
}

// ── KPIs / workload ───────────────────────────────────────────────────────────
export interface TaskKpis {
  total: number;
  assigned: number;
  pending: number; // not started: draft/assigned/accepted
  inProgress: number;
  underReview: number;
  completed: number;
  overdue: number;
  dueToday: number;
  highPriority: number; // critical + high, not completed
  completionRate: number; // %
}

export interface WorkloadRow {
  profileId: string;
  name: string;
  role: string;
  assigned: number;
  completed: number;
  overdue: number;
  inProgress: number;
  productivity: number; // completed / assigned %
}

export interface TaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  categoryId?: string | null;
  progress?: number;
  assignedTo?: string[];
  startDate?: string | null;
  startTime?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
}
