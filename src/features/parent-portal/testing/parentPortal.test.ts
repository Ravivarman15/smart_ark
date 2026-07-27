import { describe, it, expect } from "vitest";
import { parentPortalService } from "../services/parentPortal.service";
import type { Student } from "@/features/students/types";
import type { AttendanceDay } from "../services/parentPortal.service";

const student = (over: Partial<Student> = {}): Student =>
  ({
    id: "s1",
    name: "Aarav Kumar",
    batch: "Batch A",
    spi: 0,
    risk: "safe",
    active: true,
    ...over,
  }) as Student;

describe("monthlyAttendance", () => {
  const days: AttendanceDay[] = [
    { date: "2026-01-05", status: "present" },
    { date: "2026-01-06", status: "present" },
    { date: "2026-01-07", status: "late" },
    { date: "2026-01-08", status: "absent" },
    { date: "2026-02-02", status: "present" },
    { date: "2026-02-03", status: "absent" },
  ];

  it("groups by calendar month and sorts chronologically", () => {
    const out = parentPortalService.monthlyAttendance(days);
    expect(out.map((m) => m.month)).toEqual(["2026-01", "2026-02"]);
  });

  it("counts each status", () => {
    const jan = parentPortalService.monthlyAttendance(days)[0];
    expect(jan).toMatchObject({ present: 2, late: 1, absent: 1, total: 4 });
  });

  it("counts LATE as attended — a late child was in class", () => {
    // 3 of 4 attended (2 present + 1 late) = 75%. Counting late as absent
    // would report 50% and contradict the institution's own register.
    expect(parentPortalService.monthlyAttendance(days)[0].percent).toBe(75);
  });

  it("returns an empty list rather than throwing on no data", () => {
    expect(parentPortalService.monthlyAttendance([])).toEqual([]);
  });

  it("never divides by zero", () => {
    const out = parentPortalService.monthlyAttendance([{ date: "2026-01-01", status: "absent" }]);
    expect(out[0].percent).toBe(0);
  });
});

describe("buildTimeline", () => {
  const base = {
    student: student({ dateOfJoining: "2025-06-01", standardName: "Grade 9" }),
    attendance: [] as AttendanceDay[],
    exams: [] as { id: string; title: string; subject: string; date?: string; percent: number | null; absent: boolean }[],
    receipts: [] as { id: string; amount: number; date: string; method: string; receiptNo?: string }[],
    classes: [],
    documents: [] as { id: string; title: string; category: string; createdAt?: string }[],
    messages: [] as { id: string; channel: string; template: string; status: string; createdAt: string }[],
  };

  it("suppresses PRESENT days so exceptions are not buried", () => {
    // A full year is ~220 present rows per child; including them would push
    // every result, receipt and document off the visible feed.
    const out = parentPortalService.buildTimeline({
      ...base,
      attendance: [
        { date: "2026-01-05", status: "present" },
        { date: "2026-01-06", status: "absent" },
        { date: "2026-01-07", status: "late" },
      ],
    });
    const att = out.filter((i) => i.kind === "attendance");
    expect(att).toHaveLength(2);
    expect(att.map((a) => a.title)).toEqual(
      expect.arrayContaining(["Marked absent", "Marked late"]),
    );
  });

  it("excludes exams that were never marked", () => {
    // percent null + not absent = marks were never entered. Rendering that as
    // a result would read as a zero the child scored.
    const out = parentPortalService.buildTimeline({
      ...base,
      exams: [
        { id: "e1", title: "Unit 1", subject: "Maths", date: "2026-01-10", percent: null, absent: false },
        { id: "e2", title: "Unit 2", subject: "Maths", date: "2026-01-20", percent: 72, absent: false },
        { id: "e3", title: "Unit 3", subject: "Maths", date: "2026-01-25", percent: null, absent: true },
      ],
    });
    const exams = out.filter((i) => i.kind === "exam");
    expect(exams).toHaveLength(2);
    expect(exams.some((e) => e.detail.includes("Absent"))).toBe(true);
    expect(exams.some((e) => e.detail.includes("72%"))).toBe(true);
  });

  it("formats receipts with the amount in rupees", () => {
    const out = parentPortalService.buildTimeline({
      ...base,
      receipts: [{ id: "r1", amount: 12500, date: "2026-02-01", method: "UPI", receiptNo: "RC-9" }],
    });
    const fee = out.find((i) => i.kind === "fee");
    expect(fee?.title).toContain("₹12,500");
    expect(fee?.detail).toContain("RC-9");
  });

  it("sorts newest first across every source", () => {
    const out = parentPortalService.buildTimeline({
      ...base,
      attendance: [{ date: "2026-01-01", status: "absent" }],
      receipts: [{ id: "r1", amount: 100, date: "2026-03-01", method: "Cash" }],
      documents: [{ id: "d1", title: "TC", category: "certificate", createdAt: "2026-02-01" }],
    });
    const dates = out.map((i) => i.date ?? "");
    expect([...dates]).toEqual([...dates].sort().reverse());
  });

  it("includes admission as the anchor event", () => {
    const out = parentPortalService.buildTimeline(base);
    expect(out.some((i) => i.kind === "admission")).toBe(true);
  });

  it("returns an empty feed without throwing when a child has no history", () => {
    const out = parentPortalService.buildTimeline({ ...base, student: student() });
    expect(out).toEqual([]);
  });
});
