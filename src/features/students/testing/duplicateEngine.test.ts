import { describe, it, expect } from "vitest";
import {
  classify,
  scoreMatch,
  findBestMatch,
  buildExistingIndex,
  groupFamilies,
  normMobile,
  DUPLICATE_THRESHOLD,
  type IdentityFields,
} from "../utils/duplicateEngine";
import {
  buildDuplicateIndex,
  buildImportPreview,
  buildFamilyDashboard,
  rowsToImportRecords,
} from "../utils/importMapping";
import type { Student } from "../types/student.types";

const EMPTY_LOOKUPS = { standards: [], batches: [], courseTypes: [], years: [] };

const id = (o: Partial<IdentityFields>): IdentityFields => o;

describe("duplicateEngine — pairwise scoring", () => {
  it("scores a matching admission/enrolment number as a certain duplicate (100)", () => {
    const r = scoreMatch(id({ admissionNo: "ENR001" }), id({ admissionNo: "enr001" }));
    expect(r.score).toBe(100);
    expect(classify(r.score)).toBe("duplicate");
  });

  it("scores a matching institutional student id as a certain duplicate (100)", () => {
    const r = scoreMatch(id({ studentId: "BIO-9" }), id({ studentId: "BIO-9" }));
    expect(r.score).toBe(100);
  });

  it("scores roll + same class as a strong duplicate (95)", () => {
    const a = id({ rollNumber: "12", className: "Class 5" });
    const b = id({ rollNumber: "12", className: "Class 5" });
    expect(scoreMatch(a, b).score).toBe(95);
  });

  it("NEVER treats a shared parent mobile alone as a duplicate (10)", () => {
    const a = id({ name: "Arjun", parentMobile: "9876543210" });
    const b = id({ name: "Akhil", parentMobile: "9876543210" });
    const r = scoreMatch(a, b);
    expect(r.score).toBe(10);
    expect(classify(r.score)).toBe("new");
  });

  it("NEVER treats a shared email alone as a duplicate (10)", () => {
    const a = id({ name: "Arjun", parentEmail: "ramesh@x.com" });
    const b = id({ name: "Akhil", parentEmail: "ramesh@x.com" });
    expect(scoreMatch(a, b).score).toBe(10);
  });

  it("scores name + DOB + parent mobile as high (90)", () => {
    const a = id({ name: "Sai", dob: "2010-01-01", parentMobile: "9000000000" });
    const b = id({ name: "Sai", dob: "2010-01-01", parentMobile: "9000000000" });
    expect(scoreMatch(a, b).score).toBe(90);
  });

  it("normalises mobiles with country codes / formatting before comparing", () => {
    expect(normMobile("+91 98765 43210")).toBe("9876543210");
    expect(normMobile("098765-43210")).toBe("9876543210");
  });
});

describe("duplicateEngine — identical names are NOT duplicates", () => {
  it("same name + same DOB but different admission + different mobile → new (veto)", () => {
    const a = id({
      name: "Rahul Sharma",
      dob: "2011-05-05",
      admissionNo: "A100",
      parentMobile: "9111111111",
    });
    const b = id({
      name: "Rahul Sharma",
      dob: "2011-05-05",
      admissionNo: "A200",
      parentMobile: "9222222222",
    });
    const r = scoreMatch(a, b);
    expect(classify(r.score)).toBe("new");
  });

  it("twins: same DOB, different names, different admission → new", () => {
    const a = id({ name: "Aarav", dob: "2015-06-06", admissionNo: "T1", parentMobile: "9333333333" });
    const b = id({ name: "Vivaan", dob: "2015-06-06", admissionNo: "T2", parentMobile: "9333333333" });
    expect(classify(scoreMatch(a, b).score)).toBe("new");
  });
});

