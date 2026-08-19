// ──────────────────────────────────────────────────────────────────────────────
// INVOICES — /platform/invoices
//
// Phase 5 built the whole engine: `issue_invoice()` draws a number from the
// row-locked `invoice_sequences` counter, `compute_gst()` decides the split
// from state codes, and the Razorpay webhook issues on capture. What never
// existed was anywhere to LOOK at the result — which is why the page said the
// tables were unwritten long after they were being written.
//
// ┌── THE CONSOLE PROVES THE SEQUENCE, IT DOES NOT ASSERT IT ──────────────┐
// │ Gapless numbering is a GST requirement and the design guarantees it by │
// │ construction. That guarantee only covers numbers drawn through that    │
// │ one function. A row inserted by hand, a number edited, or a restore    │
// │ that replayed the invoices without the counter all break it SILENTLY,  │
// │ and an auditor finding the gap first is the expensive way to learn.    │
// │ So the check is recomputed on every load and the page refuses to look  │
// │ clean when it is not.                                                  │
// └────────────────────────────────────────────────────────────────────────┘
//
// There is deliberately no form that accepts a number, and no delete. Numbers
// come from the database or not at all, and a wrong invoice is corrected by
// void + reissue — which leaves both numbers in the series, where GST needs
// them.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";
import { Download, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader, StatTile, StatusPill, LoadingBlock, EmptyState, formatMoney,
} from "../components/PlatformShell";
import {
  useInvoices, useInvoiceLines, useInvoiceSequences, useIssueInvoice,
  useSetInvoiceStatus, useOrganizations, useSubscriptions,
} from "../hooks/usePlatform";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import {
  checkInvoiceIntegrity, describeIssue, type IntegrityReport,
} from "../modules/invoiceIntegrity";
import type { InvoiceStatus, PlatformInvoice } from "../services/platform.service";
import { invoiceDownloadService } from "@/features/billing/documents/invoiceDownload.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";

const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "issued", "paid", "void", "refunded"];

/** What each treatment means, for the operator rather than for the invoice. */
const TREATMENT_LABEL: Record<string, string> = {
  cgst_sgst: "CGST + SGST (intra-state)",
  igst: "IGST (inter-state)",
  export: "Export — zero-rated",
  sez: "SEZ — zero-rated under LUT",
  reverse_charge: "Reverse charge — recipient pays",
};

const fmtDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/**
 * Overdue is a fact about the clock, not a stored status.
 *
 * Nothing sweeps `issued` rows into `overdue`, so trusting the column would
 * show a three-month-old unpaid invoice as merely "issued".
 */
const isOverdue = (i: PlatformInvoice): boolean =>
  (i.status === "issued" || i.status === "overdue") &&
  !!i.dueAt &&
  new Date(i.dueAt).getTime() < Date.now();

// ── Integrity panel ─────────────────────────────────────────────────────────

