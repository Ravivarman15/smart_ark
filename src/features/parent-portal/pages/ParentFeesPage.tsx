// ── Parent Portal — Fees ─────────────────────────────────────────────────────
// Reads the Fee module's student_fees + fee_installments through the shared
// insights bundle, so the ledger a parent sees is byte-for-byte the ledger the
// front desk sees.

import { Suspense, lazy, useEffect, useState } from "react";
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
import type { ReceiptData } from "@/features/fee";

// ┌── THE RECEIPT OPENS IN PLACE, NOT IN A NEW TAB ────────────────────────┐
// │ Two earlier shapes were both wrong for a parent:                       │
// │                                                                        │
// │  1. This page hand-built its own receipt HTML — a plain table with its │
// │     own fields and footer. Tenant-branded, so not WRONG, but a SECOND  │
// │     design: the proof of payment a parent downloaded looked nothing    │
// │     like the receipt the front desk issues for the same payment, and   │
// │     every improvement to the real receipt skipped this one.            │
// │                                                                        │
// │  2. It then rendered the canonical receipt into a POPUP WINDOW. Right  │
// │     document, wrong delivery: a parent tapping "Receipt" on a phone    │
// │     got a new tab and, half the time, a pop-up blocker warning         │
// │     instead of their receipt.                                          │
// │                                                                        │
// │ It now opens `FeeReceiptDialog` inline — the exact component the staff │
// │ receipt uses (StudentProfileDrawer mounts it the same way), with its   │
// │ own Print and Download PDF/PNG actions. Nothing to unblock, nothing to │
// │ navigate away from.                                                     │
// │                                                                        │
// │ LAZY, deliberately: the dialog pulls html2canvas + jsPDF (~600 kB) for │
// │ its download actions. A static import would put that in the bundle of  │
// │ a page parents open on mobile data to check a balance. It is prefetched│
// │ as soon as we know receipts exist, so the click still feels instant.   │
// └────────────────────────────────────────────────────────────────────────┘
const loadReceiptDialog = () =>
  import("@/features/fee/components/FeeReceiptDialog").then((m) => ({
    default: m.FeeReceiptDialog,
  }));
const FeeReceiptDialog = lazy(loadReceiptDialog);

export const ParentFeesPage = () => {
  const { parent } = useAuth();
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const { data: insights, isLoading, error } = useChildInsights(student?.id);
  const fee = insights?.fee;
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  // Warm the dialog chunk once we know this child actually has receipts, so the
  // first tap opens instantly rather than waiting on a network round-trip.
  const hasReceipts = (fee?.receipts.length ?? 0) > 0;
  useEffect(() => {
    if (hasReceipts) void loadReceiptDialog();
  }, [hasReceipts]);

  const openReceipt = (r: {
    id: string;
    amount: number;
    date: string;
    method: string;
    receiptNo?: string;
  }) => {
    if (!student || !fee) return;

    setReceipt({
      receiptNo: r.receiptNo ?? "—",
      studentName: student.name,
      // The receipt labels this "Class & Batch"; the parent's own child record
      // is the only source available here.
      batchName:
        [student.standardName, student.section].filter(Boolean).join(" · ") || undefined,
      amount: r.amount,
      paymentMethod: r.method,
      date: formatDate(r.date),
      amountReceivedToDate: fee.received,
      amountPending: fee.pending,
    });

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
                      onClick={() => openReceipt(r)}
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

      {/* Mounted only once a receipt is chosen, so the lazy chunk is never
          fetched for a parent who only ever looks at the balance. `null`
          fallback rather than a spinner: the chunk is prefetched above, so a
          flash of loading UI would be noise in the common case. */}
      {receipt && (
        <Suspense fallback={null}>
          <FeeReceiptDialog receipt={receipt} onOpenChange={(o) => !o && setReceipt(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default ParentFeesPage;
