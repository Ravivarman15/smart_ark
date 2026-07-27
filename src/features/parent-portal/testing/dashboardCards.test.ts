import { describe, it, expect } from "vitest";
import {
  certificatesFrom,
  examUrgency,
  liveClassStatus,
  marksTrend,
  monthlyAttendanceCard,
  monthLabel,
  parentEngagement,
  relativeDay,
  teacherRemarks,
  weeklyProgress,
} from "../utils/dashboardCards";
import type { ExamPoint } from "@/features/students/hooks/useStudentInsights";
import type { StudentDocument } from "@/features/students/types";
import type { TimelineEntry } from "@/features/communication/types/communication.types";
import type { AttendanceDay } from "../services/parentPortal.service";
import type { ParentClassItem } from "../types/parentPortal.types";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

const exam = (percent: number | null, date: string): ExamPoint => ({
  id: `${date}-${percent}`,
  title: "Test",
  subject: "Maths",
  date,
  marks: percent,
  total: 100,
  percent,
  absent: false,
});

describe("relativeDay", () => {
  it("labels today and tomorrow in words", () => {
    expect(relativeDay(daysAhead(0))).toBe("Today");
    expect(relativeDay(daysAhead(1))).toBe("Tomorrow");
  });

  it("counts days inside the coming week", () => {
    expect(relativeDay(daysAhead(3))).toBe("In 3 days");
  });

  it("falls back to an absolute date beyond a week", () => {
    expect(relativeDay(daysAhead(20))).toMatch(/\d/);
    expect(relativeDay(daysAhead(20))).not.toContain("In ");
  });

  it("never renders a negative countdown for a past date", () => {
    // "In -2 days" is nonsense on a dashboard.
    expect(relativeDay(daysAgo(2))).not.toContain("In ");
  });

  it("handles missing and malformed input", () => {
    expect(relativeDay(undefined)).toBe("—");
    expect(relativeDay("not-a-date")).toBe("not-a-date");
  });
});

describe("examUrgency", () => {
  it("escalates as the exam approaches", () => {
    expect(examUrgency(daysAhead(0))).toBe("bad");
    expect(examUrgency(daysAhead(1))).toBe("warn");
    expect(examUrgency(daysAhead(6))).toBe("default");
  });
});

describe("weeklyProgress", () => {
  it("divides by RECORDED days, not a flat seven", () => {
    // Only 3 days recorded (holidays/weekend); 3/3 attended must read 100%,
    // not 43%. A parent seeing 43% during an exam break would panic.
    const att: AttendanceDay[] = [
      { date: daysAgo(1), status: "present" },
      { date: daysAgo(2), status: "present" },
      { date: daysAgo(3), status: "late" },
    ];
    const w = weeklyProgress(att, []);
    expect(w.recordedDays).toBe(3);
    expect(w.attendancePercent).toBe(100);
  });

  it("counts late as attended", () => {
    const w = weeklyProgress(
      [
        { date: daysAgo(1), status: "late" },
        { date: daysAgo(2), status: "absent" },
      ],
      [],
    );
    expect(w.attendedDays).toBe(1);
    expect(w.attendancePercent).toBe(50);
  });

  it("ignores attendance older than the window", () => {
    const w = weeklyProgress([{ date: daysAgo(30), status: "absent" }], []);
    expect(w.recordedDays).toBe(0);
    expect(w.attendancePercent).toBeNull();
  });

  it("averages only results inside the week", () => {
    const w = weeklyProgress([], [exam(90, daysAgo(2)), exam(10, daysAgo(40))]);
    expect(w.resultCount).toBe(1);
    expect(w.averagePercent).toBe(90);
  });

  it("compares against the preceding week", () => {
    const w = weeklyProgress([], [exam(80, daysAgo(2)), exam(60, daysAgo(10))]);
    expect(w.deltaVsPrevious).toBe(20);
  });

  it("reports no delta when either week is empty", () => {
    expect(weeklyProgress([], [exam(80, daysAgo(2))]).deltaVsPrevious).toBeNull();
  });
});

