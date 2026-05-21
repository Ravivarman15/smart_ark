import { z, type ZodTypeAny } from "zod";
import type { StudentWriteInput } from "../types/student.types";
import { IMPORT_COLUMN_MAP } from "./constants";

// ── zod helper ───────────────────────────────────────────────────────────────
/** Runs a schema, flattening failures into a `field → message` map. */
export function validate<S extends ZodTypeAny>(
  schema: S,
  data: unknown
):
  | { ok: true; data: z.infer<S> }
  | { ok: false; errors: Record<string, string> } {
  const res = schema.safeParse(data);
  if (res.success) return { ok: true, data: res.data };
  const errors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

// ── formatting ───────────────────────────────────────────────────────────────
export const formatDate = (value?: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
};

export const formatDateTime = (value?: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

export const formatBytes = (bytes?: number): string => {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

/** Inclusive day count between two ISO dates. */
export const dayCount = (from: string, to: string): number => {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1);
};

// ── CSV parsing ──────────────────────────────────────────────────────────────
/**
 * Minimal RFC-4180-ish CSV parser — handles quoted fields, escaped quotes
 * and CRLF. Good enough for student import sheets exported from Excel/Sheets.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Map a parsed CSV (with header row) into partial student write inputs. */
export function csvToStudentRows(rows: string[][]): StudentWriteInput[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const out: Record<string, string> = {};
    header.forEach((h, idx) => {
      const field = IMPORT_COLUMN_MAP[h];
      if (field) out[field] = (cells[idx] ?? "").trim();
    });
    return out as unknown as StudentWriteInput;
  });
}
