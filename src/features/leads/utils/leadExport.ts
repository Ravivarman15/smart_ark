// Export helpers for the Lead CRM. Reuse xlsx (dynamic-imported) and a plain
// CSV fallback. PDF/print is handled by the browser print dialog from the
// analytics page. No new deps.

import arkLogo from "@/assets/ark-logo.jpeg";
import type { Admission, Lead } from "../types/lead.types";
import type { CounselorRow } from "./leaderboard";

const datedName = (base: string) => `${base}_${new Date().toISOString().slice(0, 10)}`;

const downloadCsv = (filename: string, header: string[], rows: (string | number)[][]) => {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportLeadsCsv = (leads: Lead[], staffName: (id?: string) => string) => {
  downloadCsv(
    datedName("leads"),
    ["Student", "Parent", "Phone", "Email", "Course", "Standard", "Source", "Stage", "Score", "Category", "Counselor", "Created"],
    leads.map((l) => [
      l.studentName, l.parentName ?? "", l.phone ?? "", l.email ?? "", l.course ?? "",
      l.standard ?? "", l.source, l.status, l.score, l.scoreCategory,
      staffName(l.assignedTo), new Date(l.createdAt).toLocaleDateString(),
    ]),
  );
};

export const exportAdmissionsCsv = (admissions: Admission[], counselorName: (id?: string) => string) => {
  downloadCsv(
    datedName("admissions"),
    ["Date", "Course", "Batch", "Campus", "Counselor", "Fee", "Scholarship", "Payment", "Status"],
    admissions.map((a) => [
      new Date(a.admissionDate).toLocaleDateString(), a.course ?? "", a.batch ?? "",
      a.campus ?? "", counselorName(a.counselorId), a.feeAmount, a.scholarshipAmount, a.paymentStatus, a.status,
    ]),
  );
};

/** Rich Excel export of leads (xlsx, dynamic import). */
export const exportLeadsXlsx = async (leads: Lead[], staffName: (id?: string) => string) => {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = [
    ["Student", "Parent", "Phone", "Email", "Course", "Standard", "Source", "Stage", "Score", "Category", "Counselor", "Est. Value", "Created"],
    ...leads.map((l) => [
      l.studentName, l.parentName ?? "", l.phone ?? "", l.email ?? "", l.course ?? "",
      l.standard ?? "", l.source, l.status, l.score, l.scoreCategory,
      staffName(l.assignedTo), l.estimatedValue, new Date(l.createdAt).toLocaleDateString(),
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  XLSX.writeFile(wb, `${datedName("leads")}.xlsx`);
};

// ── Counselor performance report (CSV / Excel / PDF) ─────────────────────────

const COUNSELOR_HEADER = [
  "Rank", "Counselor", "Leads Handled", "Admissions", "Conversion %",
  "Avg Response (min)", "Fastest (min)", "Followup %", "Demo %", "Score",
];

const counselorRowValues = (r: CounselorRow): (string | number)[] => [
  r.rank, r.name, r.leadsHandled, r.admissions, r.conversionRate,
  r.avgResponseMinutes ?? "", r.fastestResponseMinutes ?? "",
  r.followupCompletion, r.demoCompletion, r.score,
];

export const exportCounselorReportCsv = (rows: CounselorRow[]) =>
  downloadCsv(datedName("counselor_report"), COUNSELOR_HEADER, rows.map(counselorRowValues));

export const exportCounselorReportXlsx = async (rows: CounselorRow[]) => {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = [COUNSELOR_HEADER, ...rows.map(counselorRowValues)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Counselors");
  XLSX.writeFile(wb, `${datedName("counselor_report")}.xlsx`);
};

const loadLogo = (): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = arkLogo;
  });

/** Professional PDF: ARK logo, generated date, table, summary, footer. */
export const exportCounselorReportPdf = async (rows: CounselorRow[]) => {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  const logo = await loadLogo();
  if (logo) {
    const w = 48;
    const h = (logo.height / logo.width) * w || 48;
    try { doc.addImage(logo, "JPEG", margin, y, w, h); } catch { /* logo optional */ }
  }
  doc.setFontSize(16).setFont("helvetica", "bold");
  doc.text("ARK Learning Arena", margin + 60, y + 18);
  doc.setFontSize(11).setFont("helvetica", "normal");
  doc.text("Counselor Performance Report", margin + 60, y + 36);
  doc.setFontSize(9).setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - margin, y + 18, { align: "right" });
  doc.setTextColor(0);
  y += 70;

  // Table header.
  const cols = [28, 130, 55, 70, 70, 80, 60]; // rank,name,leads,admissions,conv,resp,score
  const heads = ["#", "Counselor", "Leads", "Admis.", "Conv%", "Avg Resp", "Score"];
  doc.setFontSize(9).setFont("helvetica", "bold");
  let x = margin;
  heads.forEach((h, i) => { doc.text(h, x, y); x += cols[i]; });
  y += 6;
  doc.setLineWidth(0.5).line(margin, y, pageW - margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  for (const r of rows) {
    if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = margin; }
    const cells = [
      String(r.rank), r.name.slice(0, 28), String(r.leadsHandled), String(r.admissions),
      `${r.conversionRate}%`, r.avgResponseMinutes === null ? "—" : `${Math.round(r.avgResponseMinutes)}m`,
      String(r.score),
    ];
    x = margin;
    cells.forEach((c, i) => { doc.text(c, x, y); x += cols[i]; });
    y += 16;
  }

  // Summary.
  y += 10;
  doc.setFont("helvetica", "bold").text("Summary", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  const totalLeads = rows.reduce((a, r) => a + r.leadsHandled, 0);
  const totalAdm = rows.reduce((a, r) => a + r.admissions, 0);
  doc.text(`Counselors: ${rows.length}   Leads: ${totalLeads}   Admissions: ${totalAdm}   ` +
    `Overall conversion: ${totalLeads ? Math.round((totalAdm / totalLeads) * 100) : 0}%`, margin, y);

  // Footer.
  doc.setFontSize(8).setTextColor(150);
  doc.text("ARK Learning Arena — Confidential. Generated by ARK CRM.", margin,
    doc.internal.pageSize.getHeight() - 24);

  doc.save(`${datedName("counselor_report")}.pdf`);
};
