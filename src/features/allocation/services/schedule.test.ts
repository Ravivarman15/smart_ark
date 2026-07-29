import { describe, it, expect, vi } from "vitest";

// Keep the import graph cheap + side-effect-free: stub the supabase client and
// the comms dispatcher that schedule.service pulls in, so we can unit-test the
// pure weekly-repeat expansion in isolation.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));
vi.mock("@/features/communication/services", () => ({
  commsDispatcherService: { dispatch: vi.fn() },
}));

import { expandWeeklyDates, normalizeStandards, standardOrFilter } from "./schedule.service";
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

// A class can now span several standards, but `standard_id` remains the column
// that RLS, every filter and the denormalised label read. If the primary ever
// disagrees with the array, a coordinator writes a class they don't own — so
// the derivation is pinned rather than left to a call site.
describe("normalizeStandards", () => {
  it("keeps the first selected standard as the primary", () => {
    expect(normalizeStandards({ standardIds: ["std9", "std10"] })).toEqual({
      ids: ["std9", "std10"],
      primaryId: "std9",
    });
  });

  it("promotes a lone scalar standard into the array", () => {
    expect(normalizeStandards({ standardId: "std9" })).toEqual({
      ids: ["std9"],
      primaryId: "std9",
    });
  });

  it("ignores a stale scalar when the array is set", () => {
    // Otherwise a leftover single-standard value rides along and can even
    // become the primary the class is filed under.
    expect(normalizeStandards({ standardId: "old", standardIds: ["std9", "std10"] })).toEqual({
      ids: ["std9", "std10"],
      primaryId: "std9",
    });
  });

  it("de-duplicates and survives an empty selection", () => {
    expect(normalizeStandards({ standardIds: ["std9", "std9"] }).ids).toEqual(["std9"]);
    expect(normalizeStandards({})).toEqual({ ids: [], primaryId: undefined });
  });
});

describe("standardOrFilter", () => {
  it("inner-quotes the array literal", () => {
    // Without the quotes PostgREST 400s the whole request with `malformed array
    // literal` — verified live. Nothing in the type system catches it, so the
    // exact string is pinned here.
    expect(standardOrFilter("abc-123")).toBe(
      'standard_id.eq.abc-123,standard_ids.cs.{"abc-123"}',
    );
  });
});
