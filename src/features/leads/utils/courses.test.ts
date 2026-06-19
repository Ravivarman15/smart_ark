import { describe, it, expect } from "vitest";
import { normalizeCourseName, dedupeCourses } from "./courses";

describe("normalizeCourseName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeCourseName("  NEET  ")).toBe("NEET");
    expect(normalizeCourseName("JEE   Advanced")).toBe("JEE Advanced");
    expect(normalizeCourseName(undefined)).toBe("");
    expect(normalizeCourseName("   ")).toBe("");
  });
});

describe("dedupeCourses", () => {
  it("removes case-insensitive duplicates, keeps first-seen casing + order", () => {
    expect(dedupeCourses(["NEET", "neet", "JEE", "  jee ", "Foundation", ""]))
      .toEqual(["NEET", "JEE", "Foundation"]);
  });
  it("drops blanks/whitespace", () => {
    expect(dedupeCourses([" ", null, undefined, "Tuition"])).toEqual(["Tuition"]);
  });
});
