import { describe, it, expect } from "vitest";
import {
  computeHealthScores,
  buildAiSummary,
  type HealthInput,
} from "../utils/student360";
import { barChartSvg, donutChartSvg, lineChartSvg } from "../utils/report360Charts";

const base = (o: Partial<HealthInput> = {}): HealthInput => ({
  overallPercent: 80,
  attendancePercent: 90,
  fee: { total: 50000, discount: 0, received: 50000, pending: 0 },
  commTotal: 10,
  commDelivered: 9,
  strongSubjects: [],
  weakSubjects: [],
  ...o,
});

describe("student360 — health scores", () => {
  it("a strong student is green", () => {
    const h = computeHealthScores(base());
    expect(h.risk).toBe("green");
    expect(h.overall).toBeGreaterThanOrEqual(75);
    expect(h.fee).toBe(100);
  });

  it("low attendance + low marks is red", () => {
    const h = computeHealthScores(
      base({ overallPercent: 25, attendancePercent: 35, fee: { total: 50000, discount: 0, received: 0, pending: 50000 } })
    );
    expect(h.risk).toBe("red");
    expect(h.fee).toBe(0);
  });

  it("fee score reflects the net payable after discount", () => {
    const h = computeHealthScores(
      base({ fee: { total: 50000, discount: 10000, received: 20000, pending: 20000 } })
    );
    // net = 40000, received 20000 → 50%
    expect(h.fee).toBe(50);
  });

  it("no fee record counts as clear (100)", () => {
    expect(computeHealthScores(base({ fee: undefined })).fee).toBe(100);
  });
});

describe("student360 — AI summary", () => {
  it("flags weak subjects, low attendance and pending fee", () => {
    const ai = buildAiSummary(
      base({
        overallPercent: 48,
        attendancePercent: 60,
        fee: { total: 50000, discount: 0, received: 38000, pending: 12000 },
        weakSubjects: ["Mathematics"],
      })
    );
    expect(ai.attendance).toContain("75%");
    expect(ai.fee).toContain("12,000");
    expect(ai.bullets.some((b) => /Mathematics/.test(b))).toBe(true);
    expect(ai.recommendation.length).toBeGreaterThan(0);
  });

  it("excellent student gets a positive summary", () => {
    const ai = buildAiSummary(base({ overallPercent: 92 }));
    expect(ai.performance.toLowerCase()).toContain("excellent");
    expect(ai.bullets).toContain("Excellent Student");
  });
});

describe("student360 — chart SVG", () => {
  it("renders valid svg or a graceful empty state", () => {
    expect(lineChartSvg([{ label: "01", value: 80 }])).toContain("<svg");
    expect(lineChartSvg([])).toContain("No exam data");
    expect(barChartSvg([{ label: "Math", value: 70 }])).toContain("<svg");
    expect(
      donutChartSvg([
        { label: "Present", value: 18, color: "#16a34a" },
        { label: "Absent", value: 2, color: "#dc2626" },
      ])
    ).toContain("<svg");
    expect(donutChartSvg([])).toContain("No attendance data");
  });
});
