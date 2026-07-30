import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ════════════════════════════════════════════════════════════════════════════
// CLASS LIFECYCLE WRITES — the contract that stops Start from lying.
//
// A PostgREST UPDATE whose row RLS filters away returns 204 with `error: null`.
// That is byte-for-byte a successful write, and it is how teachers spent weeks
// pressing Start on a class that never moved: they had no UPDATE policy on
// class_schedules, so every press updated zero rows while the UI toasted
// "you're live" and the coordinator's board kept the class under "not started".
//
// So the rule these tests pin:
//   • zero rows written ⇒ the call THROWS (never a silent success)
//   • a late start is recorded, never refused — the class still happened
//   • Start is idempotent: the second press does not move the start time
//   • End is idempotent: it does not restamp a class that already ended
// ════════════════════════════════════════════════════════════════════════════

const hoisted = vi.hoisted(() => ({
  /** The row `get()` sees. */
  row: null as Record<string, unknown> | null,
  /** Rows PostgREST hands back from `update(...).select("id")`. */
  updated: [] as { id: string }[],
  /** Every patch the service attempted, in order. */
  patches: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = () => {
    let isUpdate = false;
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    Object.assign(chain, {
      select: passthrough,
      eq: passthrough,
      in: passthrough,
      is: passthrough,
      gte: passthrough,
      lte: passthrough,
      order: passthrough,
      or: passthrough,
      insert: passthrough,
      update: (p: Record<string, unknown>) => {
        isUpdate = true;
        hoisted.patches.push(p);
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: hoisted.row, error: null }),
      single: () => Promise.resolve({ data: hoisted.row, error: null }),
      // The chain is thenable so `await table.update(...).eq(...).select("id")`
      // resolves the same way the real client does.
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: isUpdate ? hoisted.updated : [], error: null }).then(resolve),
    });
    return chain;
  };
  return { supabase: { from: () => makeChain(), rpc: () => Promise.resolve({ data: false, error: null }) } };
});

vi.mock("@/features/communication/services", () => ({
  commsDispatcherService: { dispatch: vi.fn() },
}));
vi.mock("./classStudents.service", () => ({
  classStudentsService: { setRoster: vi.fn(), listAssigned: vi.fn(async () => []) },
}));

import { scheduleService } from "./schedule.service";

// Punctuality is derived from the wall clock, so the clock is frozen — at
// 10:08:00 local on the class's own date. Without this the seconds hand decides
// whether an 8-minute-late start rounds to 8 or 9 and the test flickers.
const NOW = new Date(2026, 6, 30, 10, 8, 0);

/** A class scheduled 10:00–11:00 on the frozen date, in any state. */
const rowFor = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  teacher_id: "t1",
  schedule_date: "2026-07-30",
  start_time: "10:00:00",
  end_time: "11:00:00",
  duration_minutes: 60,
  status: "scheduled",
  ...over,
});

describe("class lifecycle writes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    hoisted.row = rowFor();
    hoisted.updated = [{ id: "c1" }];
    hoisted.patches = [];
  });

  afterEach(() => vi.useRealTimers());

  it("throws instead of reporting success when RLS swallows the start", async () => {
    hoisted.updated = []; // 204, no error, no rows — the exact failure mode
    await expect(scheduleService.start("c1", undefined, {})).rejects.toThrow(
      /Could not start this class/i,
    );
  });

  it("throws when RLS swallows the end", async () => {
    hoisted.row = rowFor({ status: "in_progress", started_at: new Date().toISOString() });
    hoisted.updated = [];
    await expect(scheduleService.complete("c1", undefined, {})).rejects.toThrow(
      /Could not end this class/i,
    );
  });

  it("throws when RLS swallows the attendance flag", async () => {
    hoisted.updated = [];
    await expect(scheduleService.submitAttendance("c1")).rejects.toThrow(
      /Could not record attendance against this class/i,
    );
  });

  // Being late is a fact to record, not a reason to refuse: a class blocked
  // from starting is a class the timetable claims never happened.
  it("starts a class that is 8 minutes late and records the lateness", async () => {
    hoisted.row = rowFor({ start_time: "10:00:00" }); // frozen clock is 10:08
    await scheduleService.start("c1", undefined, {});
    const patch = hoisted.patches[0];
    expect(patch.status).toBe("in_progress");
    expect(patch.started_at).toBeTruthy();
    expect(patch.late_minutes).toBe(8);
    expect(patch.early_minutes).toBe(0);
  });

  it("records an early start as early, not as negative lateness", async () => {
    hoisted.row = rowFor({ start_time: "10:13:00" }); // frozen clock is 10:08
    await scheduleService.start("c1", undefined, {});
    expect(hoisted.patches[0].late_minutes).toBe(0);
    expect(hoisted.patches[0].early_minutes).toBe(5);
  });

  // A teacher unsure whether their press registered presses again — the live
  // audit trail has one who pressed Start five times in ninety seconds. The
  // second press must not reset the clock the whole lifecycle is measured from.
  it("does not restamp a class that is already running", async () => {
    hoisted.row = rowFor({ status: "in_progress", started_at: "2026-07-30T10:02:00.000Z" });
    await scheduleService.start("c1", undefined, {});
    expect(hoisted.patches).toEqual([]);
  });

  it("refuses to re-start a class that already ended", async () => {
    hoisted.row = rowFor({ status: "completed", completed_at: "2026-07-30T11:00:00.000Z" });
    await expect(scheduleService.start("c1", undefined, {})).rejects.toThrow(/already completed/i);
  });

  it("does not restamp the end of a class that already ended", async () => {
    hoisted.row = rowFor({ status: "completed", completed_at: "2026-07-30T11:00:00.000Z" });
    await scheduleService.complete("c1", undefined, {});
    expect(hoisted.patches).toEqual([]);
  });

  // Actual minutes are measured from the real start, so a class begun late is
  // paid for what it actually ran — not for its slot on the timetable.
  it("measures actual minutes from the real start time", async () => {
    const startedAt = new Date(Date.now() - 45 * 60_000).toISOString();
    hoisted.row = rowFor({ status: "in_progress", started_at: startedAt });
    await scheduleService.complete("c1", undefined, {});
    expect(hoisted.patches[0].status).toBe("completed");
    expect(hoisted.patches[0].actual_minutes).toBe(45);
  });
});
