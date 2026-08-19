// ──────────────────────────────────────────────────────────────────────────────
// TENANT BILLING DASHBOARD
//
// The page an organization admin uses to see their plan, usage and invoices,
// and to pay. Deliberately reachable while SUSPENDED — suspension hides tenant
// data, not the means to settle the invoice that lifts it.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, AlertTriangle, CheckCircle2, Clock, Download, Loader2, Tag, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { billingService, type BillingSummary, type CheckoutSession } from "../services/billing.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { invoiceDownloadService } from "../documents/invoiceDownload.service";

const money = (n: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

const METRIC_LABEL: Record<string, string> = {
  students: "Students", staff: "Staff", branches: "Branches",
  storage_mb: "Storage (MB)", whatsapp: "WhatsApp messages", email: "Emails",
};

/**
 * Download one invoice as a GST tax invoice PDF.
 *
 * This button used to render only when `invoices.pdf_path` was populated — and
 * nothing has ever populated it, so it was permanently invisible and a customer
 * had no way to obtain the document they need for input tax credit.
 *
 * The PDF is now built at click time from the invoice row, by the same renderer
 * the platform console uses. No storage, no signed URL, no bucket policy, and
 * no possibility of the stored copy drifting from the record. `pdf_path` stays
 * on the table for a provider-hosted copy if one ever exists.
 */
const InvoiceDownloadButton: React.FC<{ id: string; number: string }> = ({ id, number }) => {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await invoiceDownloadService.download(id);
        } catch (e) {
          toast.error((e as Error).message || "Could not build the invoice PDF.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      <span className="sr-only">Download {number}</span>
    </Button>
  );
};

const BillingPage: React.FC = () => {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [coupon, setCoupon] = useState("");
  const [paying, setPaying] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["billing", "summary"],
    queryFn: () => billingService.summary(),
    staleTime: 30_000,
  });

  const applyCoupon = useMutation({
    mutationFn: (code: string) => billingService.applyCoupon(code),
    onSuccess: (r) => {
      if (!r.ok) { toast.error(r.error ?? "Coupon could not be applied"); return; }
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success(`Coupon applied — ${money(r.discount ?? 0)} off`);
      setCoupon("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => billingService.cancelSubscription(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success(`Auto-renew off. Access continues until ${r.accessUntil}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Open Razorpay Checkout.
   *
   * The handler does NOT mark anything paid. It confirms the handshake so the
   * UI can say "received", then waits for the webhook — which is the only
   * thing that activates a subscription.
   */
  const pay = async (planCode: string, interval: string, recurring: boolean) => {
    setPaying(true);
    try {
      const loaded = await billingService.loadCheckoutScript();
      if (!loaded) throw new Error("Could not load the payment window. Check your connection and try again.");

      const session: CheckoutSession = recurring
        ? await billingService.createSubscription(planCode, interval)
        : await billingService.createOrder(planCode, interval);

      // deno-lint-ignore no-explicit-any
      const Razorpay = (window as any).Razorpay;
      const rzp = new Razorpay({
        key: session.keyId,
        name: "Smart ARK",
        description: `${planCode} · ${interval}`,
        ...(session.orderId ? { order_id: session.orderId } : {}),
        ...(session.subscriptionId ? { subscription_id: session.subscriptionId } : {}),
        prefill: {
          email: session.prefill.email ?? undefined,
          name: session.prefill.name ?? undefined,
        },
        theme: { color: "#2563eb" },
        handler: async (res: Record<string, string>) => {
          try {
            const v = await billingService.verifyPayment(
              res.razorpay_order_id, res.razorpay_payment_id, res.razorpay_signature,
            );
            toast.success("Payment received", { description: v.message, duration: 8000 });
          } finally {
            // Refetch shortly: the webhook usually lands within a second or
            // two, and this is what turns the badge green without a reload.
            setTimeout(() => qc.invalidateQueries({ queryKey: ["billing"] }), 2500);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.open();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading billing…
      </div>
    );
  }
  if (!summary) {
    return <div className="p-10 text-sm text-muted-foreground">Billing is not available for this organization.</div>;
  }

  const s = summary.subscription;
  const org = summary.organization;
  const suspended = org.status === "suspended";
  const pastDue = org.status === "past_due";
  const trialing = s?.status === "trialing";

  const daysLeft = (iso: string | null | undefined) =>
    iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : null;

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">{org.name}</p>
      </div>

      {/* ── State banners ──────────────────────────────────────────────── */}
      {suspended && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <XCircle className="h-4 w-4" /> Your account is suspended
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Access to your data is paused because a payment is outstanding.
            <strong> Nothing has been deleted.</strong> Settling the invoice below
            restores everything immediately.
          </p>
        </div>
      )}

      {pastDue && !suspended && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" /> Payment overdue
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {s?.grace_until
              ? `Full access continues for ${daysLeft(s.grace_until)} more day(s).`
              : "Please settle your outstanding invoice."}
          </p>
        </div>
      )}

      {trialing && (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="flex items-center gap-2 font-medium">
            <Clock className="h-4 w-4 text-primary" />
            Trial — {daysLeft(s?.trial_ends_at)} day(s) remaining
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a plan any time. Your data stays yours either way, and you can export it whenever you like.
          </p>
        </div>
      )}

      <Tabs defaultValue="plan">
        <TabsList>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="profile">Billing details</TabsTrigger>
        </TabsList>

        {/* ── Plan ─────────────────────────────────────────────────────── */}
        <TabsContent value="plan" className="mt-4 space-y-4">
          <div className="rounded-lg border border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Current plan</div>
                <div className="text-lg font-semibold">{s?.plan.name ?? "No plan"}</div>
                {s && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    {money(s.amount, s.currency)} / {s.interval.replace("_", " ")}
                    {s.discount > 0 && (
                      <span className="ml-2 text-primary">−{money(s.discount, s.currency)} discount</span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-right text-sm">
                <div className="text-muted-foreground">
                  {s?.current_period_end ? "Renews" : "Status"}
                </div>
                <div className="font-medium">
                  {s?.current_period_end ?? s?.status ?? "—"}
                </div>
                {s && !s.auto_renew && (
                  <div className="text-xs text-amber-600 dark:text-amber-400">Auto-renew off</div>
                )}
              </div>
            </div>

            {summary.credits > 0 && (
              <p className="mt-3 text-sm text-primary">
                {money(summary.credits)} in referral credit will apply to your next invoice.
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => pay(s?.plan.code ?? "growth", s?.interval ?? "yearly", true)} disabled={paying}>
                <CreditCard className="mr-1.5 h-4 w-4" />
                {suspended || pastDue ? "Pay now" : trialing ? "Subscribe" : "Renew with auto-pay"}
              </Button>
              <Button
                variant="outline"
                onClick={() => pay(s?.plan.code ?? "growth", s?.interval ?? "yearly", false)}
                disabled={paying}
              >
                Pay once (no auto-renew)
              </Button>
              {s?.auto_renew && !suspended && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Turn off auto-renew?",
                      description:
                        "You keep full access until the end of the period you have already paid for. Nothing is deleted.",
                      confirmText: "Turn off",
                    });
                    if (ok) cancel.mutate();
                  }}
                >
                  Cancel auto-renew
                </Button>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-border pt-4">
              <div className="flex-1 min-w-[180px]">
                <Label htmlFor="coupon">Have a coupon?</Label>
                <Input
                  id="coupon" value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                  placeholder="LAUNCH25"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => applyCoupon.mutate(coupon)}
                disabled={!coupon.trim() || applyCoupon.isPending}
              >
                <Tag className="mr-1.5 h-3.5 w-3.5" /> Apply
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Payments are processed by Razorpay. Your subscription activates when Razorpay
            confirms the payment to us directly — not from this page — which is what keeps
            it impossible to activate without paying.
          </p>
        </TabsContent>

        {/* ── Usage ────────────────────────────────────────────────────── */}
        <TabsContent value="usage" className="mt-4">
          <div className="space-y-3">
            {Object.entries(summary.usage ?? {}).map(([metric, u]) => (
              <div key={metric} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{METRIC_LABEL[metric] ?? metric}</span>
                  {/* `used` was assumed non-null and arrived as null from
                      usage_status(), which crashed the whole Settings module
                      through the error boundary. The database is fixed
                      (20260911_phase5c), but a settings screen must not be one
                      unexpected null away from white-screening — a missing
                      number is a dash, not an outage. */}
                  <span className="tabular-nums text-muted-foreground">
                    {typeof u?.used === "number" ? u.used.toLocaleString("en-IN") : "—"}
                    {typeof u?.limit === "number"
                      ? ` / ${u.limit.toLocaleString("en-IN")}`
                      : " · unlimited"}
                  </span>
                </div>
                {u.limit != null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        u.over ? "bg-destructive" : u.warn ? "bg-amber-500" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(u.percent ?? 0, 100)}%` }}
                    />
                  </div>
                )}
                {u.warn && !u.over && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    Approaching your plan limit — upgrade when convenient.
                  </p>
                )}
                {u.over && (
                  <p className="mt-1.5 text-xs text-destructive">
                    Over your plan limit. Existing records are untouched; new ones are blocked
                    until you upgrade.
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Message and email allowances never block sending — they bill as overage, because
            cutting off absence alerts mid-term is the wrong trade.
          </p>
        </TabsContent>

        {/* ── Invoices ─────────────────────────────────────────────────── */}
        <TabsContent value="invoices" className="mt-4">
          {!summary.invoices?.length ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No invoices yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Invoice history</caption>
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Invoice</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Period</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.invoices.map((i) => (
                    <tr key={i.id}>
                      <th scope="row" className="px-4 py-2.5 text-left font-mono text-xs font-normal">
                        {i.number}
                      </th>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {i.period_start ?? "—"} → {i.period_end ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {money(i.total, i.currency)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 text-xs",
                          i.status === "paid" ? "text-emerald-600 dark:text-emerald-400"
                          : i.status === "overdue" ? "text-destructive" : "text-muted-foreground",
                        )}>
                          {i.status === "paid" && <CheckCircle2 className="h-3 w-3" />}
                          {i.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <InvoiceDownloadButton id={i.id} number={i.number} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Billing profile ──────────────────────────────────────────── */}
        <TabsContent value="profile" className="mt-4">
          <BillingProfileForm profile={summary.billing_profile} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

/**
 * GST identity.
 *
 * The state CODE (not name) drives the CGST/SGST vs IGST split, so it is a
 * required, explicit field rather than something derived from a free-text
 * address — matching "Tamilnadu" against "Tamil Nadu" is how tax gets
 * computed wrong on a real invoice.
 */
const BillingProfileForm: React.FC<{ profile: Record<string, unknown> | null }> = ({ profile }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    legal_name: String(profile?.legal_name ?? ""),
    gstin: String(profile?.gstin ?? ""),
    billing_email: String(profile?.billing_email ?? ""),
    billing_phone: String(profile?.billing_phone ?? ""),
    address_line1: String(profile?.address_line1 ?? ""),
    city: String(profile?.city ?? ""),
    state_code: String(profile?.state_code ?? ""),
    state_name: String(profile?.state_name ?? ""),
    postal_code: String(profile?.postal_code ?? ""),
  });

  const save = useMutation({
    mutationFn: () => billingService.saveBillingProfile(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success("Billing details saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 rounded-lg border border-border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="legal_name">Legal entity name</Label>
          <Input id="legal_name" value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="gstin">GSTIN</Label>
          <Input id="gstin" value={form.gstin} placeholder="33AAAAA0000A1Z5"
            onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Optional, but required for input tax credit on your invoices.
          </p>
        </div>
        <div>
          <Label htmlFor="state_code">GST state code</Label>
          <Input id="state_code" value={form.state_code} placeholder="33"
            onChange={(e) => setForm({ ...form, state_code: e.target.value })} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Determines CGST+SGST vs IGST on your invoice.
          </p>
        </div>
        <div>
          <Label htmlFor="billing_email">Billing email</Label>
          <Input id="billing_email" type="email" value={form.billing_email}
            onChange={(e) => setForm({ ...form, billing_email: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="billing_phone">Billing phone</Label>
          <Input id="billing_phone" value={form.billing_phone}
            onChange={(e) => setForm({ ...form, billing_phone: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="address_line1">Address</Label>
          <Input id="address_line1" value={form.address_line1}
            onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="postal_code">PIN code</Label>
          <Input id="postal_code" value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
        </div>
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending || !form.legal_name}>
        Save billing details
      </Button>
    </div>
  );
};

export default BillingPage;
