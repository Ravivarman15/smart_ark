// ──────────────────────────────────────────────────────────────────────────────
// MODULE ENTITLEMENTS — one organization
//
// Shows the resolved answer AND its source. "Payroll ✓ Enabled" is useless to
// support on its own; "Payroll ✓ Enabled — Super Admin override, expires
// 30 Sep" is the sentence that ends the ticket. Both come from the same
// `resolveEntitlements` the tenant's own sidebar runs, so what an operator sees
// here is by construction what the customer sees.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { RotateCcw, Lock, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingBlock, EmptyState } from "./PlatformShell";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { useEntitlementLayers, useSetModule, useClearModuleOverride } from "../hooks/usePlatform";
import { resolveEntitlements, enabledSet, type EntitlementSource } from "../modules/entitlements";
import {
  PLATFORM_MODULES, CATEGORY_LABELS, checkDisable, checkEnable,
  type ModuleCategory,
} from "../modules/moduleRegistry";
import type { ModuleId } from "@/features/rbac/constants/catalog";

const SOURCE_LABEL: Record<EntitlementSource, string> = {
  global_governance: "Platform-wide",
  organization_status: "Org status",
  override: "Super Admin override",
  plan: "Plan",
  essential: "Core",
  default: "Default",
};

const SOURCE_TONE: Record<EntitlementSource, string> = {
  global_governance: "bg-red-500/10 text-red-600 dark:text-red-400",
  organization_status: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  override: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  plan: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  essential: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  default: "bg-muted text-muted-foreground",
};

interface GrantState {
  moduleId: ModuleId;
  enable: boolean;
  /** Non-null when dependencies block or complicate the change. */
  warning: string | null;
  blocked: boolean;
}

export const ModuleEntitlementsPanel: React.FC<{ organizationId: string }> = ({
  organizationId,
}) => {
  const { can } = usePlatformAuth();
  const { data: layers, isLoading } = useEntitlementLayers(organizationId);
  const setModule = useSetModule();
  const clearOverride = useClearModuleOverride();

  const [grant, setGrant] = useState<GrantState | null>(null);
  const [duration, setDuration] = useState("permanent");
  const [reason, setReason] = useState("sales_override");

  const entitlements = useMemo(() => resolveEntitlements(layers), [layers]);
  const on = useMemo(() => enabledSet(entitlements), [entitlements]);

  const grouped = useMemo(() => {
    const out = new Map<ModuleCategory, typeof PLATFORM_MODULES>();
    for (const m of PLATFORM_MODULES) {
      if (!out.has(m.category)) out.set(m.category, []);
      out.get(m.category)!.push(m);
    }
    return [...out.entries()];
  }, []);

  if (isLoading) return <LoadingBlock />;
  if (!layers) {
    return (
      <EmptyState
        title="Entitlements unavailable"
        description="The Phase 9A migration may not be applied to this environment yet."
      />
    );
  }

  const canGrant = can("modules.grant");
  const canRevoke = can("modules.revoke");

  const openGrant = (moduleId: ModuleId, enable: boolean) => {
    const block = enable ? checkEnable(moduleId, on) : checkDisable(moduleId, on);
    setGrant({
      moduleId,
      enable,
      warning: block?.message ?? null,
      // A missing dependency is a warning the operator may proceed past; an
      // active dependant is a hard block. Enabling something incomplete is
      // recoverable in one click. Disabling something another module reads
      // leaves the customer staring at screens that load and show nothing.
      blocked: block?.kind === "has_dependants" || block?.kind === "essential",
    });
    setDuration("permanent");
    setReason("sales_override");
  };

  const confirmGrant = () => {
    if (!grant) return;
    const expiresAt =
      duration === "permanent"
        ? null
        : new Date(Date.now() + Number(duration) * 86_400_000).toISOString();
    setModule.mutate(
      {
        organizationId,
        moduleKey: grant.moduleId,
        enabled: grant.enable,
        reason: duration === "permanent" ? reason : "trial",
        expiresAt,
      },
      { onSuccess: () => setGrant(null) },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <span>
          Plan <span className="font-medium">{layers.plan_code ?? "none"}</span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span>
          Status <span className="font-medium">{layers.status.replace("_", " ")}</span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span>
          <span className="font-medium tabular-nums">{on.size}</span> of {PLATFORM_MODULES.length}{" "}
          modules active
        </span>
      </div>

      {grouped.map(([category, mods]) => (
        <div key={category}>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[category]}
          </div>
          <div className="divide-y divide-border rounded-lg border border-border">
            {mods.map((m) => {
              const e = entitlements[m.id];
              if (!e) return null;
              const hasOverride = e.source === "override";
              // Governance, status and core are decided above the organization
              // layer, so a per-organization toggle cannot move them. Showing an
              // enabled switch that silently does nothing is worse than showing
              // a disabled one that explains itself.
              const locked =
                e.source === "global_governance" ||
                e.source === "organization_status" ||
                e.source === "essential";
              const mayToggle = (e.enabled ? canRevoke : canGrant) && !locked;

              return (
                <div key={m.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{m.label}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_TONE[e.source]}`}
                      >
                        {SOURCE_LABEL[e.source]}
                      </span>
                      {e.overridesPlan && (
                        <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          Overrides plan
                        </span>
                      )}
                      {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                    <p className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
                      <Info className="mt-[1px] h-3 w-3 shrink-0" />
                      {e.explain}
                    </p>
                    {m.requiredBy.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Required by {m.requiredBy.length} module
                        {m.requiredBy.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {hasOverride && canRevoke && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Remove the override and return to the plan default"
                        onClick={() =>
                          clearOverride.mutate({ organizationId, moduleKey: m.id })
                        }
                        disabled={clearOverride.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Switch
                      checked={e.enabled}
                      disabled={!mayToggle || setModule.isPending}
                      onCheckedChange={(v) => openGrant(m.id, v)}
                      aria-label={`${e.enabled ? "Disable" : "Enable"} ${m.label}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <Dialog open={!!grant} onOpenChange={(v) => !v && setGrant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {grant?.enable ? "Grant" : "Revoke"}{" "}
              {grant ? PLATFORM_MODULES.find((m) => m.id === grant.moduleId)?.label : ""}
            </DialogTitle>
            <DialogDescription>
              {grant?.enable
                ? "Adds a Super Admin override on top of the plan. The customer sees the module immediately."
                : "Hides the module from the customer's portal. Every record it manages stays exactly where it is and reappears intact if the module is re-enabled."}
            </DialogDescription>
          </DialogHeader>

          {grant?.warning && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                grant.blocked
                  ? "border-red-500/40 bg-red-500/5"
                  : "border-amber-500/40 bg-amber-500/5"
              }`}
            >
              {grant.warning}
            </div>
          )}

          {grant?.enable && !grant.blocked && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">Permanent</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  A timed grant lapses on its own and returns to the plan default. Nothing
                  has to remember to switch it off.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select
                  value={duration === "permanent" ? reason : "trial"}
                  onValueChange={setReason}
                  disabled={duration !== "permanent"}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales_override">Sales override</SelectItem>
                    <SelectItem value="beta">Beta access</SelectItem>
                    <SelectItem value="incident">Incident remediation</SelectItem>
                    <SelectItem value="plan">Plan correction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setGrant(null)}>Cancel</Button>
            <Button
              onClick={confirmGrant}
              disabled={setModule.isPending || !!grant?.blocked}
              variant={grant?.enable ? "default" : "destructive"}
            >
              {setModule.isPending ? "Applying…" : grant?.enable ? "Grant module" : "Revoke module"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
