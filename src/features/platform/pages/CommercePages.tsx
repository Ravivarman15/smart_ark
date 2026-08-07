// ──────────────────────────────────────────────────────────────────────────────
// COMMERCE PAGES — plans, pricing, subscriptions, coupons, invoices, revenue.
//
// The catalogue is EDITABLE here. Every number an owner can change on these
// screens is a column, never a code branch: adding a tier, repricing Growth, or
// selling one customer a 2,000-student cap is a row change that takes effect
// the moment it is saved — on this screen and on every other open session, via
// PlatformRealtimeProvider.
//
// Still no payment gateway. Nothing on these pages charges a card; `invoices`
// is a reserved shape that Phase 5 populates. Pages that depend on that phase
// say so plainly rather than rendering a plausible-looking empty table.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Infinity as InfinityIcon } from "lucide-react";
import {
  PageHeader, StatTile, StatusPill, LoadingBlock, EmptyState, ReservedNotice, formatMoney,
} from "../components/PlatformShell";
import {
  usePlans, usePlanPrices, usePlanFeatures, useSubscriptions, useCoupons,
  useSaveCoupon, useSavePlan, useSavePlanPrice, useDeletePlanPrice,
  useSetPlanFeature, useSaveSubscription, useOrganizations,
} from "../hooks/usePlatform";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import type { Plan, PlanPrice, Coupon } from "../services/platform.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MODULE_CATALOG } from "@/features/rbac/constants/catalog";
import { useConfirm } from "@/components/ui/confirm-dialog";

const lim = (v: number | null) => (v == null ? "Unlimited" : v.toLocaleString("en-IN"));

const INTERVALS = ["monthly", "quarterly", "half_yearly", "yearly"] as const;
const SUPPORT_LEVELS = ["community", "email", "priority", "sla"] as const;
const SUB_STATUSES = ["trialing", "active", "past_due", "grace", "suspended", "cancelled"] as const;

/**
 * A limit field where BLANK MEANS UNLIMITED.
 *
 * The database models unlimited as NULL rather than a sentinel like -1, and the
 * input has to preserve that distinction: `0` is a real, meaningful limit (a
 * tier that includes no WhatsApp credits at all) and must never round-trip into
 * "unlimited". So the value is held as a string and only converted at submit.
 */
const LimitInput: React.FC<{
  id: string; label: string; value: string;
  onChange: (v: string) => void; suffix?: string;
}> = ({ id, label, value, onChange, suffix }) => (
  <div>
    <Label htmlFor={id} className="text-xs">{label}</Label>
    <div className="relative">
      <Input
        id={id} type="number" min={0} value={value} placeholder="Unlimited"
        onChange={(e) => onChange(e.target.value)}
        className={suffix ? "pr-12" : undefined}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
    {value === "" && (
      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <InfinityIcon className="h-3 w-3" /> Unlimited
      </div>
    )}
  </div>
);

// ── Plan editor ─────────────────────────────────────────────────────────────

type PlanForm = {
  code: string; name: string; description: string; tierOrder: string;
  isPublic: boolean; isActive: boolean; trialDays: string; graceDays: string;
  supportLevel: string; maxStudents: string; maxStaff: string; maxBranches: string;
  maxStorageMb: string; whatsappCredits: string; emailCredits: string;
  aiCredits: string; apiRequestsPerDay: string;
  allowWhiteLabel: boolean; allowCustomDomain: boolean; allowMarketplace: boolean;
};

const numStr = (v: number | null | undefined) => (v == null ? "" : String(v));
const toNum = (v: string): number | null => (v.trim() === "" ? null : Number(v));

const blankPlan = (): PlanForm => ({
  code: "", name: "", description: "", tierOrder: "0",
  isPublic: true, isActive: true, trialDays: "14", graceDays: "7",
  supportLevel: "email", maxStudents: "", maxStaff: "", maxBranches: "",
  maxStorageMb: "", whatsappCredits: "", emailCredits: "", aiCredits: "",
  apiRequestsPerDay: "", allowWhiteLabel: false, allowCustomDomain: false,
  allowMarketplace: false,
});

