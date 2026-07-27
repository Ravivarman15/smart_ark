import { describe, it, expect } from "vitest";
import {
  answer,
  classifyQuestion,
  periodSummary,
} from "../utils/parentAssistant";
import type { StudentInsights, ExamPoint } from "@/features/students/hooks/useStudentInsights";

const exam = (over: Partial<ExamPoint> & { percent: number | null; date: string }): ExamPoint => ({
  id: Math.random().toString(36).slice(2),
  title: "Unit Test",
  subject: "Maths",
  marks: over.percent,
  total: 100,
  absent: false,
  grade: undefined,
  ...over,
});

const insightsWith = (exams: ExamPoint[], fee?: StudentInsights["fee"]): StudentInsights => {
  const scored = exams.filter((e) => e.percent !== null);
  return {
    fee,
    exams,
    subjects: [
      { subject: "Maths", avgPercent: 40, count: 3 },
      { subject: "Science", avgPercent: 80, count: 3 },
    ],
    strong: [{ subject: "Science", avgPercent: 80, count: 3 }],
    weak: [{ subject: "Maths", avgPercent: 40, count: 3 }],
    overallPercent: scored.length
      ? Math.round(scored.reduce((a, e) => a + (e.percent as number), 0) / scored.length)
      : null,
    attendance: undefined,
  };
};

describe("classifyQuestion", () => {
  it("routes fee wording to the fees answer", () => {
    expect(classifyQuestion("Are any fees due?")).toBe("fees");
    expect(classifyQuestion("how much is pending")).toBe("fees");
    expect(classifyQuestion("Did my payment go through")).toBe("fees");
  });

  it("routes attendance wording to the attendance answer", () => {
    expect(classifyQuestion("How is attendance?")).toBe("attendance");
    expect(classifyQuestion("was he absent yesterday")).toBe("attendance");
  });

  it("routes weak-subject wording even when phrased loosely", () => {
    // The whole point of keyword scoring: a parent will not type the canned
    // question verbatim.
    expect(classifyQuestion("his maths is really bad")).toBe("weak");
    expect(classifyQuestion("which subject is she struggling in")).toBe("weak");
  });

  it("falls back to a useful summary rather than an error", () => {
    expect(classifyQuestion("hello")).toBe("summary");
    expect(classifyQuestion("")).toBe("summary");
  });
});

describe("answer — marks trend", () => {
  const ctx = (exams: ExamPoint[], attendancePercent: number | null = 90) => ({
    studentName: "Aarav Kumar",
    insights: insightsWith(exams),
    attendancePercent,
  });

  it("refuses to call a trend on fewer than four results", () => {
    const a = answer("marks", ctx([
      exam({ percent: 80, date: "2026-01-10" }),
      exam({ percent: 40, date: "2026-02-10" }),
    ]));
    expect(a.answer).toContain("not enough");
  });

  it("reports a decline when the recent third is materially lower", () => {
    const a = answer("marks", ctx([
      exam({ percent: 90, date: "2026-01-01" }),
      exam({ percent: 88, date: "2026-01-15" }),
      exam({ percent: 60, date: "2026-02-01" }),
      exam({ percent: 50, date: "2026-02-15" }),
      exam({ percent: 45, date: "2026-03-01" }),
      exam({ percent: 40, date: "2026-03-15" }),
    ]));
    expect(a.answer).toMatch(/down \d+ points/);
    expect(a.facts.find((f) => f.label === "Change")?.value).toMatch(/^-/);
  });

  it("does not cry decline over a single bad paper", () => {
    // Thirds-based comparison exists precisely so one outlier is absorbed.
    const a = answer("marks", ctx([
      exam({ percent: 80, date: "2026-01-01" }),
      exam({ percent: 82, date: "2026-01-15" }),
      exam({ percent: 20, date: "2026-02-01" }),
      exam({ percent: 81, date: "2026-02-15" }),
      exam({ percent: 83, date: "2026-03-01" }),
      exam({ percent: 80, date: "2026-03-15" }),
    ]));
    expect(a.answer).not.toMatch(/down/);
  });

  it("says so when marks are improving", () => {
    const a = answer("marks", ctx([
      exam({ percent: 40, date: "2026-01-01" }),
      exam({ percent: 42, date: "2026-01-15" }),
      exam({ percent: 60, date: "2026-02-01" }),
      exam({ percent: 70, date: "2026-02-15" }),
      exam({ percent: 85, date: "2026-03-01" }),
      exam({ percent: 88, date: "2026-03-15" }),
    ]));
    expect(a.answer).toContain("not dropping");
  });

  it("mentions attendance as a contributing factor only when it is actually low", () => {
    const declining = [
      exam({ percent: 90, date: "2026-01-01" }),
      exam({ percent: 88, date: "2026-01-15" }),
      exam({ percent: 60, date: "2026-02-01" }),
      exam({ percent: 50, date: "2026-02-15" }),
      exam({ percent: 45, date: "2026-03-01" }),
      exam({ percent: 40, date: "2026-03-15" }),
    ];
    expect(answer("marks", ctx(declining, 55)).answer).toContain("below 75%");
    expect(answer("marks", ctx(declining, 95)).answer).not.toContain("below 75%");
  });
});

