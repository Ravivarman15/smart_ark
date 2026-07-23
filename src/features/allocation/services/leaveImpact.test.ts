import { describe, it, expect, vi, beforeEach } from "vitest";

// leaveImpactService.affectedClasses: for each approved/pending leave overlapping
// the window, return the teacher's still-scheduled classes inside their leave.
// Mocks the leave_requests query + scheduleService.list.

const hoisted = vi.hoisted(() => ({
  leaveRows: [] as Record<string, unknown>[],
  leaveError: null as unknown,
  scheduleByTeacher: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "in", "lte", "gte", "eq"]) {
      b[m] = () => b;
    }
    // terminal await resolves the builder itself
    (b as { then: unknown }).then = (res: (v: unknown) => void) =>
      res({ data: hoisted.leaveRows, error: hoisted.leaveError });
    return b;
  };
  return { supabase: { from: () => builder() } };
});

vi.mock("./schedule.service", () => ({
  scheduleService: {
    list: vi.fn(async (f: { teacherId?: string }) => hoisted.scheduleByTeacher[f.teacherId ?? ""] ?? []),
  },
}));

import { leaveImpactService } from "./leaveImpact.service";

describe("leaveImpactService.affectedClasses", () => {
  beforeEach(() => {
    hoisted.leaveRows = [];
    hoisted.leaveError = null;
    hoisted.scheduleByTeacher = {};
  });

  it("returns scheduled classes inside an approved leave window", async () => {
    hoisted.leaveRows = [
      { user_id: "t1", start_date: "2026-07-10", end_date: "2026-07-12", leave_type: "sick", status: "approved" },
    ];
    hoisted.scheduleByTeacher = {
      t1: [{ id: "c1", teacherId: "t1", scheduleDate: "2026-07-11", status: "scheduled" }],
    };
    const out = await leaveImpactService.affectedClasses("2026-07-01", "2026-07-31");
    expect(out).toHaveLength(1);
    expect(out[0].schedule.id).toBe("c1");
    expect(out[0].leaveType).toBe("sick");
    expect(out[0].leaveStatus).toBe("approved");
  });

  it("returns [] when the leave table is missing", async () => {
    hoisted.leaveError = { message: "relation does not exist" };
    const out = await leaveImpactService.affectedClasses("2026-07-01", "2026-07-31");
    expect(out).toEqual([]);
  });

  it("skips leave rows with no scheduled classes", async () => {
    hoisted.leaveRows = [
      { user_id: "t2", start_date: "2026-07-10", end_date: "2026-07-12", status: "pending" },
    ];
    hoisted.scheduleByTeacher = { t2: [] };
    const out = await leaveImpactService.affectedClasses("2026-07-01", "2026-07-31");
    expect(out).toEqual([]);
  });
});