const planToForm = (p: Plan): PlanForm => ({
  code: p.code, name: p.name, description: p.description ?? "",
  tierOrder: String(p.tierOrder), isPublic: p.isPublic, isActive: p.isActive,
  trialDays: String(p.trialDays), graceDays: String(p.graceDays),
  supportLevel: p.supportLevel,
  maxStudents: numStr(p.maxStudents), maxStaff: numStr(p.maxStaff),
  maxBranches: numStr(p.maxBranches), maxStorageMb: numStr(p.maxStorageMb),
  whatsappCredits: numStr(p.whatsappCredits), emailCredits: numStr(p.emailCredits),
  aiCredits: numStr(p.aiCredits), apiRequestsPerDay: numStr(p.apiRequestsPerDay),
  allowWhiteLabel: p.allowWhiteLabel, allowCustomDomain: p.allowCustomDomain,
  allowMarketplace: p.allowMarketplace,
});

const PlanDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = creating a new tier. */
  plan: Plan | null;
}> = ({ open, onOpenChange, plan }) => {
  const save = useSavePlan();
  const setFeature = useSetPlanFeature();
  const { data: planFeatures } = usePlanFeatures();
  const [form, setForm] = useState<PlanForm>(blankPlan);

  // Re-seed whenever the dialog opens on a different row, otherwise editing
  // Growth right after Starter would show Starter's numbers.
  useEffect(() => {
    if (open) setForm(plan ? planToForm(plan) : blankPlan());
  }, [open, plan]);

  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const features = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const f of planFeatures ?? []) {
      if (plan && f.planId === plan.id) m.set(f.featureKey, f.enabled);
    }
    return m;
  }, [planFeatures, plan]);

  const submit = () => {
    if (!form.code.trim() || !form.name.trim()) return;
    save.mutate(
      {
        code: form.code.trim().toLowerCase(), name: form.name.trim(),
        description: form.description.trim() || null,
        tierOrder: Number(form.tierOrder) || 0,
        isPublic: form.isPublic, isActive: form.isActive,
        trialDays: Number(form.trialDays) || 0,
        graceDays: Number(form.graceDays) || 0,
        supportLevel: form.supportLevel,
        maxStudents: toNum(form.maxStudents), maxStaff: toNum(form.maxStaff),
        maxBranches: toNum(form.maxBranches), maxStorageMb: toNum(form.maxStorageMb),
        whatsappCredits: toNum(form.whatsappCredits),
        emailCredits: toNum(form.emailCredits), aiCredits: toNum(form.aiCredits),
        apiRequestsPerDay: toNum(form.apiRequestsPerDay),
        allowWhiteLabel: form.allowWhiteLabel,
        allowCustomDomain: form.allowCustomDomain,
        allowMarketplace: form.allowMarketplace,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : "New plan"}</DialogTitle>
          <DialogDescription>
            Saved changes apply immediately to every open control-plane session and to
            the public pricing page. Existing subscriptions keep the amount agreed on
            their own record — repricing a tier never silently recharges a customer.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basics">
          <TabsList>
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="limits">Limits</TabsTrigger>
            <TabsTrigger value="modules" disabled={!plan}>Modules</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pcode" className="text-xs">Code</Label>
                <Input
                  id="pcode" value={form.code} disabled={!!plan}
                  onChange={(e) => set("code", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="growth"
                />
                {plan && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Immutable — subscriptions and provisioning reference it.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="pname" className="text-xs">Display name</Label>
                <Input id="pname" value={form.name} onChange={(e) => set("name", e.target.value)}
                  placeholder="Growth" />
              </div>
            </div>

            <div>
              <Label htmlFor="pdesc" className="text-xs">Description</Label>
              <Textarea id="pdesc" rows={2} value={form.description}
                onChange={(e) => set("description", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="porder" className="text-xs">Tier order</Label>
                <Input id="porder" type="number" value={form.tierOrder}
                  onChange={(e) => set("tierOrder", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ptrial" className="text-xs">Trial days</Label>
                <Input id="ptrial" type="number" min={0} value={form.trialDays}
                  onChange={(e) => set("trialDays", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pgrace" className="text-xs">Grace days</Label>
                <Input id="pgrace" type="number" min={0} value={form.graceDays}
                  onChange={(e) => set("graceDays", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Support</Label>
                <Select value={form.supportLevel} onValueChange={(v) => set("supportLevel", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORT_LEVELS.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border">
              {([
                ["isActive", "Active", "Inactive tiers cannot be assigned to new subscriptions."],
                ["isPublic", "Public", "Public tiers appear on the marketing pricing page. Turn off for a negotiated plan."],
                ["allowWhiteLabel", "White-label", "Custom logo, colours and sender identity."],
                ["allowCustomDomain", "Custom domain", "Tenant-owned domain with managed TLS."],
                ["allowMarketplace", "Marketplace", "Third-party app installs."],
              ] as [keyof PlanForm, string, string][]).map(([key, label, hint]) => (
                <div key={key} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-[11px] text-muted-foreground">{hint}</div>
                  </div>
                  <Switch checked={form[key] as boolean}
                    onCheckedChange={(v) => set(key, v as never)} />
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="limits" className="mt-4 space-y-4">
            <p className="text-[11px] text-muted-foreground">
              Leave a field blank for <strong>unlimited</strong>. Zero is a real limit and
              is stored as zero — the two are not the same thing.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <LimitInput id="l-students" label="Students" value={form.maxStudents}
                onChange={(v) => set("maxStudents", v)} />
              <LimitInput id="l-staff" label="Staff" value={form.maxStaff}
                onChange={(v) => set("maxStaff", v)} />
              <LimitInput id="l-branches" label="Branches" value={form.maxBranches}
                onChange={(v) => set("maxBranches", v)} />
              <LimitInput id="l-storage" label="Storage" value={form.maxStorageMb}
                onChange={(v) => set("maxStorageMb", v)} suffix="MB" />
              <LimitInput id="l-wa" label="WhatsApp credits" value={form.whatsappCredits}
                onChange={(v) => set("whatsappCredits", v)} />
              <LimitInput id="l-email" label="Email credits" value={form.emailCredits}
                onChange={(v) => set("emailCredits", v)} />
              <LimitInput id="l-ai" label="AI credits" value={form.aiCredits}
                onChange={(v) => set("aiCredits", v)} />
              <LimitInput id="l-api" label="API requests" value={form.apiRequestsPerDay}
                onChange={(v) => set("apiRequestsPerDay", v)} suffix="/day" />
            </div>
            {form.maxStorageMb !== "" && (
              <p className="text-[11px] text-muted-foreground">
                {(Number(form.maxStorageMb) / 1024).toFixed(2)} GB
              </p>
            )}
          </TabsContent>

          <TabsContent value="modules" className="mt-4">
            <p className="text-[11px] text-muted-foreground mb-3">
              Which ERP modules this tier includes. <code>feature_key</code> is the RBAC
              ModuleId — one vocabulary shared by plans, per-organization overrides and
              the sidebar resolver. Toggles save immediately.
            </p>
            <div className="rounded-lg border border-border divide-y divide-border max-h-72 overflow-y-auto">
              {MODULE_CATALOG.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <div className="text-sm">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{m.id}</div>
                  </div>
                  <Switch
                    checked={features.get(m.id) ?? false}
                    disabled={setFeature.isPending}
                    onCheckedChange={(v) =>
                      plan && setFeature.mutate({ planId: plan.id, key: m.id, enabled: v })
                    }
                  />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}
            disabled={save.isPending || !form.code.trim() || !form.name.trim()}>
            {save.isPending ? "Saving…" : "Save plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Plans ───────────────────────────────────────────────────────────────────

export const PlansPage: React.FC = () => {
  const { data: plans, isLoading } = usePlans();
  const { can } = usePlatformAuth();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);

  const editable = can("plans.manage");
  const openFor = (p: Plan | null) => { setEditing(p); setOpen(true); };

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Plans"
        description="Tier definitions and limits. Plans are data — a custom plan is a row, never a code branch."
        actions={
          editable ? (
            <Button size="sm" onClick={() => openFor(null)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New plan
            </Button>
          ) : null
        }
      />
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
                <th className="text-left font-medium px-4 py-2.5">State</th>
                {editable && <th className="w-10 px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(plans ?? []).map((p) => (
                <tr
                  key={p.id}
                  className={`hover:bg-accent/40 ${editable ? "cursor-pointer" : ""} ${p.isActive ? "" : "opacity-55"}`}
                  onClick={editable ? () => openFor(p) : undefined}
                >
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
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <StatusPill status={p.isActive ? "active" : "cancelled"} />
                      {!p.isPublic && (
                        <span className="text-[10px] text-muted-foreground">private</span>
                      )}
                    </div>
                  </td>
                  {editable && (
                    <td className="px-4 py-2.5">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          {editable
            ? "Click any tier to change its limits, entitlements and included modules. Blank means unlimited."
            : "Read-only — editing a tier requires the `plans.manage` capability."}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          <code>certificate</code>, <code>website</code> and <code>ai</code> are seeded
          disabled on every tier including Enterprise — those modules are not built, and
          selling them would be a refund event. Enable them per tier only once they ship.
        </p>
      </div>

      <PlanDialog open={open} onOpenChange={setOpen} plan={editing} />
    </div>
  );
};

// ── Pricing ─────────────────────────────────────────────────────────────────

const PriceDialog: React.FC<{
  open: boolean; onOpenChange: (v: boolean) => void;
  planId: string; planName: string; price: PlanPrice | null;
}> = ({ open, onOpenChange, planId, planName, price }) => {
  const save = useSavePlanPrice();
  const [form, setForm] = useState({
    currency: "INR", interval: "yearly", amount: "0", taxPercent: "18", isActive: true,
  });

  useEffect(() => {
    if (!open) return;
    setForm(price
      ? {
          currency: price.currency, interval: price.interval,
          amount: String(price.amount), taxPercent: String(price.taxPercent),
          isActive: price.isActive,
        }
      : { currency: "INR", interval: "yearly", amount: "0", taxPercent: "18", isActive: true });
  }, [open, price]);

  const amount = Number(form.amount) || 0;
  const tax = Number(form.taxPercent) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{price ? "Edit price" : "Add price"} — {planName}</DialogTitle>
          <DialogDescription>
            Stored as numeric(14,2), never a float. One price per plan + currency +
            interval; saving an existing combination replaces it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Interval</Label>
              <Select value={form.interval} disabled={!!price}
                onValueChange={(v) => setForm({ ...form, interval: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((i) => (
                    <SelectItem key={i} value={i} className="capitalize">
                      {i.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cur" className="text-xs">Currency</Label>
              <Input id="cur" value={form.currency} disabled={!!price} maxLength={3}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="amt" className="text-xs">Amount</Label>
              <Input id="amt" type="number" min={0} step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="tax" className="text-xs">Tax %</Label>
              <Input id="tax" type="number" min={0} step="0.01" value={form.taxPercent}
                onChange={(e) => setForm({ ...form, taxPercent: e.target.value })} />
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer pays</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(amount * (1 + tax / 100), form.currency)}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {formatMoney(amount, form.currency)} + {tax}% tax
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-[11px] text-muted-foreground">
                Inactive prices stay on record but cannot be sold.
              </div>
            </div>
            <Switch checked={form.isActive}
              onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: price?.id, planId, currency: form.currency,
                  interval: form.interval, amount, taxPercent: tax,
                  isActive: form.isActive,
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {save.isPending ? "Saving…" : "Save price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const PricingPage: React.FC = () => {
  const { data: plans } = usePlans();
  const { data: prices, isLoading } = usePlanPrices();
  const { can } = usePlatformAuth();
  const remove = useDeletePlanPrice();
  const confirm = useConfirm();

  const [target, setTarget] = useState<{ planId: string; planName: string; price: PlanPrice | null } | null>(null);

  const editable = can("plans.manage");

  const byPlan = useMemo(() => {
    const m = new Map<string, PlanPrice[]>();
    for (const p of prices ?? []) {
      const list = m.get(p.planId) ?? [];
      list.push(p);
      m.set(p.planId, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => INTERVALS.indexOf(a.interval as never) - INTERVALS.indexOf(b.interval as never));
    }
    return m;
  }, [prices]);

  const drop = async (p: PlanPrice) => {
    const ok = await confirm({
      title: "Remove this price?",
      description:
        "Subscriptions already sold at this price keep their own amount — a subscription stores what was agreed, not a pointer to today's catalogue. Removing it only stops it being sold again.",
      confirmText: "Remove",
    });
    if (ok) remove.mutate(p.id);
  };

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Pricing"
        description="Amounts are numeric(14,2) with an explicit currency — never floats. GST default 18%."
      />
      <div className="p-6 space-y-4">
        {(plans ?? []).map((p) => {
          const list = byPlan.get(p.id) ?? [];
          return (
            <div key={p.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">{p.code}</div>
                </div>
                {editable && (
                  <Button size="sm" variant="outline"
                    onClick={() => setTarget({ planId: p.id, planName: p.name, price: null })}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Add price
                  </Button>
                )}
              </div>

              {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No price set — this tier cannot be sold until one exists.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {list.map((pr) => (
                    <div
                      key={pr.id}
                      className={`group relative rounded-md border border-border p-3 ${pr.isActive ? "" : "opacity-55"}`}
                    >
                      <div className="text-xs text-muted-foreground capitalize">
                        {pr.interval.replace("_", " ")}
                      </div>
                      <div className="text-lg font-semibold tabular-nums">
                        {formatMoney(pr.amount, pr.currency)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        +{pr.taxPercent}% GST · {formatMoney(pr.amount * (1 + pr.taxPercent / 100), pr.currency)} total
                      </div>
                      {editable && (
                        <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" className="h-6 w-6"
                            onClick={() => setTarget({ planId: p.id, planName: p.name, price: pr })}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6"
                            onClick={() => drop(pr)} disabled={remove.isPending}>
                            <Trash2 className="h-3 w-3 text-red-500" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <ReservedNotice phase="Phase 5 (Billing)">
          Charging, invoicing and dunning are out of scope here. This page manages the
          price catalogue only — no gateway is wired up, so changing a number here
          re-prices future sales and never touches an existing customer's charge.
        </ReservedNotice>
      </div>

      {target && (
        <PriceDialog
          open
          onOpenChange={(v) => !v && setTarget(null)}
          planId={target.planId}
          planName={target.planName}
          price={target.price}
        />
      )}
    </div>
  );
};

// ── Subscriptions ───────────────────────────────────────────────────────────

interface SubRow { [k: string]: unknown }

const SubscriptionDialog: React.FC<{
  open: boolean; onOpenChange: (v: boolean) => void; sub: SubRow | null;
}> = ({ open, onOpenChange, sub }) => {
  const { data: plans } = usePlans();
  const { data: prices } = usePlanPrices();
  const { data: orgs } = useOrganizations();
  const save = useSaveSubscription();

  const [form, setForm] = useState({
    organizationId: "", planId: "", status: "trialing",
    interval: "yearly", amount: "0", autoRenew: true, currentPeriodEnd: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm(sub
      ? {
          organizationId: String(sub.organization_id ?? ""),
          planId: String(sub.plan_id ?? ""),
          status: String(sub.status ?? "trialing"),
          interval: String(sub.interval ?? "yearly"),
          amount: String(sub.amount ?? 0),
          autoRenew: Boolean(sub.auto_renew),
          currentPeriodEnd: sub.current_period_end ? String(sub.current_period_end).slice(0, 10) : "",
        }
      : {
          organizationId: "", planId: "", status: "trialing",
          interval: "yearly", amount: "0", autoRenew: true, currentPeriodEnd: "",
        });
  }, [open, sub]);

  // Picking a plan or interval pre-fills the catalogue price. It is only a
  // starting point: the amount stays editable because negotiated deals are the
  // norm at the enterprise end, and a subscription records what was actually
  // agreed rather than pointing at a catalogue row that may later change.
  useEffect(() => {
    if (!form.planId) return;
    const match = (prices ?? []).find(
      (p) => p.planId === form.planId && p.interval === form.interval && p.isActive,
    );
    if (match) setForm((f) => ({ ...f, amount: String(match.amount) }));
  }, [form.planId, form.interval, prices]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sub ? "Edit subscription" : "New subscription"}</DialogTitle>
          <DialogDescription>
            Management only — no gateway is called and no card is charged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Organization</Label>
            <Select value={form.organizationId} disabled={!!sub}
              onValueChange={(v) => setForm({ ...form, organizationId: v })}>
              <SelectTrigger><SelectValue placeholder="Select an organization" /></SelectTrigger>
              <SelectContent>
                {(orgs ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Plan</Label>
              <Select value={form.planId} onValueChange={(v) => setForm({ ...form, planId: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {(plans ?? []).filter((p) => p.isActive).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUB_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Interval</Label>
              <Select value={form.interval} onValueChange={(v) => setForm({ ...form, interval: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((i) => (
                    <SelectItem key={i} value={i} className="capitalize">
                      {i.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="samt" className="text-xs">Amount</Label>
              <Input id="samt" type="number" min={0} step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>

          <div>
            <Label htmlFor="speriod" className="text-xs">Period end</Label>
            <Input id="speriod" type="date" value={form.currentPeriodEnd}
              onChange={(e) => setForm({ ...form, currentPeriodEnd: e.target.value })} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="text-sm font-medium">Auto-renew</div>
            <Switch checked={form.autoRenew}
              onCheckedChange={(v) => setForm({ ...form, autoRenew: v })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={save.isPending || !form.organizationId || !form.planId}
            onClick={() =>
              save.mutate(
                {
                  id: sub ? String(sub.id) : undefined,
                  organizationId: form.organizationId, planId: form.planId,
                  status: form.status, interval: form.interval,
                  amount: Number(form.amount) || 0, autoRenew: form.autoRenew,
                  currentPeriodEnd: form.currentPeriodEnd || null,
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const SubscriptionsPage: React.FC = () => {
  const { data: subs, isLoading } = useSubscriptions();
  const { data: orgs } = useOrganizations();
  const { can } = usePlatformAuth();
  const [editing, setEditing] = useState<SubRow | null>(null);
  const [open, setOpen] = useState(false);

  const editable = can("billing.manage");
  const openFor = (s: SubRow | null) => { setEditing(s); setOpen(true); };

  // An organization with no subscription record is a real operational gap: it
  // has no plan, so no limit and no renewal date applies to it. Surfacing the
  // count is more useful than leaving it to be discovered at invoice time.
  const unsubscribed = useMemo(() => {
    const withSub = new Set((subs ?? []).map((s) => String(s.organization_id)));
    return (orgs ?? []).filter((o) => !withSub.has(o.id));
  }, [subs, orgs]);

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description={`${subs?.length ?? 0} record(s)`}
        actions={
          editable ? (
            <Button size="sm" onClick={() => openFor(null)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New subscription
            </Button>
          ) : null
        }
      />
      <div className="p-6 space-y-4">
        {unsubscribed.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <span className="font-medium">
              {unsubscribed.length} organization(s) have no subscription:
            </span>{" "}
            <span className="text-muted-foreground">
              {unsubscribed.map((o) => o.displayName).join(", ")} — no plan means no
              enforced limit and no renewal date.
            </span>
          </div>
        )}

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
                  {editable && <th className="w-10 px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subs.map((s) => {
                  const org = s.organizations as { display_name?: string; slug?: string } | null;
                  const plan = s.plans as { code?: string; name?: string } | null;
                  return (
                    <tr
                      key={String(s.id)}
                      className={`hover:bg-accent/40 ${editable ? "cursor-pointer" : ""}`}
                      onClick={editable ? () => openFor(s) : undefined}
                    >
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
                      {editable && (
                        <td className="px-4 py-2.5">
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SubscriptionDialog open={open} onOpenChange={setOpen} sub={editing} />
    </div>
  );
};

// ── Coupons ─────────────────────────────────────────────────────────────────

export const CouponsPage: React.FC = () => {
  const { data: coupons, isLoading } = useCoupons();
  const { can } = usePlatformAuth();
  const save = useSaveCoupon();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState({
    code: "", description: "", discountType: "percentage" as "percentage" | "fixed",
    discountValue: "10", duration: "once", maxRedemptions: "", validUntil: "",
    isActive: true,
  });

  const editable = can("coupons.manage");

  const openFor = (c: Coupon | null) => {
    setEditing(c);
    setForm(c
      ? {
          code: c.code, description: c.description ?? "", discountType: c.discountType,
          discountValue: String(c.discountValue), duration: c.duration,
          maxRedemptions: c.maxRedemptions == null ? "" : String(c.maxRedemptions),
          validUntil: c.validUntil ? c.validUntil.slice(0, 10) : "",
          isActive: c.isActive,
        }
      : {
          code: "", description: "", discountType: "percentage", discountValue: "10",
          duration: "once", maxRedemptions: "", validUntil: "", isActive: true,
        });
    setOpen(true);
  };

  const submit = () => {
    if (!form.code.trim()) return;
    save.mutate(
      {
        code: form.code, description: form.description || null,
        discountType: form.discountType, discountValue: Number(form.discountValue) || 0,
        duration: form.duration,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        validUntil: form.validUntil || null, isActive: form.isActive,
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
          editable ? (
            <Button size="sm" onClick={() => openFor(null)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New coupon
            </Button>
          ) : null
        }
      />
      <div className="p-6">
        {!coupons?.length ? (
          <EmptyState
            title="No coupons"
            description={editable ? "Create one to discount a plan at checkout." : undefined}
          />
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
                  {editable && <th className="w-10 px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {coupons.map((c) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-accent/40 ${editable ? "cursor-pointer" : ""}`}
                    onClick={editable ? () => openFor(c) : undefined}
                  >
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
                    {editable && (
                      <td className="px-4 py-2.5">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.code}` : "New coupon"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="code" className="text-xs">Code</Label>
              <Input
                id="code" value={form.code} disabled={!!editing}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="LAUNCH25"
              />
            </div>
            <div>
              <Label htmlFor="cdesc" className="text-xs">Description</Label>
              <Input id="cdesc" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
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
                <Label htmlFor="value" className="text-xs">Value</Label>
                <Input
                  id="value" type="number" min={0} value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Duration</Label>
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
                <Label htmlFor="max" className="text-xs">Max redemptions</Label>
                <Input
                  id="max" type="number" min={0} value={form.maxRedemptions}
                  onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="until" className="text-xs">Valid until</Label>
              <Input
                id="until" type="date" value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium">Active</div>
                <div className="text-[11px] text-muted-foreground">
                  Deactivating stops new redemptions. Past redemptions are unaffected.
                </div>
              </div>
              <Switch checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending || !form.code.trim()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
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
