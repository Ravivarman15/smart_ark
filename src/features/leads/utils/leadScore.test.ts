import { describe, it, expect } from "vitest";
import { calculateLeadScore, categoryFor } from "./leadScore";
import { canTransition, nextStage } from "./leadStatus";

describe("calculateLeadScore", () => {
  it("scores a cold, bare manual lead low", () => {
    const { score, category } = calculateLeadScore({ source: "manual" });
    expect(score).toBeLessThan(35);
    expect(category).toBe("cold");
  });

  it("scores a fast-responded NEET ad lead with a demo as priority", () => {
    const { score, category } = calculateLeadScore({
      source: "meta_ads",
      course: "NEET Repeater",
      standard: "12",
      hasParentContact: true,
      hasPhone: true,
      hasEmail: true,
      responseMinutes: 10,
      demoAttended: true,
      interactions: 4,
    });
    expect(score).toBeGreaterThanOrEqual(80);
    expect(category).toBe("priority");
  });

  it("never exceeds 100 or drops below 0", () => {
    const max = calculateLeadScore({
      source: "meta_ads",
      course: "JEE",
      standard: "11",
      hasParentContact: true,
      hasPhone: true,
      hasEmail: true,
      responseMinutes: 1,
      demoAttended: true,
      interactions: 100,
    });
    expect(max.score).toBeLessThanOrEqual(100);
    expect(max.score).toBeGreaterThanOrEqual(0);
  });

  it("maps category boundaries", () => {
    expect(categoryFor(0)).toBe("cold");
    expect(categoryFor(35)).toBe("warm");
    expect(categoryFor(60)).toBe("hot");
    expect(categoryFor(80)).toBe("priority");
  });
});

describe("pipeline transitions", () => {
  it("allows forward, one-back, and skip-one moves", () => {
    expect(canTransition("new", "contacted")).toBe(true);
    expect(canTransition("contacted", "new")).toBe(true);
    expect(canTransition("new", "followup")).toBe(true); // skip one
  });

  it("rejects same-stage and large forward leaps", () => {
    expect(canTransition("new", "new")).toBe(false);
    expect(canTransition("new", "admission")).toBe(false);
  });

  it("allows jump-to-closed from anywhere", () => {
    expect(canTransition("new", "closed")).toBe(true);
    expect(canTransition("demo_attended", "closed")).toBe(true);
  });

  it("nextStage walks the pipeline and stops at the end", () => {
    expect(nextStage("new")).toBe("contacted");
    expect(nextStage("closed")).toBeNull();
  });
});
