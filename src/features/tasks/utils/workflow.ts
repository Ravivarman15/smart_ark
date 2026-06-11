// ──────────────────────────────────────────────────────────────────────────────
// Task status workflow — the single source of truth for which transitions are
// allowed. Mirrors the spec graph:
//
//   draft → assigned → accepted → in_progress → under_review → completed
//                                                under_review → rejected
//                                                rejected     → in_progress (rework)
//   <any active state> → cancelled
//
// completed + cancelled are terminal. Same-status "transitions" are always
// allowed (no-op). Everything else is blocked at the service + UI layer.
// ──────────────────────────────────────────────────────────────────────────────

import type { TaskStatus } from "../types/tasks.types";

export const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ["assigned", "cancelled"],
  assigned: ["accepted", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["under_review", "cancelled"],
  under_review: ["completed", "rejected", "cancelled"],
  rejected: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Terminal statuses cannot transition further. */
export const isTerminalStatus = (s: TaskStatus): boolean => TRANSITIONS[s]?.length === 0;

/** True when `from → to` is permitted (same-status is always allowed). */
export const canTransition = (from: TaskStatus, to: TaskStatus): boolean =>
  from === to || (TRANSITIONS[from]?.includes(to) ?? false);

/** Current status plus every status it may legally move to (for dropdowns). */
export const allowedNextStatuses = (from: TaskStatus): TaskStatus[] => [
  from,
  ...(TRANSITIONS[from] ?? []),
];

/** Human-readable reason a transition was blocked (for toasts). */
export const transitionError = (from: TaskStatus, to: TaskStatus): string =>
  `Invalid transition: a task cannot move from "${from}" to "${to}".`;
