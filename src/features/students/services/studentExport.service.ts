// ─────────────────────────────────────────────────────────────────────────────
// Centralised student export engine.
//
// The ONLY place that knows how to turn Student records into a downloadable
// file. Pages/components call `exportStudents()` (bulk) or
// `downloadStudentRecord()` (single) — they never build CSV/XLSX/PDF inline.
//
//   • CSV  — UTF-8 with BOM so Excel opens accents cleanly.
//   • XLSX — a real .xlsx workbook via SheetJS, lazy-imported so the ~430 kB
//            `xlsx` chunk only loads when a user actually exports to Excel.
//   • PDF  — opens a print-ready window with a tuned stylesheet; the user
//            picks "Save as PDF". Mirrors the reports module's print approach
//            (no heavyweight PDF lib in the bundle).
//
// Mobile/APK note: `triggerDownload` uses an <a download> blob URL which works
// in the Capacitor WebView; the PDF print window relies on the system print
// sheet which Android exposes as "Save as PDF".
// ─────────────────────────────────────────────────────────────────────────────

import type { Student } from "../types/student.types";
import { formatDate, formatDateTime } from "../utils/helpers";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export interface StudentExportColumn {
  header: string;
  value: (s: Student) => string | number;
}

const text = (v?: string | number | null): string =>
  v === undefined || v === null || v === "" ? "" : String(v);

// Full column set for the bulk export. Mirrors the profile drawer's sections so
// an exported sheet is a complete student record table.
export const STUDENT_EXPORT_COLUMNS: StudentExportColumn[] = [
  { header: "Student ID", value: (s) => s.id },
  { header: "Name", value: (s) => s.name },
  { header: "Roll Number", value: (s) => text(s.rollNumber) },
  { header: "Enrollment No", value: (s) => text(s.enrolmentNo) },
  { header: "GR No", value: (s) => text(s.grNo) },
  { header: "Biometric ID", value: (s) => text(s.biometricId) },
  { header: "Username", value: (s) => text(s.username) },
  { header: "Gender", value: (s) => text(s.gender) },
  { header: "Date of Birth", value: (s) => (s.dateOfBirth ? formatDate(s.dateOfBirth) : "") },
  { header: "Blood Group", value: (s) => text(s.bloodGroup) },
  { header: "Category", value: (s) => text(s.category) },
  { header: "Group", value: (s) => text(s.groupName) },
  { header: "Academic Year", value: (s) => text(s.academicYearId) },
  { header: "Standard", value: (s) => text(s.standardName) },
  { header: "Course Type", value: (s) => text(s.courseTypeName) },
  { header: "Batch", value: (s) => text(s.batch) },
  { header: "Campus", value: (s) => text(s.campus) },
  { header: "Admission Date", value: (s) => (s.dateOfJoining ? formatDate(s.dateOfJoining) : "") },
  { header: "Father Name", value: (s) => text(s.parentName) },
  { header: "Father Mobile", value: (s) => text(s.parentContact) },
  { header: "Father Email", value: (s) => text(s.parentEmail) },
  { header: "Mother Name", value: (s) => text(s.motherName) },
  { header: "Mother Mobile", value: (s) => text(s.motherContact) },
  { header: "Mother Email", value: (s) => text(s.motherEmail) },
  { header: "Guardian Name", value: (s) => text(s.guardianName) },
  { header: "Guardian Relation", value: (s) => text(s.guardianRelation) },
  { header: "Guardian Contact", value: (s) => text(s.guardianContact) },
  { header: "Student Mobile", value: (s) => text(s.studentContact) },
  { header: "Student Email", value: (s) => text(s.studentEmail) },
  { header: "Address", value: (s) => text(s.address) },
  { header: "City", value: (s) => text(s.city) },
  { header: "State", value: (s) => text(s.state) },
  { header: "Status", value: (s) => (s.active ? "Active" : "Inactive") },
  { header: "Created", value: (s) => (s.createdAt ? formatDate(s.createdAt) : "") },
];

