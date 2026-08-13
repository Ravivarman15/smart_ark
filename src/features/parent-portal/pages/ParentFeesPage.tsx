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
import { toast } from "sonner";
import { closeReportWindow, openReportWindow, renderReportWindow } from "@/lib/reportWindow";
import { useDocumentBranding } from "@/features/branding/documents";
import { receiptToBrandedPrintHtml } from "@/features/fee/utils/receipt";

// ┌── ONE RECEIPT DESIGN, NOT TWO ─────────────────────────────────────────┐
// │ This page used to hand-build its own receipt HTML — a simple table with │
// │ its own field list and footer. It was tenant-branded, so it was not     │
// │ wrong, but it was a SECOND design: the proof of payment a parent        │
// │ downloaded looked nothing like the receipt the front desk issues for    │
// │ the very same payment, and every improvement to the real receipt        │
// │ silently skipped the parent-facing one.                                 │
// │                                                                         │
// │ It now renders the canonical `ReceiptBody` — the same component behind  │
// │ the staff receipt dialog and the emailed PDF — via                      │
// │ `receiptToBrandedPrintHtml`. Three delivery routes, one document.       │
// │                                                                         │
// │ The window is opened SYNCHRONOUSLY before the await: a popup opened     │
// │ after an await is blocked, which is the app-wide blank-print bug that   │
// │ `openReportWindow` exists to prevent.                                    │
// └─────────────────────────────────────────────────────────────────────────┘

export const ParentFeesPage = () => {
  const { parent } = useAuth();
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const { data: insights, isLoading, error } = useChildInsights(student?.id);
  const fee = insights?.fee;
  const { branding } = useDocumentBranding();

  const printReceipt = async (r: {
    id: string;
    amount: number;
    date: string;
    method: string;
    receiptNo?: string;
  }) => {
    if (!student || !fee) return;
    const win = openReportWindow();
    if (!win) return;

    try {
      const html = await receiptToBrandedPrintHtml(
        {
          receiptNo: r.receiptNo ?? "—",
          studentName: student.name,
          // The dialog labels this "Class & Batch"; the parent's own child
          // record is the only source available here.
          batchName:
            [student.standardName, student.section].filter(Boolean).join(" · ") || undefined,
          amount: r.amount,
          paymentMethod: r.method,
          date: formatDate(r.date),
          amountReceivedToDate: fee.received,
          amountPending: fee.pending,
        },
        branding,
      );
      renderReportWindow(html, win);
    } catch (err) {
      // Never leave the parent staring at the "Preparing your report…"
      // placeholder forever if the off-screen render throws.
      console.error("Failed to render receipt:", err);
      closeReportWindow(win);
      toast.error("Could not prepare the receipt. Please try again.");
      return;
    }

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