describe("marksTrend", () => {
  it("refuses a verdict on fewer than four results", () => {
    const t = marksTrend([exam(50, "2026-01-01"), exam(60, "2026-02-01")]);
    expect(t.direction).toBe("insufficient");
  });

  it("detects a decline over thirds", () => {
    const t = marksTrend([
      exam(90, "2026-01-01"), exam(88, "2026-01-10"),
      exam(60, "2026-02-01"), exam(55, "2026-02-10"),
      exam(45, "2026-03-01"), exam(40, "2026-03-10"),
    ]);
    expect(t.direction).toBe("declining");
    expect(t.delta).toBeLessThan(0);
  });

  it("absorbs a single outlier instead of crying decline", () => {
    const t = marksTrend([
      exam(80, "2026-01-01"), exam(82, "2026-01-10"),
      exam(15, "2026-02-01"), exam(81, "2026-02-10"),
      exam(83, "2026-03-01"), exam(80, "2026-03-10"),
    ]);
    expect(t.direction).toBe("steady");
  });

  it("returns points oldest-first and caps the series", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      exam(50 + i, `2026-01-${String(i + 1).padStart(2, "0")}`),
    );
    const t = marksTrend(many, 8);
    expect(t.points).toHaveLength(8);
    expect(t.points[0].percent).toBeLessThan(t.points[7].percent);
  });

  it("exposes the latest score", () => {
    expect(marksTrend([exam(40, "2026-01-01"), exam(77, "2026-02-01")]).latest).toBe(77);
  });

  it("survives an empty history", () => {
    const t = marksTrend([]);
    expect(t.points).toEqual([]);
    expect(t.latest).toBeNull();
  });
});

describe("teacherRemarks", () => {
  const r = (id: string, remarks: string | undefined, date: string) => ({
    id, subject: "Maths", title: "Unit", date, remarks, percent: 70,
  });

  it("drops blank and missing remarks", () => {
    expect(teacherRemarks([r("1", undefined, "2026-01-01"), r("2", "   ", "2026-01-02")])).toHaveLength(0);
  });

  it("returns newest first and trims", () => {
    const out = teacherRemarks([
      r("1", " good work ", "2026-01-01"),
      r("2", "improving", "2026-03-01"),
    ]);
    expect(out[0].remark).toBe("improving");
    expect(out[1].remark).toBe("good work");
  });

  it("respects the take limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => r(String(i), "note", `2026-01-0${(i % 9) + 1}`));
    expect(teacherRemarks(many, 3)).toHaveLength(3);
  });
});

describe("certificatesFrom", () => {
  const doc = (category: string, createdAt: string): StudentDocument =>
    ({ id: category + createdAt, studentId: "s1", category, title: "T", isShared: true, createdAt }) as StudentDocument;

  it("keeps only achievement categories", () => {
    const out = certificatesFrom([
      doc("certificate", "2026-01-01"),
      doc("marksheet", "2026-02-01"),
      doc("id_proof", "2026-03-01"),
      doc("medical", "2026-04-01"),
    ]);
    expect(out.map((d) => d.category).sort()).toEqual(["certificate", "marksheet"]);
  });

  it("orders newest first", () => {
    const out = certificatesFrom([doc("certificate", "2026-01-01"), doc("certificate", "2026-05-01")]);
    expect(out[0].createdAt).toBe("2026-05-01");
  });
});

