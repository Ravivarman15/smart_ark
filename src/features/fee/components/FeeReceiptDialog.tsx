import React, { useRef, useState } from "react";
import { Printer, Download, Loader2, FileText, Image } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import arkLogo from "@/assets/ark-logo.jpeg";
import { formatINR } from "../utils";
import type { ReceiptData } from "../types/fee.types";

interface Props {
  receipt: ReceiptData | null;
  onOpenChange: (open: boolean) => void;
}

const BRAND = {
  navy: "#0B2D56", // --primary 213 77% 19%
  navySoft: "#13406F",
  accent: "#479EF5", // --accent 210 90% 62%
  ink: "#0f172a",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  lineSoft: "#eef2f7",
  red: "#dc2626",
  panel: "#f8fafc",
};

const ORG = {
  name: "ARK Learning Arena",
  address: "No 2/31, Mugappair West, Chennai",
  contact: "Phone: 7358199217  |  www.arklearning.com",
};

// ── Amount → words (Indian numbering, INR) ───────────────────────────────────
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const twoDigits = (n: number): string =>
  n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;

const threeDigits = (n: number): string => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h ? ONES[h] + " Hundred" : ""}${h && r ? " " : ""}${r ? twoDigits(r) : ""}`;
};

const amountInWords = (value: number): string => {
  const rupees = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  let words = parts.join(" ").trim() + " Rupees";
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
};

// ── Presentational primitives (inline-styled) ────────────────────────────────
const LineRow = ({
  label,
  value,
  sub,
  strong,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  accent?: string;
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      padding: "5px 0",
      fontSize: 12.5,
    }}
  >
    <span style={{ color: strong ? BRAND.ink : BRAND.muted, fontWeight: strong ? 700 : 400 }}>
      {label}
      {sub ? <span style={{ color: BRAND.faint, fontWeight: 400 }}> · {sub}</span> : null}
    </span>
    <span style={{ fontWeight: strong ? 700 : 600, color: accent ?? BRAND.ink }}>{value}</span>
  </div>
);

const MetaCell = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}>
    <span style={{ color: BRAND.muted, flexShrink: 0, marginRight: 8 }}>{label}</span>
    <span style={{ fontWeight: 600, color: BRAND.ink, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
  </div>
);

const SectionTitle = ({ children }: { children: string }) => (
  <div
    style={{
      fontSize: 10.5,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: 700,
      color: BRAND.navy,
      borderBottom: `2px solid ${BRAND.navy}`,
      paddingBottom: 4,
      marginBottom: 6,
    }}
  >
    {children}
  </div>
);

const ReceiptBody = ({
  receipt,
  innerRef,
}: {
  receipt: ReceiptData;
  innerRef?: React.Ref<HTMLDivElement>;
}) => {
  return (
    <div
      ref={innerRef}
      id="fee-receipt"
      style={{
        background: "#ffffff",
        color: BRAND.ink,
        fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
        width: "100%",
        padding: 0,
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${BRAND.line}`,
        borderRadius: 14,
      }}
    >
      {/* ── Header band ── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navySoft} 60%, ${BRAND.accent} 160%)`,
          color: "#fff",
          padding: "20px 26px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src={arkLogo}
            alt="ARK"
            crossOrigin="anonymous"
            style={{
              width: 56,
              height: 56,
              objectFit: "cover",
              borderRadius: 10,
              background: "#fff",
              padding: 3,
            }}
          />
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" }}>
              {ORG.name}
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>{ORG.address}</div>
            <div style={{ fontSize: 11.5, opacity: 0.85 }}>{ORG.contact}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.35)",
              padding: "5px 14px",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Payment Receipt
          </div>
          <div style={{ fontSize: 11.5, marginTop: 8, opacity: 0.9 }}>
            Receipt No: {receipt.receiptNo}
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.9 }}>
            Date: {receipt.date}
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 26px 24px" }}>
        {/* ── Meta grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26, marginBottom: 18 }}>
          <div>
            <SectionTitle>Student Details</SectionTitle>
            <MetaCell label="Student Name" value={receipt.studentName ?? "—"} />
            <MetaCell label="Class & Batch" value={receipt.batchName ?? "—"} />
          </div>
          <div>
            <SectionTitle>Payment Information</SectionTitle>
            <MetaCell label="Payment Method" value={receipt.paymentMethod} />
            <MetaCell label="Notes" value={receipt.notes ?? "—"} />
          </div>
        </div>

        {/* ── Fee / Balance ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 }}>
          <div>
            <SectionTitle>Fee Payment Details</SectionTitle>
            <LineRow label="Tuition / Program Fee Payment" value={formatINR(receipt.amount)} />
            {receipt.amountReceivedToDate !== undefined && (
              <LineRow label="Total Paid Till Date" value={formatINR(receipt.amountReceivedToDate)} />
            )}
            <div style={{ borderTop: `1px solid ${BRAND.line}`, marginTop: 6, paddingTop: 2 }}>
              <LineRow label="Subtotal Paid" value={formatINR(receipt.amount)} strong />
            </div>
          </div>

          <div>
            <SectionTitle>Balance Information</SectionTitle>
            {receipt.amountPending !== undefined ? (
              <LineRow
                label="Remaining Balance"
                value={formatINR(receipt.amountPending)}
                accent={receipt.amountPending > 0 ? BRAND.red : undefined}
                strong={receipt.amountPending > 0}
              />
            ) : (
              <div style={{ fontSize: 12, color: BRAND.faint, padding: "5px 0" }}>No balance details available</div>
            )}
          </div>
        </div>

        {/* ── Net Paid band ── */}
        <div
          style={{
            marginTop: 18,
            background: BRAND.navy,
            color: "#fff",
            borderRadius: 10,
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.8 }}>
              Amount Paid
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3, maxWidth: 360 }}>
              {amountInWords(receipt.amount)}
            </div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 0.3 }}>{formatINR(receipt.amount)}</div>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: 34,
          }}
        >
          <div style={{ fontSize: 10.5, color: BRAND.faint, lineHeight: 1.7 }}>
            <div>• This is a computer-generated receipt.</div>
            <div>• No physical signature is required.</div>
            <div style={{ marginTop: 8, fontStyle: "italic", color: BRAND.muted, fontWeight: 500 }}>
              Generated by ARK ERP · Fees
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 170, borderBottom: `1px solid ${BRAND.faint}`, marginBottom: 6 }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.ink }}>Authorized Signatory</div>
            <div style={{ fontSize: 10.5, color: BRAND.faint }}>{ORG.name}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const FeeReceiptDialog = ({ receipt, onOpenChange }: Props) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "pdf" | "png">(null);

  if (!receipt) return null;

  const fileBase = `receipt-${receipt.receiptNo}-${(receipt.studentName ?? "student").replace(/\s+/g, "-")}`;

  const handlePrint = () => {
    const node = receiptRef.current;
    if (!node) return;
    const w = window.open("", "_blank", "width=820,height=1100");
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/>` +
        `<title>Receipt — ${receipt.receiptNo}</title>` +
        `<style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#fff;` +
        `font-family:'Segoe UI',Roboto,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}` +
        `@media print{body{padding:0}}</style></head>` +
        `<body>${node.outerHTML}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 500);
  };

  const rasterize = async () => {
    const node = receiptRef.current;
    if (!node) return null;
    return html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  };

  const handleDownloadPdf = async () => {
    setBusy("pdf");
    try {
      const canvas = await rasterize();
      if (!canvas) return;
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 28;
      const w = pageW - margin * 2;
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(img, "PNG", margin, margin, w, h);
      pdf.save(`${fileBase}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadPng = async () => {
    setBusy("png");
    try {
      const canvas = await rasterize();
      if (!canvas) return;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${fileBase}.png`;
      a.click();
    } catch (err) {
      console.error("Failed to generate PNG:", err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={!!receipt} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Receipt — {receipt.receiptNo}
          </DialogTitle>
        </DialogHeader>

        <ReceiptBody receipt={receipt} innerRef={receiptRef} />

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={busy !== null}>
                {busy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                {busy === "pdf" ? "Preparing PDF…" : busy === "png" ? "Preparing PNG…" : "Download"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownloadPdf}>
                <FileText className="w-4 h-4 mr-2" /> PDF document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadPng}>
                <Image className="w-4 h-4 mr-2" /> PNG image
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DialogContent>
    </Dialog>
  );
};
