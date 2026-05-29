// Spreadsheet ingestion for the smart student importer.
//
// Returns a uniform `string[][]` (header row + data rows) regardless of source
// format so the rest of the pipeline (rowsToImportRecords / buildImportPreview)
// is format-agnostic:
//   • .csv          → reuse the existing RFC-4180-ish parseCsv (no extra weight)
//   • .xlsx / .xls  → SheetJS, LAZY-imported so the ~xlsx bundle is only fetched
//                     when someone actually opens an Excel file (keeps the main
//                     app bundle lean).
//
// Worksheet auto-detection: the first sheet that actually contains data wins
// (institution exports sometimes lead with a blank "Instructions" tab).

import { parseCsv } from "./helpers";

const ext = (name: string): string => name.slice(name.lastIndexOf(".")).toLowerCase();

/** True for files we route through SheetJS rather than the CSV parser. */
export const isExcelFile = (file: File): boolean =>
  [".xlsx", ".xls", ".xlsm", ".xlsb"].includes(ext(file.name));

/** Trim fully-empty trailing rows/cells a sheet often carries. */
const trimMatrix = (rows: unknown[][]): string[][] =>
  rows
    .map((r) => r.map((c) => (c == null ? "" : String(c).trim())))
    .filter((r) => r.some((c) => c !== ""));

/**
 * Parse any supported student-import file into a `string[][]`. Dates in Excel
 * cells are emitted as `YYYY-MM-DD` strings (via `cellDates` + `dateNF`).
 */
export async function parseSpreadsheet(file: File): Promise<string[][]> {
  if (!isExcelFile(file)) {
    // CSV / TSV / plain text → existing parser.
    return parseCsv(await file.text());
  }

  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  // Pick the first worksheet that yields at least one non-empty row.
  let best: string[][] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
      dateNF: "yyyy-mm-dd",
    });
    const matrix = trimMatrix(raw as unknown[][]);
    if (matrix.length > best.length) best = matrix;
    // A sheet with a header + data is enough — stop at the first substantial one.
    if (best.length > 1) break;
  }
  return best;
}