const IntegrityPanel: React.FC<{ report: IntegrityReport }> = ({ report }) => {
  if (report.series.length === 0) return null;

  if (report.ok) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <div className="font-medium">Numbering verified</div>
          <p className="mt-0.5 text-muted-foreground">
            {report.series.length} series checked. Every number the counter issued has exactly one
            invoice, and no invoice is numbered past its counter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0">
          <div className="font-medium">
            {report.seriesWithIssues} of {report.series.length} series failed the gapless check
          </div>
          <p className="mt-0.5 text-muted-foreground">
            A gap in an invoice series is a statutory exposure, not a display bug. Resolve it before
            the next GST filing.
          </p>
          <div className="mt-2 space-y-2">
            {report.series
              .filter((s) => !s.ok)
              .map((s) => (
                <div
                  key={`${s.organizationId}-${s.financialYear}`}
                  className="rounded border border-border bg-background p-2"
                >
                  <div className="text-xs font-medium">
                    {s.organizationName} · {s.financialYear} · prefix {s.prefix} · counter at{" "}
                    {s.lastNumber}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {s.issues.map((issue, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground">
                        {describeIssue(issue)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Issue dialog ────────────────────────────────────────────────────────────

const IssueInvoiceDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const { data: orgs } = useOrganizations();
  const { data: subs } = useSubscriptions();
  const issue = useIssueInvoice();

  const [orgId, setOrgId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setOrgId("");
      setAmount("");
      setDescription("");
    }
  }, [open]);

  /**
   * Only organizations with a billable subscription.
   *
   * `issue_invoice()` raises without one, so offering the rest produces a
   * dialog that fails on submit rather than one that never offered the
   * impossible choice.
   */
  const billable = useMemo(() => {
    const withSub = new Set(
      (subs ?? [])
        .filter((s) => ["trialing", "active", "past_due", "grace"].includes(String(s.status)))
        .map((s) => String(s.organization_id)),
    );
    return (orgs ?? []).filter((o) => withSub.has(o.id));
  }, [orgs, subs]);

  const sub = useMemo(
    () => (subs ?? []).find((s) => String(s.organization_id) === orgId),
    [subs, orgId],
  );
  const subAmount = sub ? Number(sub.amount ?? 0) - Number(sub.discount_amount ?? 0) : null;

  const submit = async () => {
    await issue.mutateAsync({
      organizationId: orgId,
      amount: amount.trim() === "" ? null : Number(amount),
      description: description.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue an invoice</DialogTitle>
          <DialogDescription>
            The number is drawn inside the database at issuance, so this cannot create a gap — and
            it cannot be undone. A wrong invoice is corrected by voiding it and issuing another.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Organization</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an organization" />
              </SelectTrigger>
              <SelectContent>
                {billable.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {billable.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                No organization has a billable subscription. An invoice is raised against a
                subscription, so there is nothing to invoice yet.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-amount">Taxable amount</Label>
            <Input
              id="inv-amount"
              type="number"
              min={0}
              value={amount}
              placeholder={subAmount == null ? "Subscription amount" : String(subAmount)}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Leave blank to bill the subscription
              {subAmount == null
                ? "'s own amount less its discount"
                : ` amount of ${formatMoney(subAmount)}`}
              . GST is added on top, split from the billing profile's state code.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-desc">Line description</Label>
            <Input
              id="inv-desc"
              value={description}
              placeholder="Defaults to the plan name and billing interval"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!orgId || issue.isPending}>
            {issue.isPending ? "Issuing…" : "Issue invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Detail dialog ───────────────────────────────────────────────────────────

const InvoiceDetail: React.FC<{
  invoice: PlatformInvoice | null;
  onClose: () => void;
  canManage: boolean;
}> = ({ invoice, onClose, canManage }) => {
  const { data: lines, isLoading } = useInvoiceLines(invoice?.id);
  const setStatus = useSetInvoiceStatus();
  const confirm = useConfirm();
  const [downloading, setDownloading] = useState(false);

  if (!invoice) return null;

  // Re-reads the row rather than rendering the one in memory — see
  // invoiceDownload.service. One shape of invoice, whoever asks for it.
  const download = async () => {
    setDownloading(true);
    try {
      await invoiceDownloadService.download(invoice.id);
    } catch (e) {
      toast.error((e as Error).message || "Could not build the invoice PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const doVoid = async () => {
    const ok = await confirm({
      title: `Void ${invoice.number}?`,
      description:
        "The number stays in the series — that is what keeps the sequence gapless. The invoice is marked void and is no longer payable. Issue a fresh invoice for the corrected amount.",
      confirmText: "Void invoice",
      type: "danger",
    });
    if (ok) await setStatus.mutateAsync({ id: invoice.id, status: "void" });
  };

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium tabular-nums">{v}</dd>
    </div>
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {invoice.number}
            <StatusPill status={isOverdue(invoice) ? "past_due" : invoice.status} />
          </DialogTitle>
          <DialogDescription>
            {invoice.organizationName} · {invoice.financialYear ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <dl>
              {row("Issued", fmtDate(invoice.issuedAt))}
              {row("Due", fmtDate(invoice.dueAt))}
              {row("Paid", fmtDate(invoice.paidAt))}
              {row("Period", `${fmtDate(invoice.periodStart)} — ${fmtDate(invoice.periodEnd)}`)}
            </dl>
            <dl>
              {row(
                "Treatment",
                invoice.gstTreatment
                  ? (TREATMENT_LABEL[invoice.gstTreatment] ?? invoice.gstTreatment)
                  : "—",
              )}
              {row("Place of supply", invoice.placeOfSupply ?? "—")}
              {row("Customer GSTIN", invoice.gstin ?? "Unregistered")}
              {row("Provider", invoice.provider ?? "—")}
            </dl>
          </div>

          <div className="rounded-lg border border-border">
            <table className="w-full text-xs">
              <caption className="sr-only">Invoice lines</caption>
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Description</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">HSN/SAC</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Qty</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-muted-foreground">Loading…</td>
                  </tr>
                ) : (lines ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                      No lines recorded.
                    </td>
                  </tr>
                ) : (
                  (lines ?? []).map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">{l.description}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{l.hsnSac ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(l.amount, invoice.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <dl className="ml-auto max-w-xs">
            {row("Taxable value", formatMoney(invoice.subtotal, invoice.currency))}
            {invoice.discountTotal > 0 &&
              row("Discount", `− ${formatMoney(invoice.discountTotal, invoice.currency)}`)}
            {/* Only the components that apply are shown. "IGST 0.00" beside a
                CGST figure invites the reader to wonder which is the mistake. */}
            {invoice.cgst > 0 && row("CGST", formatMoney(invoice.cgst, invoice.currency))}
            {invoice.sgst > 0 && row("SGST", formatMoney(invoice.sgst, invoice.currency))}
            {invoice.igst > 0 && row("IGST", formatMoney(invoice.igst, invoice.currency))}
            {invoice.taxTotal === 0 && row("Tax", "Nil")}
            <div className="mt-1 flex justify-between gap-4 border-t border-border pt-2 text-base">
              <dt className="font-medium">Total</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(invoice.total, invoice.currency)}
              </dd>
            </div>
          </dl>

          {invoice.notes && <p className="text-xs text-muted-foreground">{invoice.notes}</p>}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={download} disabled={downloading || isLoading}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {downloading ? "Building…" : "Download PDF"}
          </Button>
          {canManage && invoice.status !== "void" && (
            <div className="flex gap-2">
              {invoice.status !== "paid" && (
                <Button
                  variant="outline"
                  onClick={() => setStatus.mutate({ id: invoice.id, status: "paid" })}
                  disabled={setStatus.isPending}
                >
                  Mark paid
                </Button>
              )}
              <Button variant="destructive" onClick={doVoid} disabled={setStatus.isPending}>
                Void
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────

export const InvoicesPage: React.FC = () => {
  const { can } = usePlatformAuth();
  const { data: invoices, isLoading } = useInvoices();
  const { data: sequences } = useInvoiceSequences();
  const [status, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PlatformInvoice | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);

  const canManage = can("billing.manage");

  const orgName = useMemo(() => {
    const m = new Map((invoices ?? []).map((i) => [i.organizationId, i.organizationName]));
    return (id: string) => m.get(id) ?? id;
  }, [invoices]);

  const integrity = useMemo(
    () => checkInvoiceIntegrity(invoices ?? [], sequences ?? [], orgName),
    [invoices, sequences, orgName],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoices ?? []).filter((i) => {
      if (status === "overdue") {
        if (!isOverdue(i)) return false;
      } else if (status !== "all" && i.status !== status) {
        return false;
      }
      if (!q) return true;
      return (
        i.number.toLowerCase().includes(q) ||
        i.organizationName.toLowerCase().includes(q) ||
        i.organizationSlug.toLowerCase().includes(q)
      );
    });
  }, [invoices, status, search]);

  // Voided invoices are excluded from every total. They are cancelled
  // documents; counting them overstates both what was billed and what is owed.
  const live = (invoices ?? []).filter((i) => i.status !== "void");
  const billed = live.reduce((s, i) => s + i.total, 0);
  const collected = live.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const overdueRows = live.filter(isOverdue);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="GST tax invoices raised against subscriptions. Numbers are drawn inside the database, gapless per organization and financial year."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setIssueOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Issue invoice
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Invoices"
            value={live.length}
            hint={`${(invoices ?? []).length - live.length} voided`}
          />
          <StatTile label="Billed" value={formatMoney(billed)} hint="Excludes voided invoices" />
          <StatTile
            label="Recorded paid"
            value={formatMoney(collected)}
            tone={collected > 0 ? "positive" : "default"}
          />
          <StatTile
            label="Overdue"
            value={overdueRows.length}
            hint={
              overdueRows.length
                ? formatMoney(overdueRows.reduce((s, i) => s + i.total, 0))
                : "Nothing past due"
            }
            tone={overdueRows.length > 0 ? "warning" : "default"}
          />
        </div>

        <IntegrityPanel report={integrity} />

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number or organization…"
            className="h-8 max-w-xs"
          />
          <Select value={status} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              {INVOICE_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <LoadingBlock />
        ) : visible.length === 0 ? (
          <EmptyState
            title={(invoices ?? []).length === 0 ? "No invoices yet" : "No invoices match"}
            description={
              (invoices ?? []).length === 0
                ? "Invoices are raised automatically when a payment is captured, or manually from this page. Neither has happened yet."
                : "Adjust the search or the status filter."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Invoices</caption>
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Number</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Organization</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Issued</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Due</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Tax</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((i) => (
                  <tr
                    key={i.id}
                    onClick={() => setSelected(i)}
                    className="cursor-pointer hover:bg-muted/40"
                  >
                    <td className="px-4 py-2 font-mono text-xs">{i.number}</td>
                    <td className="px-4 py-2">{i.organizationName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(i.issuedAt)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(i.dueAt)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {i.taxTotal === 0 ? "Nil" : formatMoney(i.taxTotal, i.currency)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {formatMoney(i.total, i.currency)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill status={isOverdue(i) ? "past_due" : i.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Marking an invoice paid records a receipt; it does not collect money. Payments captured
          through Razorpay set it automatically via the webhook.
        </p>
      </div>

      <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} canManage={canManage} />
      <IssueInvoiceDialog open={issueOpen} onOpenChange={setIssueOpen} />
    </div>
  );
};

export default InvoicesPage;
