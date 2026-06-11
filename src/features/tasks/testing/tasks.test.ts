import { describe, it, expect } from "vitest";
import {
  canTransition,
  allowedNextStatuses,
  isTerminalStatus,
  TRANSITIONS,
} from "../utils/workflow";
import { deriveOverdue, statusFromLegacy, withDerived } from "../utils/tasksSchema";
import { computeKpis, computeWorkload } from "../utils/taskMetrics";
import { ALL_STATUSES } from "../utils/taskConfig";
import type { Task, TaskAssignee, TaskStatus, TaskPriority } from "../types/tasks.types";

// ── Test factory ──────────────────────────────────────────────────────────────
let n = 0;
const task = (over: Partial<Task> = {}): Task =>
  withDerived({
    id: `t${++n}`,
    title: "Task",
    description: "",
    status: "assigned" as TaskStatus,
    priority: "medium" as TaskPriority,
    progress: 0,
    assignedTo: [],
    createdAt: "2026-01-01",
    ...over,
  });

// ── 1. Workflow transitions (spec graph) ───────────────────────────────────────
describe("workflow transitions", () => {
  it("permits the documented forward path", () => {
    expect(canTransition("draft", "assigned")).toBe(true);
    expect(canTransition("assigned", "accepted")).toBe(true);
    expect(canTransition("accepted", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "under_review")).toBe(true);
    expect(canTransition("under_review", "completed")).toBe(true);
    expect(canTransition("under_review", "rejected")).toBe(true);
  });

  it("allows cancelling from any active state", () => {
    for (const s of ["draft", "assigned", "accepted", "in_progress", "under_review", "rejected"] as TaskStatus[])
      expect(canTransition(s, "cancelled")).toBe(true);
  });

  it("allows rework from rejected back to in_progress", () => {
    expect(canTransition("rejected", "in_progress")).toBe(true);
  });

  it("blocks skipping workflow steps", () => {
    expect(canTransition("assigned", "completed")).toBe(false);
    expect(canTransition("assigned", "in_progress")).toBe(false); // must Accept first
    expect(canTransition("draft", "in_progress")).toBe(false);
    expect(canTransition("accepted", "completed")).toBe(false);
    expect(canTransition("in_progress", "completed")).toBe(false); // must Review first
  });

  it("treats completed and cancelled as terminal", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(canTransition("completed", "in_progress")).toBe(false);
    expect(canTransition("cancelled", "assigned")).toBe(false);
  });

  it("treats a same-status move as a no-op (allowed)", () => {
    for (const s of ALL_STATUSES) expect(canTransition(s, s)).toBe(true);
  });

  it("allowedNextStatuses always includes the current status first", () => {
    for (const s of ALL_STATUSES) {
      const opts = allowedNextStatuses(s);
      expect(opts[0]).toBe(s);
      expect(new Set(opts).size).toBe(opts.length); // no dupes
    }
  });

  it("every transition target is a real status", () => {
    for (const targets of Object.values(TRANSITIONS))
      for (const t of targets) expect(ALL_STATUSES).toContain(t);
  });
});

// ── 2. Overdue derivation ───────────────────────────────────────────────────────
describe("deriveOverdue", () => {
  it("is false without a due date", () => {
    expect(deriveOverdue(undefined, "assigned")).toBe(false);
  });
  it("flags a past due date on an active task", () => {
    expect(deriveOverdue("2020-01-01", "in_progress")).toBe(true);
  });
  it("never flags terminal tasks", () => {
    expect(deriveOverdue("2020-01-01", "completed")).toBe(false);
    expect(deriveOverdue("2020-01-01", "cancelled")).toBe(false);
    expect(deriveOverdue("2020-01-01", "rejected")).toBe(false);
  });
  it("is false for a far-future due date", () => {
    expect(deriveOverdue("2099-01-01", "assigned")).toBe(false);
  });
});

// ── 3. Legacy status projection (pre-migration fallback) ────────────────────────
describe("statusFromLegacy", () => {
  it("maps all-complete → completed", () => {
    expect(statusFromLegacy({ a: "completed", b: "completed" }, ["a", "b"])).toBe("completed");
  });
  it("maps some-complete → in_progress", () => {
    expect(statusFromLegacy({ a: "completed", b: "pending" }, ["a", "b"])).toBe("in_progress");
  });
  it("maps none-complete → assigned", () => {
    expect(statusFromLegacy({ a: "pending" }, ["a"])).toBe("assigned");
    expect(statusFromLegacy({}, [])).toBe("assigned");
  });
});

// ── 4. KPI engine ───────────────────────────────────────────────────────────────
describe("computeKpis", () => {
  const today = "2026-06-10";
  const tasks: Task[] = [
    task({ status: "completed", priority: "high" }),
    task({ status: "completed", priority: "low" }),
    task({ status: "in_progress", priority: "critical" }),
    task({ status: "under_review", priority: "high" }),
    task({ status: "assigned", priority: "medium", dueDate: today }),
    task({ status: "draft", priority: "low" }),
    task({ status: "assigned", priority: "critical", dueDate: "2020-01-01" }), // overdue
  ];

  it("counts each bucket correctly", () => {
    const k = computeKpis(tasks, today);
    expect(k.total).toBe(7);
    expect(k.completed).toBe(2);
    expect(k.inProgress).toBe(1);
    expect(k.underReview).toBe(1);
    expect(k.assigned).toBe(2);
    expect(k.pending).toBe(3); // draft + 2 assigned
    expect(k.overdue).toBe(1);
    expect(k.dueToday).toBe(1);
    // critical(in_progress) + high(under_review) + critical(assigned overdue) = 3 (completed excluded)
    expect(k.highPriority).toBe(3);
    expect(k.completionRate).toBe(Math.round((2 / 7) * 100));
  });

  it("returns zeroed KPIs for an empty list", () => {
    const k = computeKpis([], today);
    expect(k.total).toBe(0);
    expect(k.completionRate).toBe(0);
  });
});

// ── 5. Workload engine ──────────────────────────────────────────────────────────
describe("computeWorkload", () => {
  const staff: TaskAssignee[] = [
    { id: "u1", name: "Asha", role: "teacher" },
    { id: "u2", name: "Ravi", role: "coordinator" },
    { id: "u3", name: "Idle", role: "intern" },
  ];
  const tasks: Task[] = [
    task({ assignedTo: ["u1"], status: "completed" }),
    task({ assignedTo: ["u1"], status: "in_progress" }),
    task({ assignedTo: ["u1", "u2"], status: "assigned", dueDate: "2020-01-01" }), // overdue, shared
    task({ assignedTo: ["u2"], status: "completed" }),
  ];

  it("aggregates per-staff counts and productivity", () => {
    const rows = computeWorkload(tasks, staff);
    const asha = rows.find((r) => r.profileId === "u1")!;
    expect(asha.assigned).toBe(3);
    expect(asha.completed).toBe(1);
    expect(asha.inProgress).toBe(1);
    expect(asha.overdue).toBe(1);
    expect(asha.productivity).toBe(Math.round((1 / 3) * 100));
  });

  it("excludes staff with no assigned tasks", () => {
    const rows = computeWorkload(tasks, staff);
    expect(rows.find((r) => r.profileId === "u3")).toBeUndefined();
  });

  it("sorts by assigned descending", () => {
    const rows = computeWorkload(tasks, staff);
    expect(rows[0].profileId).toBe("u1"); // 3 assigned
  });
});
