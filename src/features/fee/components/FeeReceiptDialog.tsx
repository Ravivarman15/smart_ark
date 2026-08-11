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
import {
  AmountBand,
  buildReceiptTheme,
  DocumentBody,
  DocumentFooter,
  DocumentFrame,
  DocumentGrid,
  DocumentHeader,
  HeaderMeta,
  LineRow,
  MetaCell,
  SectionTitle,
  TotalRule,
  amountInWords,
  useDocumentBranding,
  type DocumentBranding,
} from "@/features/branding/documents";
import { formatINR } from "../utils";
import type { ReceiptData } from "../types/fee.types";

// ─────────────────────────────────────────────────────────────────────────────
// FEE PAYMENT RECEIPT — tenant-branded.
//
// This is the document a PARENT keeps. It used to carry a hardcoded
// `ORG = { name: "ARK Learning Arena", … }`, so an ABC Academi parent paying
// ABC Academi received a receipt naming a competitor. It now resolves the
// issuing organization's own identity and its three configured colours.
//
// `branding` is REQUIRED. See the note in SalarySlip.tsx — an optional prop
// with a default is how this class of bug survives a refactor.
//
// Structure, spacing and figures are unchanged from the production receipt.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  receipt: ReceiptData | null;
  onOpenChange: (open: boolean) => void;
}

// Exported so the headless PDF generator (`receiptToPdfBlob`) can render the
// EXACT same branded markup off-screen — the emailed receipt PDF is then
// identical to the on-screen receipt (one design, mirroring the payroll slip).
export const ReceiptBody = ({
  receipt,
  branding,
  innerRef,
}: {
  receipt: ReceiptData;
  branding: DocumentBranding;
  innerRef?: React.Ref<HTMLDivElement>;
}) => {
  const theme = buildReceiptTheme(branding);

  return (
    <DocumentFrame theme={theme} domId="fee-receipt" innerRef={innerRef}>
      <DocumentHeader
        branding={branding}
        theme={theme}
        documentType="Payment Receipt"
        meta={
          <>
            <HeaderMeta>Receipt No: {receipt.receiptNo}</HeaderMeta>
            <HeaderMeta>Date: {receipt.date}</HeaderMeta>
          </>
        }
      />

      <DocumentBody>
        <DocumentGrid marginBottom={18}>
          <div>
            <SectionTitle theme={theme}>Student Details</SectionTitle>
            <MetaCell theme={theme} label="Student Name" value={receipt.studentName ?? "—"} />
            <MetaCell theme={theme} label="Class & Batch" value={receipt.batchName ?? "—"} />
          </div>
          <div>
            <SectionTitle theme={theme}>Payment Information</SectionTitle>
            <MetaCell theme={theme} label="Payment Method" value={receipt.paymentMethod} />
            <MetaCell theme={theme} label="Notes" value={receipt.notes ?? "—"} />
          </div>
        </DocumentGrid>

        <DocumentGrid>
          <div>
            <SectionTitle theme={theme}>Fee Payment Details</SectionTitle>
            <LineRow
              theme={theme}
              label="Tuition / Program Fee Payment"
              value={formatINR(receipt.amount)}
            />
            {receipt.amountReceivedToDate !== undefined && (
              <LineRow
                theme={theme}
                label="Total Paid Till Date"
                value={formatINR(receipt.amountReceivedToDate)}
              />
            )}
            <TotalRule theme={theme}>
              <LineRow theme={theme} label="Subtotal Paid" value={formatINR(receipt.amount)} strong />
            </TotalRule>
          </div>

          <div>
            <SectionTitle theme={theme}>Balance Information</SectionTitle>
            {receipt.amountPending !== undefined ? (
              <LineRow
                theme={theme}
                label="Remaining Balance"
                value={formatINR(receipt.amountPending)}
                accent={receipt.amountPending > 0 ? theme.danger : undefined}
                strong={receipt.amountPending > 0}
              />
            ) : (
              <div style={{ fontSize: 12, color: theme.faint, padding: "5px 0" }}>
                No balance details available
              </div>
            )}
          </div>
        </DocumentGrid>

        <AmountBand
          theme={theme}
          caption="Amount Paid"
          words={amountInWords(receipt.amount)}
          amount={formatINR(receipt.amount)}
        />

        <DocumentFooter branding={branding} theme={theme} documentNoun="receipt" module="Fees" />
      </DocumentBody>
    </DocumentFrame>
  );
};

export const FeeReceiptDialog = ({ receipt, onOpenChange }: Props) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "pdf" | "png">(null);
  // Resolved here so the four call sites (Fees Management, Fees & Admission,
  // the student drawer, and the fee module's own exports) stay unchanged.
  const { branding } = useDocumentBranding();

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

        <ReceiptBody receipt={receipt} branding={branding} innerRef={receiptRef} />

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
