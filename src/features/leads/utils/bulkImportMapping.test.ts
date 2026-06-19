import { describe, it, expect } from "vitest";
import {
  normalizeHeader,
  detectColumnMapping,
  normalizeMobile,
  matchCourse,
} from "./bulkImportMapping";

describe("normalizeHeader", () => {
  it("lowercases, trims and collapses punctuation", () => {
    expect(normalizeHeader("  Student Name * ")).toBe("student name");
    expect(normalizeHeader("Mobile_No.")).toBe("mobile no");
    expect(normalizeHeader("WhatsApp #")).toBe("whatsapp");
  });
});

describe("detectColumnMapping", () => {
  it("maps the spec aliases to canonical fields", () => {
    const m = detectColumnMapping([
      "Student Name", "Parent", "Phone Number", "Class", "School", "Board",
      "Interested Course", "Lead Source",
    ]);
    expect(m.student_name).toBe("Student Name");
    expect(m.parent_name).toBe("Parent");
    expect(m.mobile).toBe("Phone Number");
    expect(m.class).toBe("Class");
    expect(m.school).toBe("School");
    expect(m.board).toBe("Board");
    expect(m.course).toBe("Interested Course");
    expect(m.source).toBe("Lead Source");
  });

  it("recognises WhatsApp / Contact Number as mobile", () => {
    expect(detectColumnMapping(["Name", "Whatsapp"]).mobile).toBe("Whatsapp");
    expect(detectColumnMapping(["Candidate", "Contact Number"]).mobile).toBe("Contact Number");
  });

  it("claims each source header at most once", () => {
    const m = detectColumnMapping(["Name", "Mobile", "Phone"]);
    expect(m.student_name).toBe("Name");
    // both Mobile + Phone alias to mobile; only one is claimed
    expect([m.mobile]).toContain("Mobile");
  });

  it("leaves unmatched fields undefined", () => {
    const m = detectColumnMapping(["Random", "Xyz"]);
    expect(m.mobile).toBeUndefined();
    expect(m.student_name).toBeUndefined();
  });
});

describe("normalizeMobile", () => {
  it("accepts a plain 10-digit number", () => {
    expect(normalizeMobile("7358199217")).toBe("7358199217");
  });
  it("strips spaces, dashes and +91", () => {
    expect(normalizeMobile("+91 73581 99217")).toBe("7358199217");
    expect(normalizeMobile("91-7358199217")).toBe("7358199217");
    expect(normalizeMobile("073581 99217")).toBe("7358199217");
  });
  it("rejects too-short / too-long / non-mobile prefixes", () => {
    expect(normalizeMobile("12345")).toBeNull();
    expect(normalizeMobile("1234567890")).toBeNull(); // starts with 1
    expect(normalizeMobile("")).toBeNull();
    expect(normalizeMobile(null)).toBeNull();
    expect(normalizeMobile("abcd")).toBeNull();
  });
});

describe("matchCourse", () => {
  const courses = ["NEET", "JEE", "Foundation", "Tuition"];
  it("matches a substring keyword to the canonical course", () => {
    expect(matchCourse("NEET Crash Course", courses)).toBe("NEET");
    expect(matchCourse("jee advanced", courses)).toBe("JEE");
    expect(matchCourse("Foundation Program", courses)).toBe("Foundation");
  });
  it("returns the trimmed original when nothing matches", () => {
    expect(matchCourse("  Robotics  ", courses)).toBe("Robotics");
  });
  it("returns undefined for empty input", () => {
    expect(matchCourse("", courses)).toBeUndefined();
    expect(matchCourse(null, courses)).toBeUndefined();
  });
});
