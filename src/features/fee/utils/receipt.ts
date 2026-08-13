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
 *
 * `orgName` has NO default. It previously defaulted to "ARK School", which
 * meant every caller that omitted it stamped one tenant's name onto another
 * tenant's receipt — silently, because a default parameter never errors. An
 * empty string renders the receipt without a name, which is wrong but honest;
 * a competitor's name is wrong and convincing.
 */
export const receiptToHtml = (r: ReceiptData, orgName: string): string => `
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
export const printReceipt = (r: ReceiptData, orgName: string): void => {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;
  win.document.write(receiptToHtml(r, orgName));
  win.document.close();
  win.focus();
  win.print();
};

/** Resolve once every <img> under `root` (the organization logo) has loaded, so
 * the html2canvas raster isn't captured before the branding paints. */
const waitForImages = (root: HTMLElement, timeoutMs = 4000): Promise<void> =>
  new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const slip = root.querySelector("#fee-receipt");
      const imgs = Array.from(root.querySelectorAll("img"));
      const ready = imgs.every((img) => img.complete && img.naturalWidth > 0);
      if (slip && ready) resolve();
      else if (Date.now() - start > timeoutMs) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

/**
 * The print-window shell for a branded receipt.
 *
 * `ReceiptBody` is styled entirely with inline styles (DocumentShell uses no
 * className at all), so its `outerHTML` is self-contained and needs only a page
 * frame around it. Shared so the staff dialog's Print button and the parent
 * portal cannot drift into two different documents.
 *
 * The document prints itself on load — `renderReportWindow` writes the HTML and
 * hands control to the browser without calling print().
 */
export const receiptPrintDocument = (innerHtml: string, title: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"/>` +
  `<title>${title.replace(/[<>&]/g, "")}</title>` +
  `<style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#fff;` +
  `font-family:'Segoe UI',Roboto,Arial,sans-serif;-webkit-print-color-adjust:exact;` +
  `print-color-adjust:exact;}@media print{body{padding:0}@page{size:A4;margin:12mm}}` +
  `</style></head><body>${innerHtml}` +
  `<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},350)})</script>` +
  `</body></html>`;

/**
 * Render the receipt to an A4 PDF Blob for emailing / archival. Renders the SAME
 * branded `ReceiptBody` the on-screen receipt dialog uses (organization logo +
 * its own header colours, meta grid, amount band, signatory) — one receipt
 * design, identical to the on-screen download and mirroring the payroll salary
 * slip. Exactly the payslipPdf pattern: mount the component off-screen, wait for
 * the logo, raster with html2canvas, wrap in jsPDF. Dynamic imports keep
 * React-DOM / jsPDF / html2canvas / the dialog chunk out of the main bundle
 * until a receipt is sent.
 *
 * BRANDING: resolved and awaited BEFORE the off-screen render. `ReceiptBody`
 * takes it as a prop rather than reading a hook, because a fetch after mount
 * would race `waitForImages` and intermittently rasterise an unbranded receipt.
 * The resolver is session-cached, so a bulk send is one lookup.
 */
export const receiptToPdfBlob = async (r: ReceiptData): Promise<Blob> => {
  if (typeof document === "undefined") {
    throw new Error("Receipt PDF generation requires a browser environment.");
  }
  const [
    { createElement },
    { createRoot },
    { default: jsPDF },
    { default: html2canvas },
    { ReceiptBody },
    { resolveDocumentBranding },
  ] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("jspdf"),
    import("html2canvas"),
    import("../components/FeeReceiptDialog"),
    import("@/features/branding/documents"),
  ]);

  const branding = await resolveDocumentBranding();

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = "760px";
  host.style.background = "#ffffff";
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(createElement(ReceiptBody, { receipt: r, branding }));
    await waitForImages(host);

    const node = (host.querySelector("#fee-receipt") as HTMLElement) ?? host;
    const canvas = await html2canvas(node, {
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
    root.unmount();
    host.remove();
  }
};
