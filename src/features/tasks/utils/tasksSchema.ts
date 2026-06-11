// ──────────────────────────────────────────────────────────────────────────────
// Schema-drift helpers for the Tasks module.
// The app must run on BOTH an un-migrated DB (only the legacy `tasks` columns)
// and a fully-migrated one. These helpers detect "table/column absent" errors so
// services can fall back to legacy behaviour instead of surfacing a PGRST error.
// Modelled on attendance/governanceAudit.service.ts:isGovMissing.
// ──────────────────────────────────────────────────────────────────────────────

import { TERMINAL_STATUSES } from "./taskConfig";
import type { Task, TaskStatus } from "../types/tasks.types";

/** True when an error means a table/relation/column is absent or not yet cached. */
export const isTaskSchemaMissing = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; details?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205" || e.code === "42P01" || e.code === "42703")
    return true;
  const m = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("relation")
  );
};

/** Derived overdue flag — never stored. */
export const deriveOverdue = (
  dueDate: string | null | undefined,
  status: TaskStatus | string | null | undefined,
  dueTime?: string | null,
): boolean => {
  if (!dueDate) return false;
  if (TERMINAL_STATUSES.includes(status as TaskStatus)) return false;
  const iso = dueTime ? `${dueDate}T${dueTime}` : `${dueDate}T23:59:59`;
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) return false;
  return due < Date.now();
};

/** YYYY-MM-DD for "today" in local time. */
export const todayISO = (): string => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
};

/**
 * Maps a legacy `status_by_user` JSONB blob to a single task-level status, used
 * when the extended `status` column is absent. If every assignee completed →
 * completed; if some did → in_progress; otherwise assigned.
 */
export const statusFromLegacy = (
  statusByUser: Record<string, string> | null | undefined,
  assignedTo: string[],
): TaskStatus => {
  if (!statusByUser || assignedTo.length === 0) return "assigned";
  const vals = assignedTo.map((id) => statusByUser[id]);
  const done = vals.filter((v) => v === "completed").length;
  if (done === 0) return "assigned";
  if (done === assignedTo.length) return "completed";
  return "in_progress";
};

/** Enrich a partial task row with derived fields. */
export const withDerived = (t: Omit<Task, "isOverdue">): Task => ({
  ...t,
  isOverdue: deriveOverdue(t.dueDate, t.status, t.dueTime),
});
