import { describe, it, expect } from "vitest";
import {
  buildDuplicateIndex,
  buildImportPreview,
  buildFamilyDashboard,
  rowsToImportRecords,
} from "../utils/importMapping";

const LOOKUPS = { standards: [], batches: [], courseTypes: [], years: [] };

// Build a synthetic institution export of `n` students: families of 3 siblings
// share a parent mobile + address; every student has a unique admission number.
const makeSheet = (n: number): string[][] => {
  const rows: string[][] = [
    ["name", "admission_no", "roll_number", "parent_mobile", "address", "class", "date_of_birth"],
  ];
  for (let i = 0; i < n; i += 1) {
    const fam = Math.floor(i / 3);
    rows.push([
      `Student ${i}`,
      `ADM-${i}`,
      `R${i}`,
      `9${String(8000000000 + fam).slice(-9)}`,
      `${fam} Family Road`,
      `Class ${(i % 12) + 1}`,
      "2012-05-05",
    ]);
  }
  return rows;
};

describe("Student import — performance (pure pipeline)", () => {
  // Larger sizes dominate runtime; keep a generous timeout.
  for (const n of [50, 500, 5000, 20000]) {
    it(`processes ${n} rows correctly and within budget`, () => {
      const t0 = Date.now();
      const records = rowsToImportRecords(makeSheet(n));
      const preview = buildImportPreview(records, LOOKUPS, buildDuplicateIndex([]));
      const dash = buildFamilyDashboard(preview);
      const ms = Date.now() - t0;
      const rowsPerSec = Math.round((n / Math.max(ms, 1)) * 1000);

      // Correctness at scale: unique admissions ⇒ all import; siblings grouped.
      expect(preview).toHaveLength(n);
      expect(preview.every((r) => r.status === "valid")).toBe(true);
      expect(dash.familiesCreated).toBe(Math.ceil(n / 3));

      // Performance budget — pure client work stays well under this bound.
      console.log(`[perf] ${n} rows in ${ms}ms (~${rowsPerSec} rows/sec)`);
      expect(ms).toBeLessThan(15000);
    }, 30000);
  }
});
