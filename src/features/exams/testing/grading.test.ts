import { describe, it, expect } from "vitest";
import { median, computeStats, assignRanks } from "../utils/grading";
import type { Exam, ExamResult } from "../types/exam.types";

// Unit tests for the enterprise additions to the central grading layer:
// median + division bands (distinction / first / second / third class).

const exam = (over: Partial<Exam> = {}): Exam =>
  ({
    id: "e1",
    title: "Test",
    examType: "unit_test",
    mode: "manual",
    totalMarks: 100,
    passMarks: 35,
    durationMinutes: 60,
    gradingScheme: [],
    attachments: [],
    status: "completed",
    resultsStatus: "pending",
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as Exam;

const res = (studentId: string, marks: number | null, isAbsent = false): ExamResult => ({
  id: "",
  examId: "e1",
  studentId,
  studentName: studentId,
  marks,
  isAbsent,
});

describe("median", () => {
  it("returns 0 for an empty list", () => {
    expect(median([])).toBe(0);
  });
  it("returns the middle value for an odd count", () => {
    expect(median([10, 30, 20])).toBe(20);
  });
  it("averages the two middle values for an even count", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe("computeStats division bands", () => {
  const e = exam();
  const scored = assignRanks(e, [
    res("distinction", 90), // 90% → distinction
    res("first", 65), // 65% → first class
    res("second", 55), // 55% → second class
    res("third", 40), // 40% → third class (passed, < 50)
    res("failed", 20), // 20% → failed, no band
    res("absent", null, true), // absent
  ]);
  const stats = computeStats(scored);

  it("counts each division correctly", () => {
    expect(stats.distinction).toBe(1);
    expect(stats.firstClass).toBe(1);
    expect(stats.secondClass).toBe(1);
    expect(stats.thirdClass).toBe(1);
  });

  it("tracks appeared / absent / pass-fail", () => {
    expect(stats.appeared).toBe(5);
    expect(stats.absent).toBe(1);
    expect(stats.passed).toBe(4);
    expect(stats.failed).toBe(1);
  });

  it("computes the median over appeared marks only", () => {
    // appeared marks: 90, 65, 55, 40, 20 → median 55
    expect(stats.medianMarks).toBe(55);
  });
});
