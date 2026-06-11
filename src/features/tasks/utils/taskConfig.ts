// ──────────────────────────────────────────────────────────────────────────────
// Single source of truth for task STATUS + PRIORITY presentation.
// Every badge, board column, and filter reads from here so colours/labels/order
// never drift across the module.
// ──────────────────────────────────────────────────────────────────────────────

import type {
  TaskStatus,
  TaskPriority,
  TaskDisplayStatus,
} from "../types/tasks.types";

export interface StatusMeta {
  value: TaskDisplayStatus;
  label: string;
  /** Tailwind badge classes (bg + text + border). */
  badge: string;
  /** Solid dot / accent colour class. */
  dot: string;
  order: number;
}

export interface PriorityMeta {
  value: TaskPriority;
  label: string;
  badge: string;
  dot: string;
  order: number;
}

export const STATUS_META: Record<TaskDisplayStatus, StatusMeta> = {
  draft:        { value: "draft",        label: "Draft",        badge: "bg-slate-500/15 text-slate-400 border-slate-500/30",   dot: "bg-slate-400",   order: 0 },
  assigned:     { value: "assigned",     label: "Assigned",     badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",      dot: "bg-blue-400",    order: 1 },
  accepted:     { value: "accepted",     label: "Accepted",     badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",      dot: "bg-cyan-400",    order: 2 },
  in_progress:  { value: "in_progress",  label: "In Progress",  badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",   dot: "bg-amber-400",   order: 3 },
  under_review: { value: "under_review", label: "Under Review", badge: "bg-purple-500/15 text-purple-400 border-purple-500/30",dot: "bg-purple-400",  order: 4 },
  completed:    { value: "completed",    label: "Completed",    badge: "bg-green-500/15 text-green-400 border-green-500/30",   dot: "bg-green-400",   order: 5 },
  rejected:     { value: "rejected",     label: "Rejected",     badge: "bg-red-500/15 text-red-400 border-red-500/30",         dot: "bg-red-400",     order: 6 },
  cancelled:    { value: "cancelled",    label: "Cancelled",    badge: "bg-gray-500/15 text-gray-400 border-gray-500/30",      dot: "bg-gray-400",    order: 7 },
  overdue:      { value: "overdue",      label: "Overdue",      badge: "bg-red-600/15 text-red-500 border-red-600/40",         dot: "bg-red-500",     order: 8 },
};

export const PRIORITY_META: Record<TaskPriority, PriorityMeta> = {
  critical: { value: "critical", label: "Critical", badge: "bg-red-500/15 text-red-400 border-red-500/30",       dot: "bg-red-500",    order: 0 },
  high:     { value: "high",     label: "High",     badge: "bg-orange-500/15 text-orange-400 border-orange-500/30", dot: "bg-orange-500", order: 1 },
  medium:   { value: "medium",   label: "Medium",   badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",     dot: "bg-blue-500",   order: 2 },
  low:      { value: "low",      label: "Low",      badge: "bg-green-500/15 text-green-400 border-green-500/30",   dot: "bg-green-500",  order: 3 },
};

/** Solid hex per status — for recharts (which can't read Tailwind classes). */
export const STATUS_HEX: Record<TaskDisplayStatus, string> = {
  draft: "#94a3b8",
  assigned: "#60a5fa",
  accepted: "#22d3ee",
  in_progress: "#fbbf24",
  under_review: "#c084fc",
  completed: "#22c55e",
  rejected: "#f87171",
  cancelled: "#9ca3af",
  overdue: "#ef4444",
};

export const PRIORITY_HEX: Record<TaskPriority, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#22c55e",
};

/** All real (storable) workflow statuses, in workflow order. */
export const ALL_STATUSES: TaskStatus[] = [
  "draft",
  "assigned",
  "accepted",
  "in_progress",
  "under_review",
  "completed",
  "rejected",
  "cancelled",
];

export const ALL_PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low"];

/** Kanban columns (per spec). Drag between these to change task.status. */
export const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "assigned", label: "Assigned" },
  { status: "in_progress", label: "In Progress" },
  { status: "under_review", label: "Under Review" },
  { status: "completed", label: "Completed" },
];

export const statusMeta = (s: TaskDisplayStatus | string): StatusMeta =>
  STATUS_META[s as TaskDisplayStatus] ?? STATUS_META.assigned;

export const priorityMeta = (p: TaskPriority | string): PriorityMeta =>
  PRIORITY_META[p as TaskPriority] ?? PRIORITY_META.medium;

/** Terminal statuses never count as overdue. */
export const TERMINAL_STATUSES: TaskStatus[] = ["completed", "rejected", "cancelled"];

/** "Pending" KPI bucket = not yet started. */
export const PENDING_STATUSES: TaskStatus[] = ["draft", "assigned", "accepted"];
