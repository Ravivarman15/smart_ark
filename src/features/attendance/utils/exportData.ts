// ── Attendance Export Center engine ──────────────────────────────────────────
// Self-contained CSV / Excel / PDF export so the attendance module never has to
// reach into the reports feature's internals. Mirrors the proven reports engine:
//   CSV   → UTF-8 BOM text Excel opens natively
//   Excel → HTML-table flavoured .xls (Excel-compatible, no heavy xlsx dep here)
//   PDF   → print-ready window the user saves as PDF
// The page builds an ExportRequest (columns + rows + KPIs); no analytics logic
// happens here — rows are already filtered/selected by the caller.

import { renderReportWindow } from "@/lib/reportWindow";

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
  align?: "left" | "right" | "center";
}

export interface ExportKpi {
  label: string;
  value: string | number;
}

export interface ExportRequest<T> {
  /** Goes into the file name. */
  reportKey: string;
  /** PDF / Excel header. */
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  kpis?: ExportKpi[];
}

export type ExportFormat = "csv" | "excel" | "pdf";

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

const csvEscape = (v: string | number): string => {
  const s = String(v ?? "");
  return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const triggerDownload = (content: BlobPart, fileName: string, mime: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const datedName = (key: string, ext: string) => `${key}_${new Date().toISOString().slice(0, 10)}.${ext}`;

export const exportCsv = <T>(req: ExportRequest<T>): void => {
  const lines = [req.columns.map((c) => csvEscape(c.header)).join(",")];
  for (const row of req.rows) lines.push(req.columns.map((c) => csvEscape(c.value(row))).join(","));
  triggerDownload("﻿" + lines.join("\n"), datedName(req.reportKey, "csv"), "text/csv;charset=utf-8");
};

export const exportExcel = <T>(req: ExportRequest<T>): void => {
  const head = req.columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = req.rows
    .map((r) => `<tr>${req.columns.map((c) => `<td>${escapeHtml(String(c.value(r)))}</td>`).join("")}</tr>`)
    .join("");
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="utf-8"><title>${escapeHtml(req.title)}</title></head><body>` +
    `<h3>${escapeHtml(req.title)}</h3>${req.subtitle ? `<p>${escapeHtml(req.subtitle)}</p>` : ""}` +
    `<table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  triggerDownload(html, datedName(req.reportKey, "xls"), "application/vnd.ms-excel");
};

export const exportPdf = <T>(req: ExportRequest<T>, win?: Window | null): void => {
  const head = req.columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = req.rows
    .map(
      (r) =>
        `<tr>${req.columns
          .map((c) => `<td style="text-align:${c.align ?? "left"}">${escapeHtml(String(c.value(r)))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  const kpis = (req.kpis ?? [])
    .map((k) => `<div class="kpi"><span class="l">${escapeHtml(k.label)}</span><span class="v">${escapeHtml(String(k.value))}</span></div>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(req.title)}</title>
<style>
 body{font-family:ui-sans-serif,system-ui,Segoe UI,sans-serif;color:#0f172a;margin:24px}
 h1{font-size:18px;margin:0 0 4px}.sub{color:#64748b;font-size:12px;margin:0 0 16px}
 .kpis{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 16px}
 .kpi{flex:1;min-width:130px;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;background:#f8fafc}
 .kpi .l{display:block;font-size:11px;text-transform:uppercase;color:#64748b}
 .kpi .v{display:block;font-size:18px;font-weight:600;margin-top:2px}
 table{width:100%;border-collapse:collapse;font-size:12px}
 th{background:#f1f5f9;text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0}
 td{padding:6px 8px;border-bottom:1px solid #e2e8f0}tr:nth-child(even){background:#fafafa}
</style></head><body>
 <h1>${escapeHtml(req.title)}</h1>${req.subtitle ? `<p class="sub">${escapeHtml(req.subtitle)}</p>` : ""}
 ${kpis ? `<div class="kpis">${kpis}</div>` : ""}
 <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
 <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200))</script>
</body></html>`;
  renderReportWindow(html, win);
};

/** Dispatch by format — the one entry point the ExportMenu calls. */
export const runExport = <T>(format: ExportFormat, req: ExportRequest<T>): void => {
  if (format === "csv") exportCsv(req);
  else if (format === "excel") exportExcel(req);
  else exportPdf(req);
};
