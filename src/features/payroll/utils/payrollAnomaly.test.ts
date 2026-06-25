import { describe, it, expect } from "vitest";
import { detectAnomalies, findDuplicateStaffIds, type AnomalyInput } from "./payrollAnomaly";

const base: AnomalyInput = {
  netSalary: 25000,
  previousNet: 25000,
  basicSalary: 20000,
  bonus: 0,
  presentDays: 22,
  workedMinutes: 60 * 176,
};

const types = (i: AnomalyInput) => detectAnomalies(i).map((f) => f.type);

describe("detectAnomalies", () => {
  it("flags a >20% increase vs last month", () => {
    expect(types({ ...base, netSalary: 32000 })).toContain("increase_gt_20");
  });

  it("flags a >20% decrease vs last month", () => {
    expect(types({ ...base, netSalary: 15000 })).toContain("decrease_gt_20");
  });

  it("does not flag a swing within 20%", () => {
    const t = types({ ...base, netSalary: 28000 }); // +12%
    expect(t).not.toContain("increase_gt_20");
    expect(t).not.toContain("decrease_gt_20");
  });

  it("does not compare when there is no previous salary", () => {
    expect(types({ ...base, previousNet: 0, netSalary: 999999 })).not.toContain("increase_gt_20");
  });

  it("flags a negative net as critical", () => {
    const flags = detectAnomalies({ ...base, netSalary: -100 });
    const neg = flags.find((f) => f.type === "negative_salary");
    expect(neg?.severity).toBe("critical");
  });

  it("flags a bonus larger than the basic salary", () => {
    expect(types({ ...base, bonus: 25000 })).toContain("bonus_gt_salary");
  });

  it("flags missing attendance only when both present-days and worked are zero", () => {
    expect(types({ ...base, presentDays: 0, workedMinutes: 0 })).toContain("missing_attendance");
    expect(types({ ...base, presentDays: 0, workedMinutes: 60 })).not.toContain("missing_attendance");
  });

  it("flags missing identity ONLY when presence is explicitly false", () => {
    expect(types({ ...base, identity: { hasBank: false } })).toContain("missing_bank");
    // unknown presence (undefined) is never flagged — forward compatible
    expect(types({ ...base, identity: {} })).not.toContain("missing_bank");
    expect(types({ ...base })).not.toContain("missing_pan");
  });
});

describe("findDuplicateStaffIds", () => {
  it("returns ids sharing an email across distinct staff", () => {
    const dup = findDuplicateStaffIds([
      { staffId: "a", email: "x@ark.com" },
      { staffId: "b", email: "x@ark.com" },
      { staffId: "c", email: "y@ark.com" },
    ]);
    expect(dup.has("a")).toBe(true);
    expect(dup.has("b")).toBe(true);
    expect(dup.has("c")).toBe(false);
  });

  it("ignores blank keys and single occurrences", () => {
    const dup = findDuplicateStaffIds([
      { staffId: "a", email: "" },
      { staffId: "b", email: "  " },
      { staffId: "c", email: "z@ark.com" },
    ]);
    expect(dup.size).toBe(0);
  });
});
