// ─────────────────────────────────────────────────────────────────────────────
// Reusable filter engine for the reports module.
//
// Pages declare which filter fields they accept (`enabled` array). The
// filter bar reads this to render only the relevant inputs. The same engine
// also serialises filters to a URL query string and a human-readable
// subtitle (used in PDF/Excel exports).
// ─────────────────────────────────────────────────────────────────────────────

import { formatDate } from "./reportCalc";
import type { ReportFilterValues } from "../types/reports.types";

export type FilterField =
  | "dateRange"
  | "branch"
  | "batch"
  | "standard"
  | "courseType"
  | "academicYear"
  | "staff"
  | "category"
  | "status"
  | "paymentMethod"
  | "vendor"
  | "student"
  | "search";

export const DEFAULT_FIELDS: FilterField[] = ["dateRange", "branch", "search"];

export const isEmpty = (v: ReportFilterValues): boolean =>
  Object.entries(v).every(
    ([k, val]) =>
      val === undefined ||
      val === "" ||
      (typeof val === "object" && Object.keys(val ?? {}).length === 0),
  );

export const toSearchParams = (v: ReportFilterValues): URLSearchParams => {
  const sp = new URLSearchParams();
  for (const [k, val] of Object.entries(v)) {
    if (val === undefined || val === "") continue;
    if (k === "extra" && typeof val === "object") {
      for (const [ek, ev] of Object.entries(val ?? {})) {
        if (ev === undefined) continue;
        sp.set(`x_${ek}`, String(ev));
      }
      continue;
    }
    sp.set(k, String(val));
  }
  return sp;
};

export const fromSearchParams = (sp: URLSearchParams): ReportFilterValues => {
  const v: ReportFilterValues = {};
  const extra: Record<string, string> = {};
  for (const [k, val] of sp.entries()) {
    if (k.startsWith("x_")) {
      extra[k.slice(2)] = val;
      continue;
    }
    (v as Record<string, string>)[k] = val;
  }
  if (Object.keys(extra).length > 0) v.extra = extra;
  return v;
};

// Human-readable subtitle for PDF/Excel headers.
export const summarise = (
  v: ReportFilterValues,
  options: { branchName?: string; batchName?: string } = {},
): string => {
  const parts: string[] = [];
  if (v.from || v.to) {
    parts.push(`Period: ${formatDate(v.from)} → ${formatDate(v.to)}`);
  }
  if (options.branchName) parts.push(`Branch: ${options.branchName}`);
  if (options.batchName) parts.push(`Batch: ${options.batchName}`);
  if (v.status) parts.push(`Status: ${v.status}`);
  if (v.paymentMethod) parts.push(`Payment: ${v.paymentMethod}`);
  if (v.search) parts.push(`Search: "${v.search}"`);
  return parts.join("  •  ");
};