// ── low-level helpers ────────────────────────────────────────────────────────
const csvEscape = (v: string | number): string => {
  const s = String(v ?? "");
  return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

const triggerDownload = (content: BlobPart, fileName: string, mime: string): void => {
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

const datedName = (base: string, ext: string): string =>
  `${base}_${new Date().toISOString().slice(0, 10)}.${ext}`;

// ── bulk export ──────────────────────────────────────────────────────────────
export interface BulkExportOptions {
  /** Base file name (no extension). Defaults to "students". */
  fileName?: string;
  /** Title printed at the top of the PDF / used as the Excel sheet name. */
  title?: string;
  /** Filter summary shown under the title in the PDF. */
  subtitle?: string;
  columns?: StudentExportColumn[];
}

const exportBulkCsv = (rows: Student[], cols: StudentExportColumn[], name: string): void => {
  const lines = [cols.map((c) => csvEscape(c.header)).join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvEscape(c.value(r))).join(","));
  triggerDownload("﻿" + lines.join("\n"), datedName(name, "csv"), "text/csv;charset=utf-8");
};

const exportBulkXlsx = async (
  rows: Student[],
  cols: StudentExportColumn[],
  name: string,
  title: string,
): Promise<void> => {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = [
    cols.map((c) => c.header),
    ...rows.map((r) => cols.map((c) => c.value(r))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = cols.map((c) => ({ wch: Math.max(12, c.header.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31) || "Students");
  XLSX.writeFile(wb, datedName(name, "xlsx"));
};

const exportBulkPdf = (
  rows: Student[],
  cols: StudentExportColumn[],
  title: string,
  subtitle?: string,
): void => {
  // The full column set is too wide to print legibly — use a focused subset.
  const printCols = cols.filter((c) =>
    ["Name", "Roll Number", "Standard", "Batch", "Father Mobile", "Status"].includes(c.header),
  );
  const used = printCols.length ? printCols : cols.slice(0, 6);
  const w = window.open("", "_blank", "noopener=yes,noreferrer=yes");
  if (!w) return;
  const head = used.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = rows
    .map(
      (r) => `<tr>${used.map((c) => `<td>${escapeHtml(String(c.value(r)))}</td>`).join("")}</tr>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,Segoe UI,sans-serif;color:#0f172a;margin:24px}
  h1{font-size:18px;margin:0 0 4px} .sub{color:#64748b;font-size:12px;margin:0 0 16px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#f1f5f9;text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;font-weight:600}
  td{padding:6px 8px;border-bottom:1px solid #e2e8f0} tr:nth-child(even){background:#fafafa}
</style></head><body>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="sub">${escapeHtml(subtitle)} · ${rows.length} students</p>` : `<p class="sub">${rows.length} students</p>`}
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script>
</body></html>`);
  w.document.close();
};

/** Single entry point for bulk export. Returns a promise (xlsx path is async). */
export const exportStudents = async (
  rows: Student[],
  format: ExportFormat,
  opts: BulkExportOptions = {},
): Promise<void> => {
  const cols = opts.columns ?? STUDENT_EXPORT_COLUMNS;
  const name = opts.fileName ?? "students";
  const title = opts.title ?? "Students";
  if (format === "csv") return exportBulkCsv(rows, cols, name);
  if (format === "xlsx") return exportBulkXlsx(rows, cols, name, title);
  return exportBulkPdf(rows, cols, title, opts.subtitle);
};

// ── individual student record ─────────────────────────────────────────────────
export interface RecordSummaries {
  attendance?: { total: number; present: number; absent: number; late: number; percent: number };
  fee?: { total: number; received: number; pending: number; status: string };
  exam?: { count: number; average: number | null; lastGrade?: string };
}

interface Section {
  heading: string;
  rows: [string, string][];
}

const buildSections = (s: Student, sum: RecordSummaries): Section[] => {
  const sections: Section[] = [
    {
      heading: "Personal Information",
      rows: [
        ["Name", s.name],
        ["Gender", text(s.gender)],
        ["Date of Birth", s.dateOfBirth ? formatDate(s.dateOfBirth) : ""],
        ["Blood Group", text(s.bloodGroup)],
        ["Category", text(s.category)],
        ["Group", text(s.groupName)],
      ],
    },
    {
      heading: "Academic Information",
      rows: [
        ["Standard", text(s.standardName)],
        ["Course Type", text(s.courseTypeName)],
        ["Batch", text(s.batch)],
        ["Campus", text(s.campus)],
        ["Admission Date", s.dateOfJoining ? formatDate(s.dateOfJoining) : ""],
        ["Roll Number", text(s.rollNumber)],
        ["Enrollment No", text(s.enrolmentNo)],
        ["GR No", text(s.grNo)],
        ["Biometric ID", text(s.biometricId)],
      ],
    },
    {
      heading: "Parent / Guardian",
      rows: [
        ["Father Name", text(s.parentName)],
        ["Father Mobile", text(s.parentContact)],
        ["Father Email", text(s.parentEmail)],
        ["Mother Name", text(s.motherName)],
        ["Mother Mobile", text(s.motherContact)],
        ["Mother Email", text(s.motherEmail)],
        ["Guardian", text(s.guardianName)],
      ],
    },
    {
      heading: "Contact",
      rows: [
        ["Student Mobile", text(s.studentContact)],
        ["Student Email", text(s.studentEmail)],
        ["Address", text(s.address)],
        ["City", text(s.city)],
        ["State", text(s.state)],
      ],
    },
    {
      heading: "System",
      rows: [
        ["Student ID", s.id],
        ["Username", text(s.username)],
        ["Status", s.active ? "Active" : "Inactive"],
        ["Created", s.createdAt ? formatDateTime(s.createdAt) : ""],
      ],
    },
  ];
  if (sum.attendance) {
    sections.push({
      heading: "Attendance Summary",
      rows: [
        ["Records", String(sum.attendance.total)],
        ["Present", String(sum.attendance.present)],
        ["Absent", String(sum.attendance.absent)],
        ["Late", String(sum.attendance.late)],
        ["Attendance %", `${sum.attendance.percent}%`],
      ],
    });
  }
  if (sum.fee) {
    sections.push({
      heading: "Fee Summary",
      rows: [
        ["Total", String(sum.fee.total)],
        ["Received", String(sum.fee.received)],
        ["Pending", String(sum.fee.pending)],
        ["Status", sum.fee.status],
      ],
    });
  }
  if (sum.exam) {
    sections.push({
      heading: "Exam Summary",
      rows: [
        ["Results", String(sum.exam.count)],
        ["Average", sum.exam.average === null ? "—" : sum.exam.average.toFixed(1)],
        ["Last Grade", text(sum.exam.lastGrade)],
      ],
    });
  }
  return sections;
};

const recordPdf = (s: Student, sections: Section[]): void => {
  const w = window.open("", "_blank", "noopener=yes,noreferrer=yes");
  if (!w) return;
  const sectionsHtml = sections
    .map(
      (sec) =>
        `<section><h2>${escapeHtml(sec.heading)}</h2><table>${sec.rows
          .map(
            ([k, v]) =>
              `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(v || "—")}</td></tr>`,
          )
          .join("")}</table></section>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(s.name)} — Student Record</title>
<style>
  body{font-family:ui-sans-serif,system-ui,Segoe UI,sans-serif;color:#0f172a;margin:28px;max-width:760px}
  h1{font-size:20px;margin:0 0 2px} .sub{color:#64748b;font-size:12px;margin:0 0 20px}
  section{margin:0 0 18px;break-inside:avoid}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#475569;margin:0 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:4px 8px;vertical-align:top} td.k{color:#64748b;width:38%} td.v{font-weight:500}
  @media print{body{margin:12mm}}
</style></head><body>
  <h1>${escapeHtml(s.name)}</h1>
  <p class="sub">${escapeHtml(s.standardName || "")}${s.batch ? " · " + escapeHtml(s.batch) : ""}${s.rollNumber ? " · Roll #" + escapeHtml(s.rollNumber) : ""}</p>
  ${sectionsHtml}
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script>
</body></html>`);
  w.document.close();
};

const recordXlsx = async (s: Student, sections: Section[]): Promise<void> => {
  const XLSX = await import("xlsx");
  const aoa: string[][] = [];
  for (const sec of sections) {
    aoa.push([sec.heading]);
    for (const [k, v] of sec.rows) aoa.push([k, v]);
    aoa.push([""]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 24 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Record");
  XLSX.writeFile(wb, `${s.name.replace(/[^\w]+/g, "_")}_record_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

/** Download a single student's full record. PDF (print) or Excel. */
export const downloadStudentRecord = async (
  student: Student,
  summaries: RecordSummaries,
  format: "pdf" | "xlsx",
): Promise<void> => {
  const sections = buildSections(student, summaries);
  if (format === "pdf") return recordPdf(student, sections);
  return recordXlsx(student, sections);
};
