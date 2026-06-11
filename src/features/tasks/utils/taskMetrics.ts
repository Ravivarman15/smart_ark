// ──────────────────────────────────────────────────────────────────────────────
// Pure task aggregation — KPIs + team workload. Extracted from the services so
// the maths is unit-testable without a database.
// ──────────────────────────────────────────────────────────────────────────────

import { PENDING_STATUSES, TERMINAL_STATUSES } from "./taskConfig";
import { todayISO } from "./tasksSchema";
import type { Task, TaskAssignee, TaskKpis, WorkloadRow } from "../types/tasks.types";

export const computeKpis = (tasks: Task[], today: string = todayISO()): TaskKpis => {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const underReview = tasks.filter((t) => t.status === "under_review").length;
  const pending = tasks.filter((t) => PENDING_STATUSES.includes(t.status)).length;
  const assigned = tasks.filter((t) => t.status === "assigned").length;
  const overdue = tasks.filter((t) => t.isOverdue).length;
  const dueToday = tasks.filter(
    (t) => t.dueDate === today && !TERMINAL_STATUSES.includes(t.status),
  ).length;
  const highPriority = tasks.filter(
    (t) => (t.priority === "critical" || t.priority === "high") && t.status !== "completed",
  ).length;
  return {
    total,
    assigned,
    pending,
    inProgress,
    underReview,
    completed,
    overdue,
    dueToday,
    highPriority,
    completionRate: total ? Math.round((completed / total) * 100) : 0,
  };
};

export const computeWorkload = (tasks: Task[], staff: TaskAssignee[]): WorkloadRow[] =>
  staff
    .map((s) => {
      const mine = tasks.filter((t) => t.assignedTo.includes(s.id));
      const assigned = mine.length;
      const completed = mine.filter((t) => t.status === "completed").length;
      const overdue = mine.filter((t) => t.isOverdue).length;
      const inProgress = mine.filter((t) => t.status === "in_progress").length;
      return {
        profileId: s.id,
        name: s.name,
        role: s.role,
        assigned,
        completed,
        overdue,
        inProgress,
        productivity: assigned ? Math.round((completed / assigned) * 100) : 0,
      };
    })
    .filter((w) => w.assigned > 0)
    .sort((a, b) => b.assigned - a.assigned);
