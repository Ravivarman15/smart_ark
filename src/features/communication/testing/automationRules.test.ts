import { describe, it, expect } from "vitest";

import {
  toMinutes,
  isWithinQuietHours,
  resolveChannels,
  shouldDispatch,
  partitionDuplicates,
} from "../utils/automationRules";

// ════════════════════════════════════════════════════════════════════════════
// AUTOMATION SMART RULES — the decision layer the dispatcher relies on.
// ════════════════════════════════════════════════════════════════════════════

describe("automation rules — quiet hours", () => {
  it("parses HH:MM and rejects junk", () => {
    expect(toMinutes("08:30")).toBe(510);
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("")).toBeNull();
    expect(toMinutes("99:99")).toBeNull();
    expect(toMinutes(undefined)).toBeNull();
  });

  it("same-day window [09:00, 17:00)", () => {
    expect(isWithinQuietHours("08:59", "09:00", "17:00")).toBe(false);
    expect(isWithinQuietHours("09:00", "09:00", "17:00")).toBe(true);
    expect(isWithinQuietHours("16:59", "09:00", "17:00")).toBe(true);
    expect(isWithinQuietHours("17:00", "09:00", "17:00")).toBe(false);
  });

  it("wraps midnight for a 21:00–08:00 quiet window", () => {
    expect(isWithinQuietHours("22:30", "21:00", "08:00")).toBe(true);
    expect(isWithinQuietHours("03:00", "21:00", "08:00")).toBe(true);
    expect(isWithinQuietHours("08:00", "21:00", "08:00")).toBe(false);
    expect(isWithinQuietHours("12:00", "21:00", "08:00")).toBe(false);
  });

  it("no window when unset or equal bounds", () => {
    expect(isWithinQuietHours("12:00", undefined, undefined)).toBe(false);
    expect(isWithinQuietHours("12:00", "10:00", "10:00")).toBe(false);
  });
});

describe("automation rules — channels & enable gate", () => {
  it("expands channel settings", () => {
    expect(resolveChannels("whatsapp")).toEqual(["whatsapp"]);
    expect(resolveChannels("email")).toEqual(["email"]);
    expect(resolveChannels("both")).toEqual(["whatsapp", "email"]);
  });

  it("disabled events do not dispatch", () => {
    expect(shouldDispatch({ enabled: false })).toEqual({ ok: false, reason: "event disabled" });
    expect(shouldDispatch({ enabled: true })).toEqual({ ok: true });
  });
});

describe("automation rules — duplicate protection", () => {
  it("drops items already queued today and in-batch repeats", () => {
    const items = [
      { id: "s1" },
      { id: "s2" },
      { id: "s1" }, // in-batch repeat
      { id: "s3" },
    ];
    const existing = new Set(["s2"]); // s2 already queued today
    const { fresh, duplicates } = partitionDuplicates(items, existing, (i) => i.id);
    expect(fresh.map((f) => f.id)).toEqual(["s1", "s3"]);
    expect(duplicates).toBe(2); // the existing s2 + the repeated s1
  });

  it("keeps everything when nothing is a duplicate", () => {
    const { fresh, duplicates } = partitionDuplicates([{ id: "a" }, { id: "b" }], new Set(), (i) => i.id);
    expect(fresh).toHaveLength(2);
    expect(duplicates).toBe(0);
  });
});
