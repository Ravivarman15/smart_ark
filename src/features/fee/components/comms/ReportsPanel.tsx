import React from "react";
import { FileSpreadsheet, FileText, Printer, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelHeading } from "./shared";
import { exportCsv, exportExcel, exportPdf } from "@/features/reports/utils/exportEngine";
import type { ExportColumn, ExportRequest, KpiTile } from "@/features/reports/types/reports.types";
import { formatINR } from "../../utils/feeCalc";
import { isValidEmail, isValidMobile, type ContactRow, type DeliveryStats } from "../../utils/feeCommsCalc";
import type { ReceiptRow } from "../../services";

// ─────────────────────────────────────────────────────────────────────────────
// Reports — Fee Communication report suite. REUSES the shared reports export
// engine (CSV / Excel / PDF / Print). No new export code, no duplicate report
// pages: each report is a column mapping over data the Center already fetched.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  receipts: ReceiptRow[];
  contacts: ContactRow[];
  delivery: DeliveryStats;
}

type AnyReq = ExportRequest<Record<string, never>>;

const ReportCard: React.FC<{
  title: string;
  desc: string;
  build: () => AnyReq;
}> = ({ title, desc, build }) => (
  <div className="glass-card p-4 flex items-center justify-between gap-4 flex-wrap">
    <div>
      <p className="font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
    <div className="flex gap-1.5">
      <Button size="sm" variant="outline" onClick={() => exportCsv(build())}><Table2 className="w-3.5 h-3.5 mr-1" />CSV</Button>
      <Button size="sm" variant="outline" onClick={() => exportExcel(build())}><FileSpreadsheet className="w-3.5 h-3.5 mr-1" />Excel</Button>
      <Button size="sm" variant="outline" onClick={() => exportPdf(build())}><FileText className="w-3.5 h-3.5 mr-1" />PDF</Button>
      <Button size="sm" variant="outline" onClick={() => exportPdf(build())}><Printer className="w-3.5 h-3.5 mr-1" />Print</Button>
    </div>
  </div>
);

export const ReportsPanel: React.FC<Props> = ({ receipts, contacts, delivery }) => {
  const receiptCols: ExportColumn<ReceiptRow>[] = [
    { header: "Receipt No", value: (r) => r.receiptNo },
    { header: "Student", value: (r) => r.studentName ?? "" },
    { header: "Class", value: (r) => [r.className, r.section].filter(Boolean).join(" ") },
    { header: "Parent", value: (r) => r.parentName ?? "" },
    { header: "Email", value: (r) => r.email ?? "" },
    { header: "Mobile", value: (r) => r.mobile ?? "" },
    { header: "Amount", value: (r) => r.amount, align: "right" },
    { header: "Date", value: (r) => r.date },
    { header: "Email Status", value: (r) => r.emailStatus ?? "not sent" },
    { header: "WhatsApp Status", value: (r) => r.whatsappStatus ?? "not sent" },
  ];

  const contactCols: ExportColumn<ContactRow>[] = [
    { header: "Student", value: (c) => c.name },
    { header: "Admission", value: (c) => c.admissionNo ?? "" },
    { header: "Class", value: (c) => [c.className, c.section].filter(Boolean).join(" ") },
    { header: "Parent", value: (c) => c.parentName ?? "" },
    { header: "Email", value: (c) => c.email ?? "" },
    { header: "Email Issue", value: (c) => (!c.email ? "missing" : !isValidEmail(c.email) ? "invalid" : "") },
    { header: "Mobile", value: (c) => c.mobile ?? "" },
    { header: "Mobile Issue", value: (c) => (!c.mobile ? "missing" : !isValidMobile(c.mobile) ? "invalid" : "") },
  ];

  const kpis: KpiTile[] = [
    { key: "sent", label: "Total Sent", value: delivery.sent + delivery.delivered + delivery.read },
    { key: "delivered", label: "Delivered", value: delivery.delivered + delivery.read },
    { key: "failed", label: "Failed", value: delivery.failed },
    { key: "emailrate", label: "Email Success", value: `${delivery.emailSuccessRate}%` },
    { key: "warate", label: "WhatsApp Success", value: `${delivery.whatsappSuccessRate}%` },
  ];

  const missing = contacts.filter(
    (c) => !c.email || !isValidEmail(c.email) || !c.mobile || !isValidMobile(c.mobile),
  );

  // Typed as AnyReq for the generic ReportCard; exportEngine is generic-safe.
  const req = <T,>(r: ExportRequest<T>): AnyReq => r as unknown as AnyReq;

  return (
    <div className="space-y-3">
      <PanelHeading title="Reports" desc="Export the fee communication reports — CSV, Excel, PDF or Print." />

      <ReportCard
        title="Fee Receipt Delivery Report"
        desc={`${receipts.length} receipts with per-channel delivery status`}
        build={() => req<ReceiptRow>({ reportKey: "fee_receipt_delivery", title: "Fee Receipt Delivery Report", columns: receiptCols, rows: receipts, kpis, subtitle: `Generated ${new Date().toLocaleString()}` })}
      />
      <ReportCard
        title="Fee Communication Report"
        desc="All receipt communications with summary KPIs"
        build={() => req<ReceiptRow>({ reportKey: "fee_communication", title: "Fee Communication Report", columns: receiptCols, rows: receipts, kpis })}
      />
      <ReportCard
        title="Email Failure Report"
        desc={`${receipts.filter((r) => r.emailStatus === "failed").length} failed email deliveries`}
        build={() => req<ReceiptRow>({ reportKey: "fee_email_failures", title: "Email Failure Report", columns: receiptCols, rows: receipts.filter((r) => r.emailStatus === "failed") })}
      />
      <ReportCard
        title="WhatsApp Failure Report"
        desc={`${receipts.filter((r) => r.whatsappStatus === "failed").length} failed WhatsApp deliveries`}
        build={() => req<ReceiptRow>({ reportKey: "fee_whatsapp_failures", title: "WhatsApp Failure Report", columns: receiptCols, rows: receipts.filter((r) => r.whatsappStatus === "failed") })}
      />
      <ReportCard
        title="Missing Contact Report"
        desc={`${missing.length} students with missing / invalid contact info`}
        build={() => req<ContactRow>({ reportKey: "fee_missing_contacts", title: "Missing Contact Report", columns: contactCols, rows: missing })}
      />
      <ReportCard
        title="Communication Audit Report"
        desc="Every receipt with its full delivery audit trail"
        build={() => req<ReceiptRow>({ reportKey: "fee_comm_audit", title: "Fee Communication Audit Report", columns: receiptCols, rows: receipts, kpis, subtitle: `Total ${receipts.length} receipts` })}
      />
    </div>
  );
};
