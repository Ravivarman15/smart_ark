// ──────────────────────────────────────────────────────────────────────────────
// COMMERCE PAGES — plans, pricing, subscriptions, coupons, invoices, revenue.
//
// Management only. No payment gateway anywhere in Phase 2, by instruction:
// nothing here charges a card, and `invoices` is a reserved shape that Phase 5
// will populate. Pages that depend on that phase say so plainly rather than
// rendering a plausible-looking empty table.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  PageHeader, StatTile, StatusPill, LoadingBlock, EmptyState, ReservedNotice, formatMoney,
} from "../components/PlatformShell";
import {
  usePlans, usePlanPrices, useSubscriptions, useCoupons, useSaveCoupon,
} from "../hooks/usePlatform";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const lim = (v: number | null) => (v == null ? "Unlimited" : v.toLocaleString("en-IN"));

// ── Plans ───────────────────────────────────────────────────────────────────

export const PlansPage: React.FC = () => {
  const { data: plans, isLoading } = usePlans();
  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="Plans" description="Tier definitions and limits. Plans are data — a custom plan is a row, never a code branch." />
      <div className="p-6">
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Plan</th>
                <th className="text-right font-medium px-4 py-2.5">Students</th>
                <th className="text-right font-medium px-4 py-2.5">Staff</th>
                <th className="text-right font-medium px-4 py-2.5">Branches</th>
                <th className="text-right font-medium px-4 py-2.5">Storage</th>
                <th className="text-right font-medium px-4 py-2.5">WhatsApp</th>
                <th className="text-left font-medium px-4 py-2.5">Support</th>
                <th className="text-left font-medium px-4 py-2.5">Extras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(plans ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-accent/40">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.code}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{lim(p.maxStudents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{lim(p.maxStaff)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{lim(p.maxBranches)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.maxStorageMb == null ? "Unlimited" : `${(p.maxStorageMb / 1024).toFixed(0)} GB`}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{lim(p.whatsappCredits)}</td>
                  <td className="px-4 py-2.5 capitalize text-muted-foreground">{p.supportLevel}</td>
                  <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                    {[p.allowWhiteLabel && "White-label", p.allowCustomDomain && "Custom domain",
                      p.allowMarketplace && "Marketplace"].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          `certificate`, `website` and `ai` are seeded disabled on every tier including
          Enterprise — those modules are not built, and selling them would be a refund event.
        </p>
      </div>
    </div>
  );
};

// ── Pricing ─────────────────────────────────────────────────────────────────

export const PricingPage: React.FC = () => {
  const { data: plans } = usePlans();
  const { data: prices, isLoading } = usePlanPrices();

  const byPlan = useMemo(() => {
    const m = new Map<string, typeof prices>();
    for (const p of prices ?? []) {
      const list = m.get(p.planId) ?? [];
      list.push(p);
      m.set(p.planId, list as never);
    }
    return m;
  }, [prices]);

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Pricing"
        description="Amounts are numeric(14,2) with an explicit currency — never floats. GST default 18%."
      />
      <div className="p-6 space-y-4">
        {(plans ?? []).filter((p) => byPlan.has(p.id)).map((p) => (
          <div key={p.id} className="rounded-lg border border-border p-4">
            <div className="font-medium mb-3">{p.name}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(byPlan.get(p.id) ?? []).map((pr) => (
                <div key={pr.id} className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground capitalize">
                    {pr.interval.replace("_", " ")}
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {formatMoney(pr.amount, pr.currency)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    +{pr.taxPercent}% GST
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <ReservedNotice phase="Phase 5 (Billing)">
          Charging, invoicing and dunning are out of scope here. This page manages the
          price catalogue only — no gateway is wired up.
        </ReservedNotice>
      </div>
    </div>
  );
};

// ── Subscriptions ───────────────────────────────────────────────────────────

export const SubscriptionsPage: React.FC = () => {
  const { data: subs, isLoading } = useSubscriptions();
  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="Subscriptions" description={`${subs?.length ?? 0} record(s)`} />
      <div className="p-6">
        {!subs?.length ? (
          <EmptyState title="No subscriptions" description="Provision an organization to create one." />
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Organization</th>
                  <th className="text-left font-medium px-4 py-2.5">Plan</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-left font-medium px-4 py-2.5">Interval</th>
                  <th className="text-right font-medium px-4 py-2.5">Amount</th>
                  <th className="text-left font-medium px-4 py-2.5">Period end</th>
                  <th className="text-left font-medium px-4 py-2.5">Renew</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subs.map((s) => {
                  const org = s.organizations as { display_name?: string; slug?: string } | null;
                  const plan = s.plans as { code?: string; name?: string } | null;
                  return (
                    <tr key={String(s.id)} className="hover:bg-accent/40">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{org?.display_name ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{org?.slug}</div>
                      </td>
                      <td className="px-4 py-2.5">{plan?.name ?? plan?.code ?? "—"}</td>
                      <td className="px-4 py-2.5"><StatusPill status={String(s.status)} /></td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground">
                        {String(s.interval).replace("_", " ")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatMoney(Number(s.amount ?? 0), String(s.currency ?? "INR"))}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {String(s.current_period_end ?? "—")}
                      </td>
                      <td className="px-4 py-2.5 text-xs">{s.auto_renew ? "Auto" : "Manual"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Coupons ─────────────────────────────────────────────────────────────────

export const CouponsPage: React.FC = () => {
  const { data: coupons, isLoading } = useCoupons();
  const { can } = usePlatformAuth();
  const save = useSaveCoupon();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", description: "", discountType: "percentage" as "percentage" | "fixed",
    discountValue: 10, duration: "once", maxRedemptions: "", validUntil: "",
  });

  const submit = () => {
    if (!form.code.trim()) return;
    save.mutate(
      {
        code: form.code, description: form.description || null,
        discountType: form.discountType, discountValue: Number(form.discountValue),
        duration: form.duration,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        validUntil: form.validUntil || null, isActive: true,
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Coupons"
        description="Redemption limits are enforced by a database trigger, not by the UI."
        actions={
          can("coupons.manage") ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New coupon
            </Button>
          ) : null
        }
      />
      <div className="p-6">
        {!coupons?.length ? (
          <EmptyState title="No coupons" />
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Code</th>
                  <th className="text-left font-medium px-4 py-2.5">Discount</th>
                  <th className="text-left font-medium px-4 py-2.5">Duration</th>
                  <th className="text-right font-medium px-4 py-2.5">Used</th>
                  <th className="text-left font-medium px-4 py-2.5">Valid until</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/40">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{c.code}</td>
                    <td className="px-4 py-2.5">
                      {c.discountType === "percentage"
                        ? `${c.discountValue}%`
                        : formatMoney(c.discountValue)}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-muted-foreground">{c.duration}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {c.redemptionCount}
                      {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {c.validUntil ? c.validUntil.slice(0, 10) : "No expiry"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={c.isActive ? "active" : "cancelled"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New coupon</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="code">Code</Label>
              <Input
                id="code" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="LAUNCH25"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select
                  value={form.discountType}
                  onValueChange={(v) => setForm({ ...form, discountType: v as "percentage" | "fixed" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="value">Value</Label>
                <Input
                  id="value" type="number" value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duration</Label>
                <Select value={form.duration} onValueChange={(v) => setForm({ ...form, duration: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once</SelectItem>
                    <SelectItem value="recurring">Recurring</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="max">Max redemptions</Label>
                <Input
                  id="max" type="number" value={form.maxRedemptions}
                  onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="until">Valid until</Label>
              <Input
                id="until" type="date" value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending || !form.code.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Revenue ─────────────────────────────────────────────────────────────────

export const RevenuePage: React.FC = () => {
  const { data: subs } = useSubscriptions();

  // MRR from the live subscription book. This is CONTRACTED revenue, not
  // collected cash — there is no gateway yet, so nothing here has been paid.
  // Labelling it correctly matters more than the number.
  const mrr = useMemo(() => {
    let m = 0;
    for (const s of subs ?? []) {
      if (!["active", "past_due", "grace"].includes(String(s.status))) continue;
      const amount = Number(s.amount ?? 0);
      const perMonth =
        s.interval === "yearly" ? amount / 12
        : s.interval === "half_yearly" ? amount / 6
        : s.interval === "quarterly" ? amount / 3
        : amount;
      m += perMonth;
    }
    return m;
  }, [subs]);

  const trialing = (subs ?? []).filter((s) => s.status === "trialing").length;
  const pastDue = (subs ?? []).filter((s) => s.status === "past_due").length;

  return (
    <div>
      <PageHeader title="Revenue" description="Contracted value from the subscription book" />
      <div className="p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="MRR (contracted)" value={formatMoney(mrr)} />
          <StatTile label="ARR (contracted)" value={formatMoney(mrr * 12)} />
          <StatTile label="Trialing" value={trialing} />
          <StatTile label="Past due" value={pastDue} tone={pastDue > 0 ? "warning" : "default"} />
        </div>
        <ReservedNotice phase="Phase 5 (Billing)">
          These figures are contracted value derived from subscription records. No
          payment gateway exists yet, so nothing shown here has been collected.
          Cash, invoices, dunning and refunds arrive with Phase 5.
        </ReservedNotice>
      </div>
    </div>
  );
};

// ── Invoices (reserved) ─────────────────────────────────────────────────────

export const InvoicesPage: React.FC = () => (
  <div>
    <PageHeader title="Invoices" />
    <div className="p-6">
      <ReservedNotice phase="Phase 5 (Billing)">
        The `invoices` and `invoice_lines` tables exist with full RLS so Phase 5 is
        additive, but nothing writes them yet. Per-organization gapless numbering
        (an Indian GST requirement) must be a sequence at issue time, never a count —
        which is why this page waits for the billing phase rather than faking it.
      </ReservedNotice>
    </div>
  </div>
);