describe("answer — fees", () => {
  const withFee = (pending: number) => ({
    studentName: "Aarav",
    attendancePercent: 90,
    insights: insightsWith([], {
      id: "f1",
      total: 50000,
      discount: 5000,
      received: 45000 - pending,
      pending,
      status: pending > 0 ? "partial" : "paid",
      receipts: [],
    }),
  });

  it("states a clear balance when fees are paid", () => {
    expect(answer("fees", withFee(0)).answer).toContain("fully paid");
  });

  it("quotes the exact pending amount", () => {
    const a = answer("fees", withFee(12000));
    expect(a.answer).toContain("₹12,000");
    expect(a.facts.find((f) => f.label === "Pending")?.value).toBe("₹12,000");
  });

  it("does not invent a fee record when none exists", () => {
    const a = answer("fees", { studentName: "Aarav", attendancePercent: 90, insights: insightsWith([]) });
    expect(a.answer).toContain("No fee record");
  });
});

describe("answer — attendance", () => {
  const at = (p: number | null) => ({
    studentName: "Aarav",
    attendancePercent: p,
    insights: insightsWith([]),
  });

  it("flags sub-75% attendance as needing action", () => {
    expect(answer("attendance", at(62)).answer).toContain("below the 75%");
  });

  it("calls 90%+ excellent", () => {
    expect(answer("attendance", at(94)).answer).toContain("excellent");
  });

  it("reports absence of data rather than 0%", () => {
    expect(answer("attendance", at(null)).answer).toContain("No attendance");
  });
});

describe("answer — determinism", () => {
  it("returns an identical answer for the same input", () => {
    const ctx = {
      studentName: "Aarav",
      attendancePercent: 70,
      insights: insightsWith([exam({ percent: 55, date: "2026-01-01" })]),
    };
    expect(answer("summary", ctx)).toEqual(answer("summary", ctx));
    expect(answer("plan", ctx)).toEqual(answer("plan", ctx));
  });
});

describe("periodSummary", () => {
  it("reports no new results when the window is empty", () => {
    const s = periodSummary(
      {
        studentName: "Aarav",
        attendancePercent: 80,
        insights: insightsWith([exam({ percent: 70, date: "2020-01-01" })]),
      },
      "week",
    );
    expect(s.answer).toContain("no new results");
  });

  it("averages only the results inside the window", () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const s = periodSummary(
      {
        studentName: "Aarav",
        attendancePercent: 80,
        insights: insightsWith([
          exam({ percent: 90, date: recent }),
          exam({ percent: 10, date: "2020-01-01" }),
        ]),
      },
      "week",
    );
    expect(s.answer).toContain("averaging 90%");
  });
});
