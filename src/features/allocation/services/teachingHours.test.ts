import { describe, it, expect, vi } from "vitest";

// ════════════════════════════════════════════════════════════════════════════
// TEACHING-HOURS AGGREGATION — the contract payroll depends on:
//   • only COMPLETED classes contribute paid minutes
//   • regular completed → totalMinutes; completed EXTRA → extraMinutes (overtime)
//   • scheduled (upcoming) minutes are tracked separately (never paid)
//   • in_progress is its OWN bucket — started ≠ taught, so it must never be
//     folded into completed, and must not silently disappear either
//   • cancelled / missed are counted, not paid
//   • a missing table degrades to an empty map (never throws into payroll)
// ════════════════════════════════════════════════════════════════════════════

const hoisted = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  error: null as { message?: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        gte: () => ({
          lte: () => Promise.resolve({ data: hoisted.rows, error: hoisted.error }),
        }),
      }),
    }),
  },
}));

import { teachingHoursService } from "./teachingHours.service";

describe("teachingHoursService.aggregate", () => {
  it("splits completed regular vs extra minutes and tracks the rest", async () => {
    hoisted.error = null;
    hoisted.rows = [
      { teacher_id: "t1", teacher_name: "Ravi", duration_minutes: 60, status: "completed", is_extra: false },
      { teacher_id: "t1", teacher_name: "Ravi", duration_minutes: 90, status: "completed", is_extra: false },
      { teacher_id: "t1", teacher_name: "Ravi", duration_minutes: 45, status: "completed", is_extra: true },
      { teacher_id: "t1", teacher_name: "Ravi", duration_minutes: 60, status: "scheduled", is_extra: false },
      { teacher_id: "t1", teacher_name: "Ravi", duration_minutes: 75, status: "in_progress", is_extra: false },
      { teacher_id: "t1", teacher_name: "Ravi", duration_minutes: 60, status: "cancelled", is_extra: false },
      { teacher_id: "t1", teacher_name: "Ravi", duration_minutes: 60, status: "missed", is_extra: false },
      { teacher_id: "t2", teacher_name: "Anu", duration_minutes: 30, status: "completed", is_extra: false },
    ];

    const map = await teachingHoursService.aggregate("2026-07-01", "2026-07-31");
    const t1 = map.get("t1")!;
    expect(t1.totalMinutes).toBe(150); // 60 + 90
    expect(t1.extraMinutes).toBe(45); // the completed extra class
    expect(t1.scheduledMinutes).toBe(60);
    // Started but not ended: its own bucket, and NOT paid.
    expect(t1.inProgressMinutes).toBe(75);
    expect(t1.inProgressCount).toBe(1);
    expect(t1.totalMinutes).toBe(150);
    expect(t1.cancelledCount).toBe(1);
    expect(t1.missedCount).toBe(1);
    expect(t1.completedCount).toBe(3); // 2 regular + 1 extra
    expect(map.get("t2")!.totalMinutes).toBe(30);
  });

  it("returns an empty map when the table is missing (never throws)", async () => {
    hoisted.rows = [];
    hoisted.error = { message: "relation \"class_schedules\" does not exist" };
    const map = await teachingHoursService.aggregate("2026-07-01", "2026-07-31");
    expect(map.size).toBe(0);
  });

  it("forTeacher returns zeros for an unknown teacher", async () => {
    hoisted.error = null;
    hoisted.rows = [
      { teacher_id: "t1", duration_minutes: 60, status: "completed", is_extra: false },
    ];
    const h = await teachingHoursService.forTeacher("nobody", "2026-07-01", "2026-07-31");
    expect(h.totalMinutes).toBe(0);
    expect(h.completedCount).toBe(0);
  });
});
