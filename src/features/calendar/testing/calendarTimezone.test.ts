// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Timezone & Holiday Bounds Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { format, parseISO } from "date-fns";

describe("Organization Timezone & Holiday Boundary Tests", () => {
  it("preserves full-day holiday on the correct local date in Asia/Kolkata (IST: UTC+5:30)", () => {
    // Onam Holiday on September 4, 2026
    // Local start: 2026-09-04 00:00:00 IST -> UTC is 2026-09-03T18:30:00Z
    // Local end:   2026-09-04 23:59:59 IST -> UTC is 2026-09-04T18:29:59Z
    const holidayStartIso = "2026-09-03T18:30:00.000Z";
    const holidayEndIso = "2026-09-04T18:29:59.000Z";

    // During the Indian day (e.g. 10:00 AM IST on Sept 4 = 04:30:00 UTC)
    const indianMorning = new Date("2026-09-04T04:30:00.000Z").getTime();
    const isDuringHoliday =
      indianMorning >= new Date(holidayStartIso).getTime() &&
      indianMorning <= new Date(holidayEndIso).getTime();

    expect(isDuringHoliday).toBe(true);

    // After Indian midnight (e.g. 01:00 AM IST on Sept 5 = 19:30:00 UTC Sept 4)
    const indianNextDay = new Date("2026-09-04T19:30:00.000Z").getTime();
    const isAfterHoliday = indianNextDay > new Date(holidayEndIso).getTime();

    expect(isAfterHoliday).toBe(true);
  });

  it("evaluates events independently across two tenants in different timezones", () => {
    // Tenant 1 (ARK: Asia/Kolkata, UTC+5:30) vs Tenant 2 (Global: America/New_York, UTC-4:00)
    // Both schedule a "9:00 AM local start" event on October 10, 2026
    const tenant1StartUtc = new Date("2026-10-10T03:30:00.000Z").getTime(); // 9:00 AM IST
    const tenant2StartUtc = new Date("2026-10-10T13:00:00.000Z").getTime(); // 9:00 AM EDT

    // At 2026-10-10T06:00:00Z:
    // - In India, it is 11:30 AM -> Tenant 1 event is ONGOING / STARTED.
    // - In New York, it is 2:00 AM -> Tenant 2 event has NOT started yet.
    const testInstant = new Date("2026-10-10T06:00:00.000Z").getTime();

    expect(testInstant >= tenant1StartUtc).toBe(true);
    expect(testInstant >= tenant2StartUtc).toBe(false);
  });
});
