// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT ARCHITECTURE
//
// Receipts are built from the same StudentFee + FeeInstallment data the rest of
// the module uses — never re-derived. `buildReceipt()` produces the canonical
// ReceiptData; `receiptToHtml()` renders a standalone printable document so a
// receipt can be reprinted from history or emailed later without the React UI.
// ─────────────────────────────────────────────────────────────────────────────

import type { FeeInstallment, ReceiptData, StudentFee } from "../types/fee.types";
import { formatINR } from "./feeCalc";

/** Build the canonical receipt payload for one payment against one fee. */
export const buildReceipt = (
  fee: Pick<
    StudentFee,
    "studentName" | "batchName" | "amountReceived" | "amountPending"
  >,
  payment: Pick<
    FeeInstallment,
    "amount" | "paymentMethod" | "paymentDate" | "receiptNo" | "notes"
  >,
): ReceiptData => ({
  receiptNo: payment.receiptNo ?? "—",
  studentName: fee.studentName ?? undefined,
  batchName: fee.batchName ?? undefined,
  amount: payment.amount,
  paymentMethod: payment.paymentMethod,
  date: payment.paymentDate,
  amountReceivedToDate: fee.amountReceived,
  amountPending: fee.amountPending,
  notes: payment.notes ?? undefined,
});

const row = (label: string, value: string): string =>
  `<tr><td style="padding:4px 0;color:#64748b;">${label}</td>` +
  `<td style="padding:4px 0;text-align:right;font-weight:600;">${value}</td></tr>`;

/**
 * Render a receipt as a fully self-contained HTML document — suitable for
 * `printWindow.document.write()` or as an email body. Pure string, no DOM.
 */
export const receiptToHtml = (r: ReceiptData, orgName = "ARK School"): string => `
<!doctype html><html><head><meta charset="utf-8"/>
<title>Receipt ${r.receiptNo}</title></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#0f172a;margin:0;padding:24px;">
  <div style="max-width:360px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;">
      <span>${orgName}</span><span>${r.receiptNo}</span>
    </div>
    <p style="margin:2px 0 12px;color:#64748b;font-size:12px;">Fee Payment Receipt</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;"/>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      ${row("Student", r.studentName ?? "—")}
      ${row("Batch", r.batchName ?? "—")}
      ${row("Date", r.date)}
      ${row("Method", r.paymentMethod)}
      ${r.notes ? row("Notes", r.notes) : ""}
    </table>
    <hr style="border:none;border-top:1px solid #e2e8f0;"/>
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:18px;margin-top:6px;">
      <span>Amount Paid</span><span>${formatINR(r.amount)}</span>
    </div>
    ${
      r.amountPending !== undefined
        ? `<table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:8px;color:#64748b;">
             ${row("Received to date", formatINR(r.amountReceivedToDate ?? 0))}
             ${row("Balance pending", formatINR(r.amountPending))}
           </table>`
        : ""
    }
    <p style="margin-top:16px;color:#94a3b8;font-size:11px;text-align:center;">
      Computer-generated receipt — no signature required.
    </p>
  </div>
</body></html>`;

/** Open the receipt in a new window and trigger the print dialog. */
export const printReceipt = (r: ReceiptData, orgName?: string): void => {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;
  win.document.write(receiptToHtml(r, orgName));
  win.document.close();
  win.focus();
  win.print();
};

/**
 * Render the receipt to an A4 PDF Blob for emailing / archival. Reuses the SAME
 * `receiptToHtml` markup the print + email paths use (single source of truth) —
 * no second receipt design. Browser-only: rasterises the HTML with html2canvas
 * and wraps it in jsPDF, exactly like the payroll payslip generator. Dynamic
 * imports keep jsPDF/html2canvas out of the main bundle until a receipt is sent.
 */
export const receiptToPdfBlob = async (
  r: ReceiptData,
  orgName?: string,
): Promise<Blob> => {
  if (typeof document === "undefined") {
    throw new Error("Receipt PDF generation requires a browser environment.");
  }
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = "420px";
  host.style.background = "#ffffff";
  // receiptToHtml is a full document; render its <body> content into the host.
  const doc = new DOMParser().parseFromString(
    receiptToHtml(r, orgName),
    "text/html",
  );
  host.innerHTML = doc.body.innerHTML;
  document.body.appendChild(host);

  try {
    const canvas = await html2canvas(host, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const margin = 28;
    const w = pageW - margin * 2;
    const h = (canvas.height * w) / canvas.width;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, w, h);
    return pdf.output("blob");
  } finally {
    host.remove();
  }
};
