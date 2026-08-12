import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  classTitle, durationLabel, formatDay, groupByDay, localIso, relativeDay,
  resolveRange, shiftIso, timeRangeLabel,
} from "./scheduleView";
import type { ClassSchedule } from "../types/allocation.types";

// ════════════════════════════════════════════════════════════════════════════
// SCHEDULE VIEW
//
// The timezone assertions are the important ones. Every date helper in this
// module used to run local dates through `toISOString()`, which is UTC — so in
// IST the app showed yesterday's classes until 05:30, and every "this month"
// window was shifted a day at both ends for everyone, all day.
//
// A test that only runs in UTC would pass on the old code and prove nothing,
// so these pin the process timezone to Asia/Kolkata.
// ════════════════════════════════════════════════════════════════════════════

const at = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
};

// Vitest shares a worker process across files, so a TZ left set here would
// silently change the timezone of whatever suite runs next in the same worker.
// Captured once and restored after every test.
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = ORIGINAL_TZ;
});

describe("localIso reads the LOCAL calendar day, not the UTC one", () => {
  beforeEach(() => {
    process.env.TZ = "Asia/Kolkata";
  });

  it("returns today at 01:00 IST, when UTC is still yesterday", () => {
    // 2026-08-13T01:00+05:30 === 2026-08-12T19:30Z.
    at("2026-08-12T19:30:00Z");
    expect(localIso()).toBe("2026-08-13");
    // The exact expression this file replaced, kept as the contrast:
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-08-12");
  });

  it("gets the first of the month right", () => {
    // The old monthRange produced "2026-07-31" for this.
    expect(localIso(new Date(2026, 7, 1))).toBe("2026-08-01");
  });

  it("gets the last of the month right", () => {
    expect(localIso(new Date(2026, 8, 0))).toBe("2026-08-31");
  });
});

