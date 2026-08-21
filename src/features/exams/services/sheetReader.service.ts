import { AppError } from "@/shared/services";

// ─────────────────────────────────────────────────────────────────────────────
// SHEET → ROWS
//
// The structured-import counterpart to `paperTextExtract.service.ts`. That one
// turns a file into TEXT for the question parser; this one turns a spreadsheet
// into a GRID for column mapping. Same files, two genuinely different jobs —
// flattening a spreadsheet to text throws away exactly the column structure the
// mapping screen needs.
//
// xlsx is lazy-imported so a teacher who only ever uploads CSV never downloads
// the parser. It is already a dependency; nothing new was added for this.
// ─────────────────────────────────────────────────────────────────────────────

export interface SheetGrid {
  /** First row, treated as the header. */
  headers: string[];
  /** Everything after it. Ragged rows are padded so index lookups are safe. */
  rows: string[][];
  /** Sheet names, when the file had more than one. */
  sheetNames?: string[];
  activeSheet?: string;
}

/** 10 MB. A question bank that large is a database export, not a paper. */
export const MAX_SHEET_BYTES = 10 * 1024 * 1024;

/** Parse CSV text into a grid. Handles quoted fields, commas and "" escapes. */
export const parseCsvGrid = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

/** Pad every row to the header width so `row[i]` is never a surprise. */
const rectangular = (grid: string[][]): SheetGrid => {
  const nonEmpty = grid.filter((r) => r.some((c) => (c ?? "").trim().length > 0));
  if (nonEmpty.length === 0) {
    throw AppError.validation(
      "That file has no rows in it. Check you exported the sheet with the questions on it.",
    );
  }
  const [headerRow, ...rest] = nonEmpty;
  const width = Math.max(headerRow.length, ...rest.map((r) => r.length), 1);
  const pad = (r: string[]) =>
    Array.from({ length: width }, (_, i) => (r[i] ?? "").toString());

  const headers = pad(headerRow).map((h, i) => h.trim() || `Column ${i + 1}`);
  return { headers, rows: rest.map(pad) };
};

/**
 * Read a spreadsheet into a grid.
 *
 * Only the FIRST sheet is read, and its name is returned so the UI can say so.
 * Silently concatenating every sheet is how a workbook with a "Notes" tab and an
 * "Instructions" tab turns into three hundred malformed questions.
 */
export const readSheet = async (file: File): Promise<SheetGrid> => {
  if (file.size > MAX_SHEET_BYTES) {
    throw AppError.validation(
      "That file is larger than 10 MB. Split it, or export just the sheet with the questions.",
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "csv" || ext === "txt") {
    return rectangular(parseCsvGrid(await file.text()));
  }

  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetNames = wb.SheetNames ?? [];
    if (sheetNames.length === 0) {
      throw AppError.validation("That workbook has no sheets in it.");
    }
    const active = sheetNames[0];
    const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[active], {
      header: 1,
      raw: false,
      defval: "",
    });
    return { ...rectangular(grid as string[][]), sheetNames, activeSheet: active };
  }

  // Named honestly rather than attempted. A PDF has no columns to map, and
  // pretending otherwise produces a grid of nonsense the user has to debug.
  throw AppError.validation(
    `A .${ext} file has no columns to map. Use "Upload document" for PDF and Word files, or export this as CSV or Excel.`,
  );
};
