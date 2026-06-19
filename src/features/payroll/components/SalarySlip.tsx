import { useRef, useState } from "react";
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
import { formatINR, formatMinutes, minutesToHours } from "../utils/payrollCalc";
import type { BreakdownLine, PayrollItem, PayrollRun } from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// ARK-branded salary slip — print-ready + multi-format download (PDF / PNG).
//
// The printable markup uses *inline styles* (not Tailwind classes) so it renders
// identically in three contexts: the on-screen preview, the html2canvas raster
// (PDF / PNG), and the standalone print window built from `innerHTML`. This
// mirrors the fee ReceiptGenerator, which the org already prints from.
// ─────────────────────────────────────────────────────────────────────────────

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
    <span style={{ color: BRAND.muted }}>{label}</span>
    <span style={{ fontWeight: 600, color: BRAND.ink, textAlign: "right" }}>{value}</span>
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

const SlipBody = ({
  item,
  run,
  innerRef,
}: {
  item: PayrollItem;
  run: PayrollRun;
  innerRef?: React.Ref<HTMLDivElement>;
}) => {
  const breakdown = item.breakdown ?? [];
  const linesOf = (...types: BreakdownLine["type"][]) =>
    breakdown.filter((b) => types.includes(b.type) && Math.abs(b.amount) > 0);
  const incentiveLines = linesOf("incentive");
  const allowanceLines = linesOf("allowance");
  const deductionLines = linesOf("deduction");
  const penaltyLines = linesOf("penalty");
  const totalDeductions = item.deductions + item.penalties;

  return (
    <div
      ref={innerRef}
      id="payroll-slip"
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
            Salary Slip
          </div>
          <div style={{ fontSize: 11.5, marginTop: 8, opacity: 0.9 }}>{run.title}</div>
          <div style={{ fontSize: 11.5, opacity: 0.9 }}>
            {run.periodStart} → {run.periodEnd}
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 26px 24px" }}>
        {/* ── Meta grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26, marginBottom: 18 }}>
          <div>
            <SectionTitle>Employee</SectionTitle>
            <MetaCell label="Name" value={item.staffName ?? "—"} />
            <MetaCell label="Role" value={item.role ?? "—"} />
            <MetaCell label="Department" value={item.department ?? "—"} />
            <MetaCell label="Hourly Rate" value={`${formatINR(item.hourlyRate)}/hr`} />
            <MetaCell label="Status" value={item.status.toUpperCase()} />
          </div>
          <div>
            <SectionTitle>Pay Period &amp; Attendance</SectionTitle>
            <MetaCell label="Worked Hours" value={formatMinutes(item.workedMinutes)} />
            <MetaCell label="Overtime" value={formatMinutes(item.overtimeMinutes)} />
            <MetaCell label="Attendance" value={`${item.attendancePct}%`} />
            <MetaCell label="Present Days" value={String(item.presentDays)} />
            <MetaCell label="Late Count" value={String(item.lateCount)} />
          </div>
        </div>

        {/* ── Earnings / Deductions ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 }}>
          <div>
            <SectionTitle>Earnings</SectionTitle>
            {item.basicSalary > 0 && <LineRow label="Basic Salary" value={formatINR(item.basicSalary)} />}
            <LineRow
              label="Regular Hours"
              sub={`${minutesToHours(item.workedMinutes - item.overtimeMinutes)} hrs`}
              value={formatINR(item.hourlyEarnings)}
            />
            {item.overtimeEarnings > 0 && (
              <LineRow
                label="Overtime"
                sub={`${minutesToHours(item.overtimeMinutes)} hrs`}
                value={formatINR(item.overtimeEarnings)}
              />
            )}
            {incentiveLines.length > 0
              ? incentiveLines.map((b, i) => (
                  <LineRow key={`inc-${i}`} label={b.label} value={formatINR(b.amount)} accent={BRAND.accent} />
                ))
              : item.incentives > 0 && <LineRow label="Incentives" value={formatINR(item.incentives)} accent={BRAND.accent} />}
            {allowanceLines.length > 0
              ? allowanceLines.map((b, i) => (
                  <LineRow key={`alw-${i}`} label={b.label} value={formatINR(b.amount)} accent={BRAND.accent} />
                ))
              : item.allowances > 0 && <LineRow label="Allowances" value={formatINR(item.allowances)} accent={BRAND.accent} />}
            <div style={{ borderTop: `1px solid ${BRAND.line}`, marginTop: 6, paddingTop: 2 }}>
              <LineRow label="Gross Earnings" value={formatINR(item.grossEarnings)} strong />
            </div>
          </div>

          <div>
            <SectionTitle>Deductions</SectionTitle>
            {deductionLines.length > 0
              ? deductionLines.map((b, i) => (
                  <LineRow key={`ded-${i}`} label={b.label} value={formatINR(b.amount)} accent={BRAND.red} />
                ))
              : item.deductions > 0 && <LineRow label="Deductions" value={formatINR(item.deductions)} accent={BRAND.red} />}
            {penaltyLines.length > 0
              ? penaltyLines.map((b, i) => (
                  <LineRow key={`pen-${i}`} label={b.label} value={formatINR(b.amount)} accent={BRAND.red} />
                ))
              : item.penalties > 0 && <LineRow label="Penalties" value={formatINR(item.penalties)} accent={BRAND.red} />}
            {totalDeductions === 0 && (
              <div style={{ fontSize: 12, color: BRAND.faint, padding: "5px 0" }}>No deductions</div>
            )}
            <div style={{ borderTop: `1px solid ${BRAND.line}`, marginTop: 6, paddingTop: 2 }}>
              <LineRow label="Total Deductions" value={formatINR(totalDeductions)} strong accent={totalDeductions > 0 ? BRAND.red : undefined} />
            </div>
          </div>
        </div>

        {/* ── Net salary band ── */}
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
              Net Salary Payable
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3, maxWidth: 360 }}>
              {amountInWords(item.netSalary)}
            </div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 0.3 }}>{formatINR(item.netSalary)}</div>
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
            <div>• This is a computer-generated salary slip.</div>
            <div>• No physical signature is required.</div>
            <div style={{ marginTop: 8, fontStyle: "italic", color: BRAND.muted, fontWeight: 500 }}>
              Generated by ARK ERP · Payroll
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

export const SalarySlipDialog = ({
  item,
  run,
  open,
  onOpenChange,
}: {
  item: PayrollItem | null;
  run: PayrollRun | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const slipRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "pdf" | "png">(null);

  if (!item || !run) return null;

  const fileBase = `salary-slip-${(item.staffName ?? "staff").replace(/\s+/g, "-")}-${run.periodEnd}`;

  const handlePrint = () => {
    const node = slipRef.current;
    if (!node) return;
    const w = window.open("", "_blank", "width=820,height=1100");
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/>` +
        `<title>Salary Slip — ${item.staffName ?? ""}</title>` +
        `<style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#fff;` +
        `font-family:'Segoe UI',Roboto,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}` +
        `@media print{body{padding:0}}</style></head>` +
        `<body>${node.outerHTML}</body></html>`,
    );
    w.document.close();
    w.focus();
    // Wait for the logo image to load before printing.
    setTimeout(() => {
      w.print();
      w.close();
    }, 500);
  };

  const rasterize = async () => {
    const node = slipRef.current;
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
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Salary Slip — {item.staffName}
          </DialogTitle>
        </DialogHeader>

        <SlipBody item={item} run={run} innerRef={slipRef} />

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