describe("shiftIso moves whole days without drifting", () => {
  it("crosses a month boundary", () => {
    expect(shiftIso("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftIso("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("crosses a year boundary", () => {
    expect(shiftIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(shiftIso("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftIso("2028-02-29", 1)).toBe("2028-03-01");
  });
});

describe("resolveRange", () => {
  beforeEach(() => {
    process.env.TZ = "Asia/Kolkata";
    at("2026-08-12T06:00:00Z"); // Wed 12 Aug, 11:30 IST
  });

  it("today is a single day", () => {
    expect(resolveRange("today")).toMatchObject({ from: "2026-08-12", to: "2026-08-12" });
  });

  it("tomorrow is the next single day", () => {
    expect(resolveRange("tomorrow")).toMatchObject({ from: "2026-08-13", to: "2026-08-13" });
  });

  it("this week runs Monday to Sunday", () => {
    // 12 Aug 2026 is a Wednesday.
    expect(resolveRange("week")).toMatchObject({ from: "2026-08-10", to: "2026-08-16" });
  });

  it("this month covers the whole calendar month", () => {
    expect(resolveRange("month")).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("ALL is unbounded rather than a guessed window", () => {
    // A wide-but-finite range would silently hide classes beyond it, and "All"
    // that quietly means "all within some window I picked" is the kind of
    // half-truth that costs an afternoon.
    const r = resolveRange("all");
    expect(r.from).toBeUndefined();
    expect(r.to).toBeUndefined();
  });

  it("a picked date is that single day", () => {
    expect(resolveRange("date", "2026-09-04")).toMatchObject({
      from: "2026-09-04",
      to: "2026-09-04",
    });
  });

  it("a picked date with no value falls back to today, never to an empty filter", () => {
    expect(resolveRange("date", "")).toMatchObject({ from: "2026-08-12" });
  });
});

describe("Day labels", () => {
  const today = "2026-08-12";

  it("names today, tomorrow and yesterday", () => {
    expect(relativeDay("2026-08-12", today)).toBe("Today");
    expect(relativeDay("2026-08-13", today)).toBe("Tomorrow");
    expect(relativeDay("2026-08-11", today)).toBe("Yesterday");
  });

  it("falls back to a weekday and date", () => {
    expect(relativeDay("2026-08-15", today)).toBe("Sat, 15 Aug");
  });

  it("shows the year only when it is not the current one", () => {
    expect(formatDay("2026-08-15", today)).toBe("Sat, 15 Aug");
    expect(formatDay("2027-01-04", today)).toBe("Mon, 4 Jan 2027");
  });
});

// ── Grouping ────────────────────────────────────────────────────────────────

const cls = (over: Partial<ClassSchedule>): ClassSchedule =>
  ({
    id: Math.random().toString(36).slice(2),
    scheduleDate: "2026-08-12",
    startTime: "09:00",
    endTime: "10:00",
    durationMinutes: 60,
    status: "scheduled",
    mode: "offline",
    isExtra: false,
    lateMinutes: 0,
    attendanceSubmitted: false,
    standardNames: [],
    ...over,
  }) as ClassSchedule;

describe("groupByDay", () => {
  const today = "2026-08-12";

  it("orders days chronologically", () => {
    const g = groupByDay(
      [
        cls({ scheduleDate: "2026-08-14" }),
        cls({ scheduleDate: "2026-08-12" }),
        cls({ scheduleDate: "2026-08-13" }),
      ],
      today,
    );
    expect(g.map((x) => x.date)).toEqual(["2026-08-12", "2026-08-13", "2026-08-14"]);
  });

  it("orders classes within a day by start time", () => {
    // The service already orders by (schedule_date, start_time). This is here
    // so a cache merge or optimistic insert cannot produce a shuffled list.
    const g = groupByDay(
      [
        cls({ startTime: "14:00", endTime: "15:00" }),
        cls({ startTime: "09:00", endTime: "10:00" }),
        cls({ startTime: "11:30", endTime: "12:30" }),
      ],
      today,
    );
    expect(g[0].items.map((c) => c.startTime)).toEqual(["09:00", "11:30", "14:00"]);
  });

  it("breaks a same-time tie deterministically, so refetches do not shuffle", () => {
    const a = groupByDay(
      [
        cls({ startTime: "09:00", standardName: "Std 4", subjectName: "Maths" }),
        cls({ startTime: "09:00", standardName: "Std 2", subjectName: "English" }),
      ],
      today,
    );
    const b = groupByDay(
      [
        cls({ startTime: "09:00", standardName: "Std 2", subjectName: "English" }),
        cls({ startTime: "09:00", standardName: "Std 4", subjectName: "Maths" }),
      ],
      today,
    );
    expect(a[0].items.map((c) => c.standardName)).toEqual(["Std 2", "Std 4"]);
    expect(b[0].items.map((c) => c.standardName)).toEqual(["Std 2", "Std 4"]);
  });

  it("labels today and past days", () => {
    const g = groupByDay(
      [cls({ scheduleDate: "2026-08-11" }), cls({ scheduleDate: "2026-08-12" })],
      today,
    );
    expect(g[0]).toMatchObject({ heading: "Yesterday", isPast: true, isToday: false });
    expect(g[1]).toMatchObject({ heading: "Today", isPast: false, isToday: true });
  });

  it("excludes cancelled classes from the day total but still lists them", () => {
    // A cancelled class must stay visible — it is why the slot is empty — but
    // counting its minutes would inflate the day's teaching hours.
    const g = groupByDay(
      [
        cls({ durationMinutes: 60 }),
        cls({ startTime: "11:00", durationMinutes: 90, status: "cancelled" }),
      ],
      today,
    );
    expect(g[0].items).toHaveLength(2);
    expect(g[0].totalMinutes).toBe(60);
  });

  it("drops rows with no date rather than inventing a day for them", () => {
    const g = groupByDay([cls({ scheduleDate: "" }), cls({})], today);
    expect(g).toHaveLength(1);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByDay([], today)).toEqual([]);
  });
});

describe("Formatting", () => {
  it("renders durations readably", () => {
    expect(durationLabel(60)).toBe("1h");
    expect(durationLabel(90)).toBe("1h 30m");
    expect(durationLabel(45)).toBe("45m");
    expect(durationLabel(0)).toBe("—");
    expect(durationLabel(-10)).toBe("—");
  });

  it("renders 12-hour time ranges", () => {
    expect(timeRangeLabel("09:00", "10:30")).toBe("9:00 AM – 10:30 AM");
    expect(timeRangeLabel("13:15", "14:00")).toBe("1:15 PM – 2:00 PM");
    // Midnight and noon are the two that off-by-one formatters get wrong.
    expect(timeRangeLabel("00:00", "12:00")).toBe("12:00 AM – 12:00 PM");
  });

  it("names every standard of a combined class", () => {
    expect(
      classTitle(
        cls({ standardNames: ["Std 2", "Std 4"], sectionName: "A", subjectName: "Maths" }),
      ),
    ).toBe("Std 2 + Std 4 · A · Maths");
  });

  it("falls back to the primary standard when the array is empty", () => {
    expect(classTitle(cls({ standardNames: [], standardName: "Std 5", subjectName: "Science" })))
      .toBe("Std 5 · Science");
  });

  it("never renders an empty title", () => {
    expect(classTitle(cls({ standardNames: [] }))).toBe("Class");
  });
});
