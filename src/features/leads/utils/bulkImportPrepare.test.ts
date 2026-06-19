import { describe, it, expect } from "vitest";
import { prepareRows, buildAssigner } from "./bulkImportPrepare";
import type { ColumnMapping } from "../types/bulkImport.types";
import type { CounselorCourseMapping } from "../types/lead.types";

const mapping: ColumnMapping = {
  student_name: "Name",
  mobile: "Phone",
  course: "Course",
  class: "Class",
};

describe("prepareRows", () => {
  it("validates, normalises and maps a good row", () => {
    const r = prepareRows(
      [{ Name: "Asha", Phone: "+91 73581 99217", Course: "NEET Crash Course", Class: "11" }],
      mapping,
      ["NEET", "JEE"],
      new Set(),
    );
    expect(r.prepared).toHaveLength(1);
    expect(r.prepared[0]).toMatchObject({
      studentName: "Asha", mobile: "7358199217", course: "NEET", standard: "11", rowNumber: 2,
    });
    expect(r.errors).toHaveLength(0);
    expect(r.duplicates).toHaveLength(0);
  });

  it("flags missing name / missing mobile / invalid mobile", () => {
    const r = prepareRows(
      [
        { Name: "", Phone: "7358199217" },
        { Name: "Bob", Phone: "" },
        { Name: "Cara", Phone: "123" },
      ],
      mapping,
      [],
      new Set(),
    );
    expect(r.errors.map((e) => e.errorType)).toEqual([
      "MISSING_NAME", "MISSING_MOBILE", "INVALID_MOBILE",
    ]);
    expect(r.prepared).toHaveLength(0);
  });

  it("skips duplicates against existing leads and within the file", () => {
    const r = prepareRows(
      [
        { Name: "A", Phone: "7358199217" }, // exists
        { Name: "B", Phone: "9000000001" }, // first occurrence → ok
        { Name: "C", Phone: "9000000001" }, // dup in file
      ],
      mapping,
      [],
      new Set(["7358199217"]),
    );
    expect(r.prepared.map((p) => p.mobile)).toEqual(["9000000001"]);
    expect(r.duplicates.map((d) => d.errorType)).toEqual([
      "DUPLICATE_MOBILE", "DUPLICATE_IN_FILE",
    ]);
  });
});

describe("buildAssigner", () => {
  const mappings: CounselorCourseMapping[] = [
    { id: "1", counselorId: "cA", course: "NEET", priority: 1, isActive: true },
    { id: "2", counselorId: "cB", course: "NEET", priority: 1, isActive: true },
    { id: "3", counselorId: "cC", course: "JEE", priority: 1, isActive: true },
  ];

  it("assigns the least-active counselor and round-robins on ties", () => {
    const a = buildAssigner(mappings, new Map([["cA", 0], ["cB", 0]]));
    const first = a.assign("NEET");
    const second = a.assign("NEET");
    expect(new Set([first, second])).toEqual(new Set(["cA", "cB"]));
    expect(first).not.toBe(second); // balanced
  });

  it("respects course-specific routing", () => {
    const a = buildAssigner(mappings, new Map());
    expect(a.assign("JEE")).toBe("cC");
  });

  it("returns null when no mapping matches the course", () => {
    const a = buildAssigner(mappings, new Map());
    expect(a.assign("Robotics")).toBeNull();
  });

  it("returns null when there are no mappings at all", () => {
    expect(buildAssigner([], new Map()).assign("NEET")).toBeNull();
  });
});