describe("parentEngagement", () => {
  const msg = (status: string, readAt: string | undefined, createdAt: string): TimelineEntry =>
    ({ id: status + createdAt, createdAt, channel: "whatsapp", template: "t", provider: "aisensy", status, readAt, retryCount: 0 }) as TimelineEntry;

  it("excludes undelivered messages from the denominator", () => {
    // A parent must never be marked down for a message that never arrived.
    const e = parentEngagement(
      [
        msg("delivered", new Date().toISOString(), daysAgo(1)),
        msg("failed", undefined, daysAgo(1)),
        msg("queued", undefined, daysAgo(1)),
      ],
      0,
    );
    expect(e.delivered).toBe(1);
    expect(e.readPercent).toBe(100);
  });

  it("reports unknown rather than 0% when nothing is measurable", () => {
    const e = parentEngagement([], 0);
    expect(e.readPercent).toBeNull();
    expect(e.band).toBe("unknown");
  });

  it("ignores messages outside the window", () => {
    expect(parentEngagement([msg("delivered", undefined, daysAgo(60))], 0).delivered).toBe(0);
  });

  it("bands on either read rate or portal visits", () => {
    // Portal visits alone can earn a band — a parent who reads everything in
    // the portal but never opens WhatsApp is engaged.
    expect(parentEngagement([], 15).band).toBe("strong");
    expect(parentEngagement([], 5).band).toBe("steady");

    // Read rate alone can too: 3 of 3 = 100% ≥ 70.
    const allRead = Array.from({ length: 3 }, (_, i) =>
      msg("delivered", new Date().toISOString(), daysAgo(i + 1)),
    );
    expect(parentEngagement(allRead, 0).band).toBe("strong");

    // Half read is genuinely middling, not strong.
    const halfRead = [
      msg("delivered", new Date().toISOString(), daysAgo(1)),
      msg("delivered", undefined, daysAgo(2)),
    ];
    expect(parentEngagement(halfRead, 0).readPercent).toBe(50);
    expect(parentEngagement(halfRead, 0).band).toBe("steady");
  });

  it("bands low only when both signals are genuinely weak", () => {
    const e = parentEngagement(
      Array.from({ length: 10 }, (_, i) => msg("delivered", undefined, daysAgo(i + 1))),
      1,
    );
    expect(e.readPercent).toBe(0);
    expect(e.band).toBe("low");
  });
});

describe("liveClassStatus", () => {
  const cls = (over: Partial<ParentClassItem>): ParentClassItem => ({
    id: Math.random().toString(36).slice(2),
    source: "live",
    title: "Physics",
    startTime: "09:00",
    endTime: "10:00",
    ...over,
  });

  it("reports none when there are no online classes", () => {
    expect(liveClassStatus([], "09:30").state).toBe("none");
    expect(liveClassStatus([cls({ source: "schedule", meetingLink: undefined })], "09:30").state).toBe("none");
  });

  it("detects a class in progress", () => {
    const s = liveClassStatus([cls({})], "09:30");
    expect(s.state).toBe("live");
    expect(s.current?.title).toBe("Physics");
  });

  it("treats the boundaries as live", () => {
    expect(liveClassStatus([cls({})], "09:00").state).toBe("live");
    expect(liveClassStatus([cls({})], "10:00").state).toBe("live");
  });

  it("surfaces the earliest upcoming class", () => {
    const s = liveClassStatus(
      [cls({ startTime: "14:00", title: "Chem" }), cls({ startTime: "11:00", title: "Bio" })],
      "10:30",
    );
    expect(s.state).toBe("upcoming");
    expect(s.next?.title).toBe("Bio");
  });

  it("skips cancelled classes", () => {
    expect(liveClassStatus([cls({ status: "cancelled" })], "09:30").state).toBe("done");
  });

  it("reports done once the day's classes have passed", () => {
    expect(liveClassStatus([cls({})], "18:00").state).toBe("done");
  });
});

describe("monthlyAttendanceCard", () => {
  const m = (month: string, percent: number) => ({
    month, present: percent, late: 0, absent: 100 - percent, total: 100, percent,
  });

  it("takes the latest month and its change", () => {
    const c = monthlyAttendanceCard([m("2026-05", 80), m("2026-06", 92)]);
    expect(c.month).toBe("2026-06");
    expect(c.percent).toBe(92);
    expect(c.deltaVsPrevious).toBe(12);
  });

  it("reports no delta for a single month", () => {
    expect(monthlyAttendanceCard([m("2026-06", 92)]).deltaVsPrevious).toBeNull();
  });

  it("handles no data", () => {
    expect(monthlyAttendanceCard([]).percent).toBeNull();
  });
});

describe("monthLabel", () => {
  it("renders a readable month", () => {
    expect(monthLabel("2026-07")).toContain("July");
    expect(monthLabel("2026-07")).toContain("2026");
  });

  it("passes through junk unchanged", () => {
    expect(monthLabel("")).toBe("—");
    expect(monthLabel("garbage")).toBe("garbage");
  });
});
