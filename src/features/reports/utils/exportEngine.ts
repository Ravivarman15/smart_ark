// ─────────────────────────────────────────────────────────────────────────────
// Reusable export engine for all report pages.
//
// CSV / Excel — uses the standard CSV format that Excel opens natively.
// We deliberately do NOT pull in `xlsx` (would add ~700 kB to bundle); the
// .xlsx surface is reserved for a future server-side export job.
//
// PDF — uses the browser's print dialog with a tiny inline stylesheet so
// the rendered report becomes a print-ready PDF. Charts, tables and KPI
// cards print as-is because they're already DOM. The same engine also
// powers the "Print" button.
//
// Caller passes a fully-formed ExportRequest — no analytics logic happens
// here. The page is responsible for selecting + formatting rows.
// ─────────────────────────────────────────────────────────────────────────────

import type { ExportRequest } from "../types/reports.types";

const csvEscape = (v: string | number): string => {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const triggerDownload = (
  content: BlobPart,
  fileName: string,
  mime: string,
): void => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const datedFileName = (reportKey: string, ext: string): string => {
  const d = new Date().toISOString().slice(0, 10);
  return `${reportKey}_${d}.${ext}`;
};

// ── CSV ─────────────────────────────────────────────────────────────────────
export const exportCsv = <T>(req: ExportRequest<T>): void => {
  const lines: string[] = [];
  lines.push(req.columns.map((c) => csvEscape(c.header)).join(","));
  for (const row of req.rows) {
    lines.push(req.columns.map((c) => csvEscape(c.value(row))).join(","));
  }
  triggerDownload(
    "﻿" + lines.join("\n"),
    datedFileName(req.reportKey, "csv"),
    "text/csv;charset=utf-8",
  );
};

// ── Excel (HTML-table flavoured, .xls — Excel opens it cleanly) ─────────────
export const exportExcel = <T>(req: ExportRequest<T>): void => {
  const head = req.columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = req.rows
    .map(
      (r) =>
        `<tr>${req.columns
          .map((c) => `<td>${escapeHtml(String(c.value(r)))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="utf-8"><title>${escapeHtml(req.title)}</title></head>` +
    `<body><h3>${escapeHtml(req.title)}</h3>` +
    (req.subtitle ? `<p>${escapeHtml(req.subtitle)}</p>` : "") +
    `<table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `</body></html>`;
  triggerDownload(html, datedFileName(req.reportKey, "xls"), "application/vnd.ms-excel");
};

// ── Print / PDF ─────────────────────────────────────────────────────────────
// Opens the browser print dialog with a stylesheet tuned for reports.
// The user picks "Save as PDF" to get a PDF.
export const exportPdf = <T>(req: ExportRequest<T>): void => {
  const w = window.open("", "_blank", "noopener=yes,noreferrer=yes");
  if (!w) return;
  const head = req.columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = req.rows
    .map(
      (r) =>
        `<tr>${req.columns
          .map((c) => {
            const align = c.align === "right" ? "right" : c.align === "center" ? "center" : "left";
            return `<td style="text-align:${align}">${escapeHtml(String(c.value(r)))}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  const kpis = (req.kpis ?? [])
    .map(
      (k) =>
        `<div class="kpi"><span class="kpi-label">${escapeHtml(k.label)}</span>` +
        `<span class="kpi-value">${escapeHtml(String(k.value))}</span></div>`,
    )
    .join("");
  w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(req.title)}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:24px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#64748b;font-size:12px;margin:0 0 16px}
  .kpis{display:flex;gap:12px;margin:0 0 16px;flex-wrap:wrap}
  .kpi{flex:1;min-width:140px;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;background:#f8fafc}
  .kpi-label{display:block;font-size:11px;text-transform:uppercase;color:#64748b}
  .kpi-value{display:block;font-size:18px;font-weight:600;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#f1f5f9;text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;font-weight:600}
  td{padding:6px 8px;border-bottom:1px solid #e2e8f0}
  tr:nth-child(even){background:#fafafa}
  @media print {.no-print{display:none}}
</style></head>
<body>
  <h1>${escapeHtml(req.title)}</h1>
  ${req.subtitle ? `<p class="sub">${escapeHtml(req.subtitle)}</p>` : ""}
  ${kpis ? `<div class="kpis">${kpis}</div>` : ""}
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),200)});</script>
</body></html>`);
  w.document.close();
};

// ── In-page print (the page is the report) ──────────────────────────────────
export const printCurrentPage = (): void => {
  window.print();
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
