import { describe, it, expect } from "vitest";
import { parseCsv } from "../utils/helpers";
import { skipTitleRows } from "../utils/sheetParser";

describe("Student CSV/Sheet Parser Tests", () => {
  describe("parseCsv delimiter auto-detection and parsing", () => {
    it("should parse standard comma-delimited CSV", () => {
      const csv = "name,roll_number,gender\nJohn Doe,101,Male\nJane Doe,102,Female";
      const parsed = parseCsv(csv);
      expect(parsed).toEqual([
        ["name", "roll_number", "gender"],
        ["John Doe", "101", "Male"],
        ["Jane Doe", "102", "Female"],
      ]);
    });

    it("should parse semicolon-delimited CSV (often used in European/Indian formats)", () => {
      const csv = "name;roll_number;gender\nJohn Doe;101;Male\nJane Doe;102;Female";
      const parsed = parseCsv(csv);
      expect(parsed).toEqual([
        ["name", "roll_number", "gender"],
        ["John Doe", "101", "Male"],
        ["Jane Doe", "102", "Female"],
      ]);
    });

    it("should parse tab-delimited CSV", () => {
      const csv = "name\troll_number\tgender\nJohn Doe\t101\tMale\nJane Doe\t102\tFemale";
      const parsed = parseCsv(csv);
      expect(parsed).toEqual([
        ["name", "roll_number", "gender"],
        ["John Doe", "101", "Male"],
        ["Jane Doe", "102", "Female"],
      ]);
    });

    it("should parse pipe-delimited CSV", () => {
      const csv = "name|roll_number|gender\nJohn Doe|101|Male\nJane Doe|102|Female";
      const parsed = parseCsv(csv);
      expect(parsed).toEqual([
        ["name", "roll_number", "gender"],
        ["John Doe", "101", "Male"],
        ["Jane Doe", "102", "Female"],
      ]);
    });

    it("should strip UTF-8 BOM if present", () => {
      const csv = "\uFEFFname,roll_number\nJohn,101";
      const parsed = parseCsv(csv);
      expect(parsed).toEqual([
        ["name", "roll_number"],
        ["John", "101"],
      ]);
    });

    it("should handle quoted fields with commas and quotes", () => {
      const csv = 'name,roll_number,address\n"Doe, John",101,"123 Main St, ""Suite A"""';
      const parsed = parseCsv(csv);
      expect(parsed).toEqual([
        ["name", "roll_number", "address"],
        ["Doe, John", "101", '123 Main St, "Suite A"'],
      ]);
    });
  });

  describe("skipTitleRows heuristic", () => {
    it("should keep rows intact if headers are already in the first row", () => {
      const matrix = [
        ["student name", "roll number", "gender"],
        ["Aswin", "1", "Male"],
      ];
      expect(skipTitleRows(matrix)).toEqual(matrix);
    });

    it("should skip title/institution rows to locate the real header", () => {
      const matrix = [
        ["Smart Ark Academy Higher Secondary School"],
        ["Academic Year: 2025-2026"],
        ["Student List for Standard X - Section A"],
        ["student name", "roll number", "gender"],
        ["Aswin", "1", "Male"],
      ];
      const expected = [
        ["student name", "roll number", "gender"],
        ["Aswin", "1", "Male"],
      ];
      expect(skipTitleRows(matrix)).toEqual(expected);
    });

    it("should fallback to returning full matrix if no matching header rows are found", () => {
      const matrix = [
        ["Some random header", "unrelated info"],
        ["random row 1", "random row 2"],
      ];
      expect(skipTitleRows(matrix)).toEqual(matrix);
    });
  });
});
