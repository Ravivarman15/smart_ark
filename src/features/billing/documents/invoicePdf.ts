// ──────────────────────────────────────────────────────────────────────────────
// GST TAX INVOICE — PDF
//
// Phase 5 carry-over #1: the invoice data was complete and GST-correct, and
// nothing rendered it. `invoices.pdf_path` existed, the tenant's Billing page
// rendered a Download button only when it was populated, and nothing ever
// populated it — so the button was permanently invisible.
//
// ┌── WHY THIS IS DRAWN, NOT RASTERISED ───────────────────────────────────┐
// │ Receipts and payslips go through html2canvas because they mirror an    │
// │ on-screen component. An invoice must not. It is a statutory document   │
// │ that a customer files, a chartered accountant reads and a portal may   │
// │ parse for input tax credit — so the amounts, the GSTIN and the invoice │
// │ number have to be SELECTABLE TEXT, not pixels.                         │
// │                                                                        │
// │ It is also the difference between ~40 KB and the ~4.8 MB that made     │
// │ emailed receipts fail to send at all.                                  │
// └────────────────────────────────────────────────────────────────────────┘
//
// ┌── ONE RENDERER, TWO AUDIENCES ─────────────────────────────────────────┐
// │ The platform console downloads any tenant's invoice; a tenant admin    │
// │ downloads their own. Both call this. A second implementation would     │
// │ eventually disagree about a tax figure, and the customer's copy        │
// │ disagreeing with ours is the one bug in this file that costs money.    │
// └────────────────────────────────────────────────────────────────────────┘
//
// Nothing is uploaded. The PDF is generated at click time from the row, so it
// cannot drift from the record and needs no bucket, no signed URL and no
// storage policy. `pdf_path` stays for a provider-hosted copy if one ever
// exists.
// ──────────────────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import { documentPdfOptions } from "@/lib/documentRaster";

/** Who is supplying — Smart ARK, from `platform_settings.gst_profile`. */
export interface InvoiceSupplier {
  legalName: string;
  gstin: string | null;
  address: string | null;
  stateName: string | null;
  stateCode: string | null;
  supportEmail: string | null;
  sac: string;
}

/** Who is billed — the tenant, from `billing_profiles`. */
export interface InvoiceRecipient {
  legalName: string;
  gstin: string | null;
  addressLines: string[];
  stateName: string | null;
  stateCode: string | null;
  billingEmail: string | null;
}

export interface InvoiceDocumentLine {
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  taxPercent: number;
  hsnSac: string | null;
}

export interface InvoiceDocument {
  number: string;
  status: string;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  subtotal: number;
  discountTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  total: number;
  gstTreatment: string | null;
  placeOfSupply: string | null;
  notes: string | null;
}

/**
 * What the tax treatment means, in the words the invoice must actually carry.
 *
 * A zero-rated invoice that says nothing about WHY it is zero-rated is not
 * compliant — the reason is the legal basis for charging no tax, and an
 * auditor reading "Total tax 0.00" with no explanation treats it as evasion.
 */
const TREATMENT_NOTE: Record<string, string> = {
  cgst_sgst: "Intra-state supply — CGST and SGST apply.",
  igst: "Inter-state supply — IGST applies.",
  export: "Export of service — zero-rated. Supply meant for export.",
  sez: "Supply to an SEZ unit — zero-rated under LUT, without payment of integrated tax.",
  reverse_charge: "Tax payable by the recipient under reverse charge (Section 9(3)/9(4)).",
};

const money = (n: number, currency: string): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: 2,
  }).format(n);

const date = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/**
 * Amount in words, which the invoice format expects and no formatter provides.
 *
 * Indian numbering (lakh / crore), not the Western short scale — "1,00,000"
 * read aloud as "one hundred thousand" on an Indian tax invoice is wrong.
 */