describe("duplicateEngine — true duplicates are still detected", () => {
  it("same student re-imported (matching name + DOB + mobile, no conflicting id) → duplicate", () => {
    const a = id({ name: "Meena", dob: "2008-08-08", parentMobile: "9444444444" });
    const b = id({ name: "Meena", dob: "2008-08-08", parentMobile: "9444444444" });
    expect(scoreMatch(a, b).score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it("findBestMatch locates a duplicate against an existing index by admission no", () => {
    const index = buildExistingIndex([
      { id: "stu-1", identity: id({ name: "Existing", admissionNo: "ENR777" }) },
    ]);
    const r = findBestMatch(id({ name: "Reimport", admissionNo: "ENR777" }), index);
    expect(r.score).toBe(100);
    expect(r.existingId).toBe("stu-1");
  });
});

describe("groupFamilies", () => {
  it("groups siblings sharing a parent mobile into ONE family", () => {
    const fams = groupFamilies([
      id({ name: "Arjun", parentMobile: "9876543210" }),
      id({ name: "Akhil", parentMobile: "9876543210" }),
      id({ name: "Ananya", parentMobile: "9876543210" }),
    ]);
    expect(fams.families).toHaveLength(1);
    expect(fams.families[0].memberRows).toEqual([0, 1, 2]);
    expect(fams.familyByRow.get(2)).toBe("FAM-0001");
  });

  it("keeps unrelated students (different mobiles) in separate families", () => {
    const fams = groupFamilies([
      id({ name: "A", parentMobile: "9000000001" }),
      id({ name: "B", parentMobile: "9000000002" }),
    ]);
    expect(fams.families).toHaveLength(2);
  });
});

// ── End-to-end: the exact scenario from the spec ──────────────────────────────
const SIBLINGS_CSV = [
  ["name", "roll_number", "date_of_birth", "parent_name", "parent_contact", "address", "class", "enrolment_no"],
  ["Arjun", "5A1", "2014-01-01", "Ramesh", "9876543210", "12 Main St", "Class 5", "ENR001"],
  ["Akhil", "7B2", "2012-02-02", "Ramesh", "9876543210", "12 Main St", "Class 7", "ENR002"],
  ["Ananya", "10C3", "2009-03-03", "Ramesh", "9876543210", "12 Main St", "Class 10", "ENR003"],
];

describe("buildImportPreview — family-aware import", () => {
  it("imports all three siblings sharing one parent mobile (none flagged duplicate)", () => {
    const records = rowsToImportRecords(SIBLINGS_CSV);
    const preview = buildImportPreview(records, EMPTY_LOOKUPS, buildDuplicateIndex([]));
    expect(preview).toHaveLength(3);
    expect(preview.every((r) => r.status === "valid")).toBe(true);
    // All three belong to the same family.
    const fams = new Set(preview.map((r) => r.familyId));
    expect(fams.size).toBe(1);
  });

  it("the family dashboard reports one family of three sharing a mobile", () => {
    const records = rowsToImportRecords(SIBLINGS_CSV);
    const preview = buildImportPreview(records, EMPTY_LOOKUPS, buildDuplicateIndex([]));
    const dash = buildFamilyDashboard(preview);
    expect(dash.familiesCreated).toBe(1);
    expect(dash.children).toBe(3);
    expect(dash.sharingMobile).toBe(3);
  });

  it("still flags a real duplicate of an existing student (same enrolment no)", () => {
    const existing = [
      { id: "stu-1", name: "Arjun", enrolmentNo: "ENR001", batch: "Class 5" } as Student,
    ];
    const records = rowsToImportRecords(SIBLINGS_CSV);
    const preview = buildImportPreview(records, EMPTY_LOOKUPS, buildDuplicateIndex(existing));
    const arjun = preview.find((r) => r.name === "Arjun")!;
    expect(arjun.status).toBe("duplicate");
    expect(arjun.confidence).toBe(100);
    expect(arjun.existingId).toBe("stu-1");
    // The other two siblings remain importable.
    expect(preview.filter((r) => r.status === "valid")).toHaveLength(2);
  });
});
