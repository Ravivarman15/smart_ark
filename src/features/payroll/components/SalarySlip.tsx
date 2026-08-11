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
import { formatINR, formatMinutes, minutesToHours } from "../utils/payrollCalc";
import type { BreakdownLine, PayrollItem, PayrollRun } from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// SALARY SLIP — tenant-branded, print-ready, multi-format download (PDF / PNG).
//
// The organization's identity used to be a `const ORG = { name: "ARK Learning
// Arena", … }` in this file, which meant every tenant's employees received a
// payslip on ARK's letterhead. It now arrives as a REQUIRED prop resolved from
// the caller's own organization.
//
// `branding` is required, not optional-with-a-default. An optional prop is how
// the original bug survives a refactor: every call site that forgets it
// silently gets the default. TypeScript refuses to build instead.
//
// Layout, spacing, typography and figures are unchanged — this document is
// structurally identical to the one in production, with the identity resolved
// rather than hardcoded. No payroll number is touched: every value still comes
// straight off `PayrollItem`, which the payroll engine computed.
// ─────────────────────────────────────────────────────────────────────────────

export const SlipBody = ({
  item,
  run,
  branding,
  innerRef,
}: {
  item: PayrollItem;
  run: PayrollRun;
  branding: DocumentBranding;
  innerRef?: React.Ref<HTMLDivElement>;
}) => {
  const theme = buildReceiptTheme(branding);
  const breakdown = item.breakdown ?? [];
  const linesOf = (...types: BreakdownLine["type"][]) =>
    breakdown.filter((b) => types.includes(b.type) && Math.abs(b.amount) > 0);
  const incentiveLines = linesOf("incentive");
  const allowanceLines = linesOf("allowance");
  const deductionLines = linesOf("deduction");
  const penaltyLines = linesOf("penalty");
  const totalDeductions = item.deductions + item.penalties;

  return (
    <DocumentFrame theme={theme} domId="payroll-slip" innerRef={innerRef}>
      <DocumentHeader
        branding={branding}
        theme={theme}
        documentType="Salary Slip"
        meta={
          <>
            <HeaderMeta>{run.title}</HeaderMeta>
            <HeaderMeta>
              {run.periodStart} → {run.periodEnd}
            </HeaderMeta>
          </>
        }
      />

      <DocumentBody>
        <DocumentGrid marginBottom={18}>
          <div>
            <SectionTitle theme={theme}>Employee</SectionTitle>
            <MetaCell theme={theme} label="Name" value={item.staffName ?? "—"} />
            <MetaCell theme={theme} label="Role" value={item.role ?? "—"} />
            <MetaCell theme={theme} label="Department" value={item.department ?? "—"} />
            <MetaCell theme={theme} label="Hourly Rate" value={`${formatINR(item.hourlyRate)}/hr`} />
            <MetaCell theme={theme} label="Status" value={item.status.toUpperCase()} />
          </div>
          <div>
            <SectionTitle theme={theme}>Pay Period &amp; Attendance</SectionTitle>
            <MetaCell theme={theme} label="Worked Hours" value={formatMinutes(item.workedMinutes)} />
            <MetaCell theme={theme} label="Overtime" value={formatMinutes(item.overtimeMinutes)} />
            <MetaCell theme={theme} label="Attendance" value={`${item.attendancePct}%`} />
            <MetaCell theme={theme} label="Present Days" value={String(item.presentDays)} />
            <MetaCell theme={theme} label="Late Count" value={String(item.lateCount)} />
          </div>
        </DocumentGrid>

        <DocumentGrid>
          <div>
            <SectionTitle theme={theme}>Earnings</SectionTitle>
            {item.basicSalary > 0 && (
              <LineRow theme={theme} label="Basic Salary" value={formatINR(item.basicSalary)} />
            )}
            <LineRow
              theme={theme}
              label="Regular Hours"
              sub={`${minutesToHours(item.workedMinutes - item.overtimeMinutes)} hrs`}
              value={formatINR(item.hourlyEarnings)}
            />
            {item.overtimeEarnings > 0 && (
              <LineRow
                theme={theme}
                label="Overtime"
                sub={`${minutesToHours(item.overtimeMinutes)} hrs`}
                value={formatINR(item.overtimeEarnings)}
              />
            )}
            {incentiveLines.length > 0
              ? incentiveLines.map((b, i) => (
                  <LineRow
                    key={`inc-${i}`}
                    theme={theme}
                    label={b.label}
                    value={formatINR(b.amount)}
                    accent={theme.accentOnWhite}
                  />
                ))
              : item.incentives > 0 && (
                  <LineRow
                    theme={theme}
                    label="Incentives"
                    value={formatINR(item.incentives)}
                    accent={theme.accentOnWhite}
                  />
                )}
            {allowanceLines.length > 0
              ? allowanceLines.map((b, i) => (
                  <LineRow
                    key={`alw-${i}`}
                    theme={theme}
                    label={b.label}
                    value={formatINR(b.amount)}
                    accent={theme.accentOnWhite}
                  />
                ))
              : item.allowances > 0 && (
                  <LineRow
                    theme={theme}
                    label="Allowances"
                    value={formatINR(item.allowances)}
                    accent={theme.accentOnWhite}
                  />
                )}
            <TotalRule theme={theme}>
              <LineRow theme={theme} label="Gross Earnings" value={formatINR(item.grossEarnings)} strong />
            </TotalRule>
          </div>

          <div>
            <SectionTitle theme={theme}>Deductions</SectionTitle>
            {deductionLines.length > 0
              ? deductionLines.map((b, i) => (
                  <LineRow
                    key={`ded-${i}`}
                    theme={theme}
                    label={b.label}
                    value={formatINR(b.amount)}
                    accent={theme.danger}
                  />
                ))
              : item.deductions > 0 && (
                  <LineRow
                    theme={theme}
                    label="Deductions"
                    value={formatINR(item.deductions)}
                    accent={theme.danger}
                  />
                )}
            {penaltyLines.length > 0
              ? penaltyLines.map((b, i) => (
                  <LineRow
                    key={`pen-${i}`}
                    theme={theme}
                    label={b.label}
                    value={formatINR(b.amount)}
                    accent={theme.danger}
                  />
                ))
              : item.penalties > 0 && (
                  <LineRow
                    theme={theme}
                    label="Penalties"
                    value={formatINR(item.penalties)}
                    accent={theme.danger}
                  />
                )}
            {totalDeductions === 0 && (
              <div style={{ fontSize: 12, color: theme.faint, padding: "5px 0" }}>No deductions</div>
            )}
            <TotalRule theme={theme}>
              <LineRow
                theme={theme}
                label="Total Deductions"
                value={formatINR(totalDeductions)}
                strong
                accent={totalDeductions > 0 ? theme.danger : undefined}
              />
            </TotalRule>
          </div>
        </DocumentGrid>

        <AmountBand
          theme={theme}
          caption="Net Salary Payable"
          words={amountInWords(item.netSalary)}
          amount={formatINR(item.netSalary)}
        />

        <DocumentFooter
          branding={branding}
          theme={theme}
          documentNoun="salary slip"
          module="Payroll"
        />
      </DocumentBody>
    </DocumentFrame>
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
  // Resolved here rather than at each of the three call sites, so opening a
  // slip from the register, the approval centre or My Salary is identical.
  const { branding } = useDocumentBranding();

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

        <SlipBody item={item} run={run} branding={branding} innerRef={slipRef} />

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
