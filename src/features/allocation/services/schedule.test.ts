import { describe, it, expect, vi } from "vitest";

// Keep the import graph cheap + side-effect-free: stub the supabase client and
// the comms dispatcher that schedule.service pulls in, so we can unit-test the
// pure weekly-repeat expansion in isolation.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));
vi.mock("@/features/communication/services", () => ({
  commsDispatcherService: { dispatch: vi.fn() },
}));

import { expandWeeklyDates } from "./schedule.service";
import type { ScheduleInput } from "../types/allocation.types";

const base: ScheduleInput = {
  teacherId: "t1",
  scheduleDate: "2026-07-01", // a Wednesday
  startTime: "09:00",
  endTime: "10:00",
  mode: "offline",
};

describe("expandWeeklyDates", () => {
  it("returns a single date when not repeating", () => {
    expect(expandWeeklyDates(base)).toEqual(["2026-07-01"]);
  });

  it("expands one occurrence per week up to (and including) repeat_until", () => {
    const dates = expandWeeklyDates({
      ...base,
      repeatWeekly: true,
      repeatUntil: "2026-07-22",
    });
    expect(dates).toEqual(["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22"]);
  });

  it("falls back to the single date when repeatWeekly lacks an until-date", () => {
    expect(expandWeeklyDates({ ...base, repeatWeekly: true })).toEqual(["2026-07-01"]);
  });
});
