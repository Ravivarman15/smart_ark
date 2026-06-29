import { describe, it, expect } from "vitest";
import {
  cleanDate,
  cleanEmail,
  cleanFieldValue,
  cleanName,
  cleanPhone,
  cleanText,
} from "../utils/dataCleaning";
import { rowsToImportRecords, detectColumnMappings } from "../utils/importMapping";

describe("dataCleaning", () => {
  it("cleans phone numbers to digits (keeps country code)", () => {
    expect(cleanPhone("+91 98765-43210")).toBe("919876543210");
    expect(cleanPhone("098765 43210")).toBe("09876543210");
    expect(cleanPhone("(044) 1234")).toBe("0441234");
    expect(cleanPhone("n/a")).toBe("");
  });

  it("title-cases names and collapses whitespace", () => {
    expect(cleanName("john  DOE")).toBe("John Doe");
    expect(cleanName("  RAVI   KUMAR ")).toBe("Ravi Kumar");
    expect(cleanName("o'brien")).toBe("O'Brien");
    expect(cleanName("jean-paul")).toBe("Jean-Paul");
  });

  it("collapses stray whitespace in free text", () => {
    expect(cleanText("12   Main    St ")).toBe("12 Main St");
  });

  it("lower-cases emails", () => {
    expect(cleanEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("normalises mixed date formats to YYYY-MM-DD", () => {
    expect(cleanDate("2014-1-5")).toBe("2014-01-05");
    expect(cleanDate("05/01/2014")).toBe("2014-01-05"); // day-first
    expect(cleanDate("13/01/2014")).toBe("2014-01-13"); // m/d auto-swap
    expect(cleanDate("not a date")).toBe("not a date");
  });

  it("routes each field through the right cleaner", () => {
    expect(cleanFieldValue("parentContact", "+91 98765 43210")).toBe("919876543210");
    expect(cleanFieldValue("name", "asha   KUMAR")).toBe("Asha Kumar");
    expect(cleanFieldValue("address", "12   Main  St")).toBe("12 Main St");
  });
});

describe("smart column detection — expanded aliases", () => {
  it("maps varied header names to the right fields", () => {
    const headers = ["Candidate Name", "Admission Number", "Guardian Mobile", "Reg No"];
    const mapped = detectColumnMappings(headers);
    const byHeader = Object.fromEntries(mapped.map((m) => [m.sourceHeader, m.field]));
    expect(byHeader["Candidate Name"]).toBe("name");
    expect(byHeader["Admission Number"]).toBe("enrolmentNo");
    expect(byHeader["Guardian Mobile"]).toBe("guardianContact");
    expect(byHeader["Reg No"]).toBe("enrolmentNo");
  });

  it("cleans values while parsing rows", () => {
    const recs = rowsToImportRecords([
      ["Candidate Name", "Parent Mobile", "Date Of Birth"],
      ["  ramesh   KUMAR ", "+91 98765-43210", "05/01/2014"],
    ]);
    expect(recs[0].student.name).toBe("Ramesh Kumar");
    expect(recs[0].student.parentContact).toBe("919876543210");
    expect(recs[0].student.dateOfBirth).toBe("2014-01-05");
  });
});
