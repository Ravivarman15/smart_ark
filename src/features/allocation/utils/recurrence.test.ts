import { describe, it, expect } from "vitest";
import {
  academicYearOf,
  dayOfWeek,
  effectivePattern,
  expandRecurrence,
  monthOf,
  MAX_OCCURRENCES,
} from "./recurrence";

// ════════════════════════════════════════════════════════════════════════════
// Recurrence engine. The contract that matters:
//   • daily / weekly / monthly expansion is correct and INCLUSIVE of the bounds
//   • a day-of-week mask produces a real Mon/Wed/Fri timetable
//   • everything is UTC-safe — a +05:30 machine must NOT drift a day (this was
//     a real Phase-1 bug: `new Date("2026-07-01")` parses as local time)
//   • a missing end date never generates an unbounded series
// ════════════════════════════════════════════════════════════════════════════

describe("expandRecurrence", () => {
  it("returns just the start date when it does not repeat", () => {
    expect(expandRecurrence({ scheduleDate: "2026-07-01", repeatPattern: "none" })).toEqual([
      "2026-07-01",
    ]);
  });

  it("returns a single date when repeatUntil is missing", () => {
    expect(
      expandRecurrence({ scheduleDate: "2026-07-01", repeatPattern: "weekly" }),
    ).toEqual(["2026-07-01"]);
  });

  it("expands weekly on the start weekday, inclusive of the end date", () => {
    // 2026-07-01 is a Wednesday.
    expect(
      expandRecurrence({
        scheduleDate: "2026-07-01",
        repeatPattern: "weekly",
        repeatUntil: "2026-07-29",
      }),
    ).toEqual(["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22", "2026-07-29"]);
  });

  it("expands weekly with a Mon/Wed/Fri mask", () => {
    const out = expandRecurrence({
      scheduleDate: "2026-07-01", // Wed
      repeatPattern: "weekly",
      repeatDays: [1, 3, 5], // Mon, Wed, Fri
      repeatUntil: "2026-07-10",
    });
    expect(out).toEqual([
      "2026-07-01", // Wed
      "2026-07-03", // Fri
      "2026-07-06", // Mon
      "2026-07-08", // Wed
      "2026-07-10", // Fri
    ]);
    for (const d of out) expect([1, 3, 5]).toContain(dayOfWeek(d));
  });

  it("expands daily across every day in the range", () => {
    expect(
      expandRecurrence({
        scheduleDate: "2026-07-01",
        repeatPattern: "daily",
        repeatUntil: "2026-07-05",
      }),
    ).toEqual(["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]);
  });

  it("expands daily but skips Sundays when a mask excludes them", () => {
    const out = expandRecurrence({
      scheduleDate: "2026-07-01",
      repeatPattern: "daily",
      repeatDays: [1, 2, 3, 4, 5, 6], // everything except Sunday
      repeatUntil: "2026-07-08",
    });
    expect(out).not.toContain("2026-07-05"); // Sunday
    expect(out).toHaveLength(7);
  });

  it("expands monthly on the same day-of-month", () => {
    expect(
      expandRecurrence({
        scheduleDate: "2026-01-15",
        repeatPattern: "monthly",
        repeatUntil: "2026-04-30",
      }),
    ).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("skips months that are too short instead of rolling into the next month", () => {
    const out = expandRecurrence({
      scheduleDate: "2026-01-31",
      repeatPattern: "monthly",
      repeatUntil: "2026-04-30",
    });
    // February has no 31st — it is skipped, never rolled to March 3rd.
    expect(out).toEqual(["2026-01-31", "2026-03-31"]);
  });

  it("is timezone-safe — no day drifts even in +05:30", () => {
    // The Phase-1 regression: local parsing turned 2026-07-01 into 2026-06-30.
    const out = expandRecurrence({
      scheduleDate: "2026-07-01",
      repeatPattern: "weekly",
      repeatUntil: "2026-07-15",
    });
    expect(out[0]).toBe("2026-07-01");
    expect(out.every((d) => d.startsWith("2026-07"))).toBe(true);
  });

  it("caps a runaway series", () => {
    const out = expandRecurrence({
      scheduleDate: "2020-01-01",
      repeatPattern: "daily",
      repeatUntil: "2099-01-01",
    });
    expect(out).toHaveLength(MAX_OCCURRENCES);
  });

  it("ignores an end date that precedes the start", () => {
    expect(
      expandRecurrence({
        scheduleDate: "2026-07-10",
        repeatPattern: "weekly",
        repeatUntil: "2026-07-01",
      }),
    ).toEqual(["2026-07-10"]);
  });
});

describe("effectivePattern", () => {
  it("treats the legacy repeatWeekly boolean as weekly", () => {
    expect(effectivePattern({ scheduleDate: "2026-07-01", repeatWeekly: true })).toBe("weekly");
  });

  it("lets an explicit pattern win over the legacy boolean", () => {
    expect(
      effectivePattern({ scheduleDate: "2026-07-01", repeatWeekly: true, repeatPattern: "daily" }),
    ).toBe("daily");
  });

  it("respects an explicit 'none'", () => {
    expect(
      effectivePattern({ scheduleDate: "2026-07-01", repeatWeekly: true, repeatPattern: "none" }),
    ).toBe("none");
  });
});

describe("academic dimensions", () => {
  it("runs the academic year June → May", () => {
    expect(academicYearOf("2026-07-01")).toBe("2026-2027");
    expect(academicYearOf("2026-06-01")).toBe("2026-2027");
    expect(academicYearOf("2026-05-31")).toBe("2025-2026");
    expect(academicYearOf("2026-01-15")).toBe("2025-2026");
  });

  it("reads the calendar month without timezone drift", () => {
    expect(monthOf("2026-07-01")).toBe(7);
    expect(monthOf("2026-01-31")).toBe(1);
  });
});
