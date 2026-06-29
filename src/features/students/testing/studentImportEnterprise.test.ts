import { describe, it, expect } from "vitest";
import {
  buildDuplicateIndex,
  buildFamilyDashboard,
  buildImportPreview,
  rowsToImportRecords,
} from "../utils/importMapping";
import { groupFamilies, type IdentityFields } from "../utils/duplicateEngine";
import type { Student } from "../types/student.types";

const LOOKUPS = { standards: [], batches: [], courseTypes: [], years: [] };
const preview = (csv: string[][], existing: Student[] = []) =>
  buildImportPreview(rowsToImportRecords(csv), LOOKUPS, buildDuplicateIndex(existing));
const id = (o: Partial<IdentityFields>): IdentityFields => o;

describe("Phase 2 — enhanced family grouping", () => {
  it("groups siblings linked transitively by mobile / email", () => {
    const fams = groupFamilies([
      id({ name: "A", parentMobile: "9876543210" }),
      id({ name: "B", parentMobile: "9876543210", parentEmail: "ramesh@x.com" }),
      id({ name: "C", parentEmail: "ramesh@x.com" }), // links via email to B → same family
    ]);
    expect(fams.families).toHaveLength(1);
    expect(fams.families[0].memberRows).toEqual([0, 1, 2]);
  });

  it("reports single / multi / largest family stats", () => {
    const rows = preview([
      ["name", "parent_mobile", "class"],
      ["A", "9111111111", "5"],
      ["B", "9111111111", "6"],
      ["C", "9111111111", "7"],
      ["Solo", "9222222222", "8"],
    ]);
    const dash = buildFamilyDashboard(rows);
    expect(dash.familiesCreated).toBe(2);
    expect(dash.multiChildFamilies).toBe(1);
    expect(dash.singleChildFamilies).toBe(1);
    expect(dash.largestFamily).toBe(3);
  });
});

describe("Phase 2 — import validation warnings", () => {
  it("flags missing class / admission / mobile, invalid dob & email — without rejecting", () => {
    const rows = preview([
      ["name", "date_of_birth", "parent_email"],
      ["Lonely Kid", "31/31/2014", "not-an-email"],
    ]);
    const r = rows[0];
    expect(r.status).not.toBe("error"); // name present → still importable
    expect(r.validation).toContain("Missing class");
    expect(r.validation).toContain("Missing admission number");
    expect(r.validation).toContain("Missing/invalid parent mobile");
    expect(r.validation).toContain("Invalid date of birth");
    expect(r.validation).toContain("Invalid email");
  });

  it("flags a duplicate admission number within the file", () => {
    const rows = preview([
      ["name", "admission_no", "parent_mobile"],
      ["First", "ADM-1", "9111111111"],
      ["Second", "ADM-1", "9222222222"],
    ]);
    expect(rows[1].validation).toContain("Duplicate admission number");
  });
});

// ── The four required final-validation scenarios ──────────────────────────────
describe("Phase 2 — final validation scenarios", () => {
  it("1) three siblings (same parent mobile + address, different classes) all import", () => {
    const rows = preview([
      ["name", "parent_mobile", "address", "class", "admission_no"],
      ["Arjun", "9876543210", "12 Main St", "5", "ADM-1"],
      ["Akhil", "9876543210", "12 Main St", "7", "ADM-2"],
      ["Ananya", "9876543210", "12 Main St", "10", "ADM-3"],
    ]);
    expect(rows.every((r) => r.status === "valid")).toBe(true);
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
  });

  it("2) twins (same DOB, different admission number) both import", () => {
    const rows = preview([
      ["name", "date_of_birth", "admission_no", "parent_mobile"],
      ["Aarav", "2015-06-06", "T-1", "9333333333"],
      ["Vivaan", "2015-06-06", "T-2", "9333333333"],
    ]);
    expect(rows.every((r) => r.status === "valid")).toBe(true);
  });

  it("3) a duplicate admission number against an existing student is detected", () => {
    const existing = [{ id: "stu-1", name: "Old", enrolmentNo: "ADM-9", batch: "5" } as Student];
    const rows = preview(
      [
        ["name", "admission_no", "parent_mobile"],
        ["New Import", "ADM-9", "9444444444"],
      ],
      existing
    );
    expect(rows[0].status).toBe("duplicate");
    expect(rows[0].confidence).toBe(100);
    expect(rows[0].existingId).toBe("stu-1");
  });

  it("4) different parents, same student name, both import", () => {
    const rows = preview([
      ["name", "admission_no", "parent_mobile", "date_of_birth"],
      ["Rahul Sharma", "AD-100", "9111111111", "2011-05-05"],
      ["Rahul Sharma", "AD-200", "9999999999", "2012-08-08"],
    ]);
    expect(rows.every((r) => r.status === "valid")).toBe(true);
  });
});
