// Sidebar badges are a claim about a child, shown before the parent has opened
// anything. A wrong one ("fees outstanding" against a settled account, "absent"
// against a present child) is worse than none at all, so the rules are pinned.

import { describe, expect, it } from "vitest";
import { navBadges } from "../components/ParentSidebar";
import type { ChildSummary } from "../types/parentPortal.types";

const base: ChildSummary = {
  studentId: "s1",
  attendancePercent: 92,
  todayStatus: null,
  classesToday: 0,
  feePending: 0,
  feeTotal: 10000,
  overallPercent: 78,
  health: {} as ChildSummary["health"],
  transportRequired: false,
  hostelRequired: false,
};

const isoInDays = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

describe("navBadges", () => {
  it("emits nothing before the summary has loaded", () => {
    expect(navBadges(undefined)).toEqual({});
  });

  it("emits nothing for a child with nothing to report", () => {
    expect(navBadges(base)).toEqual({});
  });

  it("flags an absent child in danger tone", () => {
    const b = navBadges({ ...base, todayStatus: "absent" })["/parent/attendance"];
    expect(b).toMatchObject({ kind: "dot", tone: "danger" });
    expect(b.title).toMatch(/absent/i);
  });

  it("distinguishes late from absent", () => {
    expect(navBadges({ ...base, todayStatus: "late" })["/parent/attendance"].tone).toBe("warn");
    expect(navBadges({ ...base, todayStatus: "present" })["/parent/attendance"].tone).toBe("ok");
  });

  it("counts today's classes and pluralises the description", () => {
    expect(navBadges({ ...base, classesToday: 1 })["/parent/classes"]).toMatchObject({
      text: "1",
      title: "1 class scheduled today",
    });
    expect(navBadges({ ...base, classesToday: 4 })["/parent/classes"].title).toBe(
      "4 classes scheduled today",
    );
  });

  it("never shows a fee badge when nothing is outstanding", () => {
    expect(navBadges({ ...base, feePending: 0 })["/parent/fees"]).toBeUndefined();
    expect(navBadges({ ...base, feePending: 500 })["/parent/fees"]).toMatchObject({
      kind: "dot",
      tone: "danger",
    });
  });

  it("shows a fee DOT rather than the amount", () => {
    // The figure needs a currency and a due date to mean anything; a bare
    // number in the menu reads as a count of bills.
    expect(navBadges({ ...base, feePending: 2500 })["/parent/fees"].text).toBeUndefined();
  });

  it("labels an exam by how soon it is", () => {
    const exam = { id: "e1", title: "Physics Unit Test" };
    const today = navBadges({ ...base, upcomingExam: { ...exam, date: isoInDays(0) } });
    const tomorrow = navBadges({ ...base, upcomingExam: { ...exam, date: isoInDays(1) } });
    const later = navBadges({ ...base, upcomingExam: { ...exam, date: isoInDays(4) } });

    expect(today["/parent/exams"]).toMatchObject({ text: "Today", tone: "warn" });
    expect(tomorrow["/parent/exams"]).toMatchObject({ text: "Tmrw", tone: "warn" });
    expect(later["/parent/exams"]).toMatchObject({ text: "4d", tone: "info" });
    expect(later["/parent/exams"].title).toContain("Physics Unit Test");
  });

  it("ignores exams that are past or more than a week out", () => {
    const exam = { id: "e1", title: "Physics" };
    expect(navBadges({ ...base, upcomingExam: { ...exam, date: isoInDays(-1) } })["/parent/exams"])
      .toBeUndefined();
    expect(navBadges({ ...base, upcomingExam: { ...exam, date: isoInDays(30) } })["/parent/exams"])
      .toBeUndefined();
  });

  it("ignores an exam with a missing or unparseable date", () => {
    expect(navBadges({ ...base, upcomingExam: { id: "e", title: "X" } })["/parent/exams"])
      .toBeUndefined();
    expect(
      navBadges({ ...base, upcomingExam: { id: "e", title: "X", date: "not-a-date" } })[
        "/parent/exams"
      ],
    ).toBeUndefined();
  });

  it("gives every badge a text description — colour alone is not a signal", () => {
    const all = navBadges({
      ...base,
      todayStatus: "absent",
      classesToday: 3,
      feePending: 900,
      upcomingExam: { id: "e", title: "Maths", date: isoInDays(1) },
    });
    expect(Object.keys(all)).toHaveLength(4);
    for (const badge of Object.values(all)) {
      expect(badge.title.trim().length).toBeGreaterThan(0);
    }
  });
});
