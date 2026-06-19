// CSV helpers for the Bulk Import report downloads (failed rows / duplicates).
// No DOM access here beyond the download trigger so the builders stay testable.

import type { ImportRowError } from "../types/bulkImport.types";

const esc = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Build a CSV from row-error records, flattening the original raw columns. */
export function errorsToCsv(errors: ImportRowError[]): string {
  if (!errors.length) return "row_number,error_type,error_message\n";
  const rawKeys = Array.from(
    errors.reduce((set, e) => {
      Object.keys(e.raw ?? {}).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const header = ["row_number", "error_type", "error_message", ...rawKeys];
  const lines = [header.map(esc).join(",")];
  for (const e of errors) {
    lines.push(
      [e.rowNumber, e.errorType, e.errorMessage, ...rawKeys.map((k) => e.raw?.[k] ?? "")]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

/** Trigger a client-side download of CSV text. Browser-only. */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
