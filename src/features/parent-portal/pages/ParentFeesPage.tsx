// ── Parent Portal — Fees ─────────────────────────────────────────────────────
// Reads the Fee module's student_fees + fee_installments through the shared
// insights bundle, so the ledger a parent sees is byte-for-byte the ledger the
// front desk sees.

import { CreditCard, Receipt } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useChildInsights } from "../hooks/useChildData";
import { parentAuditService } from "../services/parentAudit.service";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingTiles,
  PageHeader,
  SectionTitle,
  StatTile,
  formatDate,
  inr,
} from "../components/primitives";
import { openReportWindow, renderReportWindow } from "@/lib/reportWindow";

/**
 * A printable receipt built from the installment row the parent already has.
 * Deliberately a print view rather than a PDF library call — it matches how
 * every other document in this codebase is produced and adds no dependency.
 */
const receiptHtml = (args: {
  studentName: string;
  admissionNo?: string;
  className?: string;
  receiptNo?: string;
  date: string;
  amount: number;
  method: string;
  totalPaid: number;
  totalFee: number;
  pending: number;
}) => {
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
    );
  const row = (k: string, v: string) =>
    `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Fee Receipt — ${esc(args.studentName)}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,Segoe UI,sans-serif;color:#0f172a;margin:0}
  .page{max-width:640px;margin:0 auto;padding:40px 32px}
  .brand{font-weight:800;letter-spacing:.12em;color:#4f46e5;font-size:14px}
  h1{font-size:20px;margin:6px 0 18px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:7px 6px;border-bottom:1px solid #f1f5f9}
  td.k{color:#64748b;width:45%}
  td.v{font-weight:600}
  .amt{margin:18px 0;padding:14px;border-radius:10px;background:#eef2ff;text-align:center}
  .amt b{display:block;font-size:26px;color:#4f46e5}
  .foot{margin-top:24px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:10px}
  @media print{@page{size:A4;margin:16mm}}
</style></head><body><div class="page">
  <div class="brand">ARK LEARNING ARENA</div>
  <h1>Fee Receipt</h1>
  <div class="amt"><b>${esc(inr(args.amount))}</b><span>Amount received</span></div>
  <table>
    ${row("Receipt No", args.receiptNo || "—")}
    ${row("Date", formatDate(args.date))}
    ${row("Student", args.studentName)}
    ${row("Admission No", args.admissionNo || "—")}
    ${row("Class", args.className || "—")}
    ${row("Payment Method", args.method)}
    ${row("Total Fee", inr(args.totalFee))}
    ${row("Total Paid", inr(args.totalPaid))}
    ${row("Balance", inr(args.pending))}
  </table>
  <p class="foot">Computer-generated receipt · ARK Learning Arena</p>
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`;
};

export const ParentFeesPage = () => {
  const { parent } = useAuth();
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const { data: insights, isLoading, error } = useChildInsights(student?.id);
  const fee = insights?.fee;

  const printReceipt = (r: { id: string; amount: number; date: string; method: string; receiptNo?: string }) => {
    if (!student || !fee) return;
    const win = openReportWindow();
    if (!win) return;
    renderReportWindow(
      receiptHtml({
        studentName: student.name,
        admissionNo: student.enrolmentNo || student.grNo,
        className: [student.standardName, student.section].filter(Boolean).join(" · "),
        receiptNo: r.receiptNo,
        date: r.date,
        amount: r.amount,
        method: r.method,
        totalPaid: fee.received,
        totalFee: fee.total,
        pending: fee.pending,
      }),
      win,
    );
    if (parent) {
      void parentAuditService.log({
        parentAccountId: parent.accountId,
        studentId: student.id,
        event: "download_receipt",
        detail: r.receiptNo ?? r.id,
      });
    }
  };

  if (!activeChild || !student) return null;

  const paidPct = fee && fee.total > 0 ? Math.round((fee.received / fee.total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Fees" subtitle={student.name} />

      {isLoading && <LoadingTiles count={4} />}
      {error && <ErrorState error={error as Error} />}

      {!isLoading && !error && !fee && (
        <EmptyState
          title="No fee record assigned yet"
          hint="Your child has not been assigned a fee structure. Please contact the office if you expected one."
          icon={<CreditCard className="w-9 h-9" />}
        />
      )}

      {fee && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatTile label="Total fee" value={inr(fee.total)} />
            <StatTile label="Discount" value={inr(fee.discount)} hint="Scholarship / concession" />
            <StatTile label="Collected" value={inr(fee.received)} tone="good" />
            <StatTile
              label="Pending"
              value={inr(fee.pending)}
              tone={fee.pending > 0 ? "bad" : "good"}
            />
          </div>

          <Card className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <SectionTitle>Collection progress</SectionTitle>
              <Chip tone={fee.pending <= 0 ? "good" : fee.received > 0 ? "warn" : "bad"}>
                {fee.pending <= 0 ? "Fully paid" : fee.received > 0 ? "Partially paid" : "Unpaid"}
              </Chip>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, paidPct)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {paidPct}% collected · {inr(fee.received)} of {inr(fee.total)}
            </p>
          </Card>

          <Card>
            <SectionTitle>Payment history</SectionTitle>
            {fee.receipts.length === 0 ? (
              <EmptyState
                title="No payments recorded yet"
                icon={<Receipt className="w-8 h-8" />}
              />
            ) : (
              <div className="space-y-2">
                {fee.receipts.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground tabular-nums">
                        {inr(r.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDate(r.date)} · {r.method}
                        {r.receiptNo ? ` · ${r.receiptNo}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => printReceipt(r)}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors"
                    >
                      <Receipt className="w-3.5 h-3.5" /> Receipt
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ONLINE PAYMENT — intentionally absent. Smart ARK has no payment
              gateway integration (no order/settlement tables, no PSP keys, no
              webhook handler), so a "Pay now" button here could only be a
              dead link or an unreconciled redirect. Collection stays with the
              office until a gateway is integrated in the Fee module itself. */}
          {fee.pending > 0 && (
            <Card className="mt-4">
              <SectionTitle>Paying the balance</SectionTitle>
              <p className="text-sm text-muted-foreground">
                {inr(fee.pending)} is outstanding. Payments are collected at the institution office;
                your receipt appears here automatically once recorded.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default ParentFeesPage;
