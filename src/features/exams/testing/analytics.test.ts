import { describe, it, expect } from "vitest";
import { stdDev, mean } from "../utils/grading";
import {
  schoolStats,
  groupComparison,
  studentAggregates,
  scholarshipCandidates,
  riskStudents,
  type ScoredRow,
} from "../utils/analytics";

// Unit tests for the analytics aggregation layer (Phase 5 / 11 / 13 / AI).

const row = (o: Partial<ScoredRow>): ScoredRow => ({
  examId: "e", examTitle: "T", examType: "unit_test",
  studentId: "s", studentName: "S",
  marks: 50, percentage: 50, grade: "C", passed: true, isAbsent: false,
  ...o,
});

describe("stdDev / mean", () => {
  it("mean of empty is 0", () => expect(mean([])).toBe(0));
  it("stdDev of [10,10,10] is 0", () => expect(stdDev([10, 10, 10])).toBe(0));
  it("stdDev of [0,100] is 50", () => expect(stdDev([0, 100])).toBe(50));
});

describe("schoolStats", () => {
  const rows = [
    row({ studentId: "a", percentage: 90, marks: 90, passed: true }),
    row({ studentId: "b", percentage: 50, marks: 50, passed: true }),
    row({ studentId: "c", percentage: 20, marks: 20, passed: false }),
    row({ studentId: "d", marks: null, isAbsent: true, percentage: 0, passed: false }),
  ];
  const s = schoolStats(rows);
  it("counts appeared vs absent", () => {
    expect(s.appeared).toBe(3);
    expect(s.absent).toBe(1);
  });
  it("computes pass and fail rates over appeared", () => {
    expect(s.passRate).toBe(66.67);
    expect(s.failRate).toBe(33.33);
  });
  it("computes high/low", () => {
    expect(s.highestPercentage).toBe(90);
    expect(s.lowestPercentage).toBe(20);
  });
});

describe("groupComparison", () => {
  const rows = [
    row({ subjectId: "m", subjectName: "Math", percentage: 80 }),
    row({ subjectId: "m", subjectName: "Math", percentage: 60 }),
    row({ subjectId: "s", subjectName: "Science", percentage: 40 }),
  ];
  const cmp = groupComparison(rows, (r) => r.subjectId, (r) => r.subjectName);
  it("groups and sorts by average desc", () => {
    expect(cmp[0].label).toBe("Math");
    expect(cmp[0].avgPercentage).toBe(70);
    expect(cmp[1].label).toBe("Science");
  });
});

describe("studentAggregates / scholarship / risk", () => {
  const rows = [
    row({ studentId: "top", studentName: "Top", percentage: 92, marks: 92, passed: true, examDate: "2026-04-01" }),
    row({ studentId: "top", studentName: "Top", percentage: 95, marks: 95, passed: true, examDate: "2026-05-01" }),
    row({ studentId: "low", studentName: "Low", percentage: 30, marks: 30, passed: false, examDate: "2026-04-01" }),
    row({ studentId: "low", studentName: "Low", percentage: 25, marks: 25, passed: false, examDate: "2026-05-01" }),
  ];
  const aggs = studentAggregates(rows);
  it("aggregates per student with trend", () => {
    const top = aggs.find((a) => a.studentId === "top")!;
    expect(top.averagePercentage).toBeCloseTo(93.5, 1);
    expect(top.trendDelta).toBe(3);
  });
  it("flags scholarship (>=85, no fails) and risk (red)", () => {
    expect(scholarshipCandidates(aggs).map((a) => a.studentId)).toContain("top");
    expect(riskStudents(aggs).map((a) => a.studentId)).toContain("low");
  });
});
