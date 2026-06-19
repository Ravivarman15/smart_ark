// Web Worker: parses an uploaded CSV / XLS / XLSX into header→value rows off the
// main thread so a 20k-row file never freezes the UI. Uses SheetJS (already a
// project dependency). Driven by useBulkImport via a typed message protocol.

import * as XLSX from "xlsx";
import { MAX_IMPORT_ROWS } from "../types/bulkImport.types";

interface InboundMessage {
  buffer: ArrayBuffer;
}

type OutboundMessage =
  | {
      ok: true;
      headers: string[];
      rows: Record<string, string>[];
      totalRows: number;
      truncated: boolean;
    }
  | { ok: false; error: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<InboundMessage>) => void) | null;
  postMessage: (message: OutboundMessage) => void;
};

const post = (message: OutboundMessage) => ctx.postMessage(message);

ctx.onmessage = (e: MessageEvent<InboundMessage>) => {
  try {
    const wb = XLSX.read(e.data.buffer, { type: "array" });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) {
      post({ ok: true, headers: [], rows: [], totalRows: 0, truncated: false });
      return;
    }
    // Array-of-arrays so we control header detection + blank handling.
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[firstSheet], {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    });

    if (aoa.length === 0) {
      post({ ok: true, headers: [], rows: [], totalRows: 0, truncated: false });
      return;
    }

    const headerRow = aoa[0] as unknown[];
    const headers = headerRow.map((h, i) => {
      const t = String(h ?? "").trim();
      return t.length ? t : `column_${i + 1}`;
    });

    const dataRows = aoa.slice(1);
    const totalRows = dataRows.length;
    const truncated = totalRows > MAX_IMPORT_ROWS;
    const capped = truncated ? dataRows.slice(0, MAX_IMPORT_ROWS) : dataRows;

    const rows: Record<string, string>[] = capped.map((arr) => {
      const cells = arr as unknown[];
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = String(cells[i] ?? "").trim();
      });
      return obj;
    });

    post({ ok: true, headers, rows, totalRows, truncated });
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