export const amountInWords = (amount: number): string => {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const under100 = (n: number): string =>
    n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
  const under1000 = (n: number): string =>
    n < 100
      ? under100(n)
      : `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${under100(n % 100)}` : ""}`;

  const whole = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - whole) * 100);

  const parts: string[] = [];
  const push = (n: number, label: string) => {
    if (n > 0) parts.push(`${under1000(n)} ${label}`);
  };
  push(Math.floor(whole / 10_000_000), "Crore");
  push(Math.floor((whole % 10_000_000) / 100_000), "Lakh");
  push(Math.floor((whole % 100_000) / 1000), "Thousand");
  const last = whole % 1000;
  if (last > 0) parts.push(under1000(last));

  const rupees = parts.length ? parts.join(" ") : "Zero";
  const tail = paise > 0 ? ` and ${under100(paise)} Paise` : "";
  return `${rupees} Rupees${tail} Only`;
};

/** Draw the invoice and hand back the document. */
export const renderInvoicePdf = (
  invoice: InvoiceDocument,
  lines: InvoiceDocumentLine[],
  supplier: InvoiceSupplier,
  recipient: InvoiceRecipient,
): jsPDF => {
  const pdf = new jsPDF(documentPdfOptions);
  const W = pdf.internal.pageSize.getWidth();
  const M = 40;
  const right = W - M;
  let y = M;

  const text = (s: string, x: number, opts?: { size?: number; bold?: boolean; align?: "left" | "right" }) => {
    pdf.setFontSize(opts?.size ?? 9);
    pdf.setFont("helvetica", opts?.bold ? "bold" : "normal");
    pdf.text(s, x, y, { align: opts?.align ?? "left" });
  };
  const rule = (gap = 8) => {
    y += gap;
    pdf.setDrawColor(210);
    pdf.line(M, y, right, y);
    y += gap + 2;
  };

  // ── Header ────────────────────────────────────────────────────────────────
  text(supplier.legalName, M, { size: 15, bold: true });
  text("TAX INVOICE", right, { size: 13, bold: true, align: "right" });
  y += 14;

  const supplierLines = [
    supplier.address,
    [supplier.stateName, supplier.stateCode && `State code ${supplier.stateCode}`]
      .filter(Boolean)
      .join(" · ") || null,
    supplier.gstin ? `GSTIN ${supplier.gstin}` : "GSTIN not registered",
    supplier.supportEmail,
  ].filter((v): v is string => !!v);

  const headerTop = y;
  for (const l of supplierLines) {
    text(l, M, { size: 8 });
    y += 11;
  }

  // Invoice identity sits opposite the supplier block rather than under it —
  // the number and date are what anyone opening this looks for first.
  let ry = headerTop;
  const meta: [string, string][] = [
    ["Invoice no.", invoice.number],
    ["Invoice date", date(invoice.issuedAt)],
    ["Due date", date(invoice.dueAt)],
    ["Place of supply", invoice.placeOfSupply ?? "—"],
  ];
  for (const [k, v] of meta) {
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(k, right - 150, ry);
    pdf.setFont("helvetica", "bold");
    pdf.text(v, right, ry, { align: "right" });
    ry += 11;
  }
  y = Math.max(y, ry);

  rule();

  // ── Bill to ───────────────────────────────────────────────────────────────
  text("BILL TO", M, { size: 7.5, bold: true });
  y += 12;
  text(recipient.legalName, M, { size: 10, bold: true });
  y += 12;
  for (const l of [
    ...recipient.addressLines,
    [recipient.stateName, recipient.stateCode && `State code ${recipient.stateCode}`]
      .filter(Boolean)
      .join(" · "),
    recipient.gstin ? `GSTIN ${recipient.gstin}` : "Unregistered / GSTIN not provided",
    recipient.billingEmail,
  ].filter((v): v is string => !!v && v.length > 0)) {
    text(l, M, { size: 8 });
    y += 11;
  }

  if (invoice.periodStart || invoice.periodEnd) {
    y += 2;
    text(`Billing period: ${date(invoice.periodStart)} — ${date(invoice.periodEnd)}`, M, { size: 8 });
    y += 11;
  }

  rule();

  // ── Lines ─────────────────────────────────────────────────────────────────
  const cols = { desc: M, sac: M + 250, qty: M + 320, rate: M + 400, amount: right };
  text("Description", cols.desc, { size: 7.5, bold: true });
  text("HSN/SAC", cols.sac, { size: 7.5, bold: true });
  text("Qty", cols.qty, { size: 7.5, bold: true });
  text("Rate", cols.rate, { size: 7.5, bold: true });
  text("Amount", cols.amount, { size: 7.5, bold: true, align: "right" });
  rule(6);

  for (const l of lines) {
    // Long descriptions wrap rather than overprinting the HSN column.
    const wrapped = pdf.splitTextToSize(l.description, 235) as string[];
    const top = y;
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "normal");
    pdf.text(wrapped, cols.desc, y);
    text(l.hsnSac ?? supplier.sac, cols.sac, { size: 8.5 });
    text(String(l.quantity), cols.qty, { size: 8.5 });
    text(money(l.unitAmount, invoice.currency), cols.rate, { size: 8.5 });
    text(money(l.amount, invoice.currency), cols.amount, { size: 8.5, align: "right" });
    y = top + Math.max(wrapped.length, 1) * 11 + 3;
  }

  rule(6);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalRow = (label: string, value: string, bold = false) => {
    text(label, right - 150, { size: bold ? 9.5 : 8.5, bold });
    text(value, right, { size: bold ? 9.5 : 8.5, bold, align: "right" });
    y += bold ? 15 : 12;
  };

  totalRow("Taxable value", money(invoice.subtotal, invoice.currency));
  if (invoice.discountTotal > 0) {
    totalRow("Discount", `− ${money(invoice.discountTotal, invoice.currency)}`);
  }
  // Only the components that actually apply are printed. A line reading
  // "IGST 0.00" on an intra-state invoice invites the reader to wonder which
  // of the two figures is the mistake.
  if (invoice.cgst > 0) totalRow("CGST", money(invoice.cgst, invoice.currency));
  if (invoice.sgst > 0) totalRow("SGST", money(invoice.sgst, invoice.currency));
  if (invoice.igst > 0) totalRow("IGST", money(invoice.igst, invoice.currency));
  if (invoice.taxTotal === 0) totalRow("Tax", "Nil");

  y += 2;
  totalRow("Total", money(invoice.total, invoice.currency), true);

  y += 4;
  text(`Amount in words: ${amountInWords(invoice.total)}`, M, { size: 8 });
  y += 14;

  const note = invoice.gstTreatment ? TREATMENT_NOTE[invoice.gstTreatment] : null;
  if (note) {
    text(note, M, { size: 8 });
    y += 12;
  }

  if (invoice.status === "paid") {
    text(`Paid${invoice.paidAt ? ` on ${date(invoice.paidAt)}` : ""}. No payment due.`, M, {
      size: 8,
      bold: true,
    });
    y += 12;
  } else if (invoice.status === "void") {
    // Stated on the face of the document: a voided invoice that looks payable
    // is how a customer pays something they do not owe.
    text("VOID — this invoice has been cancelled and is not payable.", M, { size: 9, bold: true });
    y += 12;
  }

  if (invoice.notes) {
    text(invoice.notes, M, { size: 8 });
    y += 12;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const bottom = pdf.internal.pageSize.getHeight() - M;
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(120);
  pdf.text(
    "This is a computer-generated invoice and does not require a signature.",
    M,
    bottom,
  );
  pdf.text(`Generated ${new Date().toLocaleString("en-IN")}`, right, bottom, { align: "right" });
  pdf.setTextColor(0);

  return pdf;
};

/** `Invoice-ACME-2026-27-0001.pdf` — safe on every filesystem. */
export const invoiceFileName = (number: string): string =>
  `Invoice-${number.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/-+/g, "-")}.pdf`;

export const downloadInvoicePdf = (
  invoice: InvoiceDocument,
  lines: InvoiceDocumentLine[],
  supplier: InvoiceSupplier,
  recipient: InvoiceRecipient,
): void => {
  renderInvoicePdf(invoice, lines, supplier, recipient).save(invoiceFileName(invoice.number));
};
