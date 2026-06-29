import { describe, it, expect } from "vitest";
import { changedPatch, diffStudent, isPromotionCandidate } from "../utils/incrementalDiff";
import type { Student, StudentWriteInput } from "../types/student.types";

const base = (o: Partial<Student>): Student =>
  ({ id: "s1", name: "Arjun", batch: "5", spi: 0, risk: "safe", active: true, ...o }) as Student;
const incoming = (o: Partial<StudentWriteInput>): StudentWriteInput =>
  ({ name: "Arjun", ...o }) as StudentWriteInput;

describe("incrementalDiff", () => {
  it("detects only the fields that changed", () => {
    const ex = base({ parentContact: "9111111111", address: "Old St", category: "State Board" });
    const inc = incoming({ parentContact: "9222222222", address: "New Ave", category: "State Board" });
    const diffs = diffStudent(ex, inc);
    const fields = diffs.map((d) => d.field);
    expect(fields).toContain("parentContact");
    expect(fields).toContain("address");
    expect(fields).not.toContain("category"); // unchanged
    const phone = diffs.find((d) => d.field === "parentContact")!;
    expect(phone.prev).toBe("9111111111");
    expect(phone.next).toBe("9222222222");
  });

  it("never overwrites existing data with a blank incoming value", () => {
    const ex = base({ address: "12 Main St" });
    const inc = incoming({ address: "" });
    expect(diffStudent(ex, inc)).toHaveLength(0);
    expect(changedPatch(ex, inc)).toEqual({});
  });

  it("changedPatch contains only changed fields", () => {
    const ex = base({ parentContact: "9111111111", bloodGroup: "O+" });
    const inc = incoming({ parentContact: "9222222222", bloodGroup: "O+", category: "CBSE" });
    expect(changedPatch(ex, inc)).toEqual({ parentContact: "9222222222", category: "CBSE" });
  });

  it("ignores academic placement (promotion handled separately)", () => {
    const ex = base({ batchId: "old-batch", academicYearId: "yr-2024" });
    const inc = incoming({ batchId: "new-batch", academicYearId: "yr-2025" });
    expect(diffStudent(ex, inc)).toHaveLength(0); // not part of incremental update
    expect(isPromotionCandidate(ex, inc)).toBe(true); // but flagged for promotion
  });

  it("flags fee category / board change as an incremental update", () => {
    const ex = base({ category: "State Board" });
    const inc = incoming({ category: "CBSE" });
    expect(changedPatch(ex, inc)).toEqual({ category: "CBSE" });
  });
});
