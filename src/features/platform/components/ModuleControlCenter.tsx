// ──────────────────────────────────────────────────────────────────────────────
// MODULE CONTROL CENTER — module-first governance.
//
// The Matrix answers "what does this organization have?". This answers the
// other direction — "who has Payroll, who doesn't, and change it for some or
// all of them" — which is the question an operator actually arrives with when
// a package changes.
//
// EVERY NUMBER IS DERIVED. Adoption, the summary tiles and the impact preview
// all come from `platform_module_matrix()` resolved through the same
// `resolveEntitlements` the tenant's own sidebar runs. Nothing is stored, so
// nothing can be stale, and what an operator reads here is by construction what
// the customer sees.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Minus, Search, ShieldAlert, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { useBulkModules } from "../hooks/usePlatform";
import { resolveEntitlements, type EntitlementLayers } from "../modules/entitlements";
import { planBulkOperation, type PlannableOrg, type BulkPlan } from "../modules/bulkPlan";
import {
  PLATFORM_MODULES, CATEGORY_LABELS, AUDIENCE_LABELS, AVAILABILITY_LABELS,
  SUBMODULES_OF, featureLabel, isSubmoduleKey,
  moduleAvailability, type ModuleAudience, type ModuleAvailability,
} from "../modules/moduleRegistry";
import type { ModuleId } from "@/features/rbac/constants/catalog";

export interface MatrixRowInput {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  protected: boolean;
  layers: EntitlementLayers;
}

const TILE_TONE: Record<ModuleAvailability | "total" | "partial", string> = {
  total: "text-foreground",
  AVAILABLE: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  DISABLED: "text-red-600 dark:text-red-400",
  PLATFORM_ONLY: "text-slate-600 dark:text-slate-300",
  HIDDEN: "text-muted-foreground",
};

const Tile: React.FC<{ label: string; value: number; tone: string }> = ({ label, value, tone }) => (
  <div className="rounded-lg border border-border bg-card p-3">
    <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
  </div>
);

export const ModuleControlCenter: React.FC<{ rows: MatrixRowInput[]; withdrawn: Set<string> }> = ({
  rows,
  withdrawn,
}) => {
  const { can } = usePlatformAuth();
  const bulk = useBulkModules();

  const [search, setSearch] = useState("");
  const [audience, setAudience] = useState<ModuleAudience | "all">("all");
  const [openModule, setOpenModule] = useState<ModuleId | null>(null);
  /**
   * What the grant/revoke buttons act on — the module itself, or one of its
   * submodules. Held separately from `openModule` so the organization columns
   * re-sort to the narrowed target as soon as it is chosen: an operator about
   * to revoke "Fee Refund" from everyone needs to see who has Fee REFUND, not
   * who has Fee.
   */
  const [feature, setFeature] = useState<string>("");
  const [orgSearch, setOrgSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ plan: BulkPlan; note: string } | null>(null);

  /** Organizations with entitlements resolved once per matrix load. */
  const orgs: PlannableOrg[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        slug: r.slug,
        protected: r.protected,
        status: r.status,
        entitlements: resolveEntitlements(r.layers),
      })),
    [rows],
  );

  const adoption = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of PLATFORM_MODULES) {
      out[m.id] = orgs.filter((o) => o.entitlements[m.id]?.enabled).length;
    }
    return out;
  }, [orgs]);

  const summary = useMemo(() => {
    let everywhere = 0, partial = 0, nowhere = 0, platformOnly = 0;
    for (const m of PLATFORM_MODULES) {
      const state = moduleAvailability(m.id, withdrawn.has(m.id));
      if (state === "PLATFORM_ONLY" || state === "HIDDEN") { platformOnly += 1; continue; }
      const n = adoption[m.id] ?? 0;
      if (n === 0) nowhere += 1;
      else if (n === orgs.length) everywhere += 1;
      else partial += 1;
    }
    return { total: PLATFORM_MODULES.length, everywhere, partial, nowhere, platformOnly };
  }, [adoption, orgs.length, withdrawn]);

  const visibleModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PLATFORM_MODULES.filter((m) => {
      if (audience !== "all" && m.audience !== audience) return false;
      if (!q) return true;
      return (
        m.label.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      );
    });
  }, [search, audience]);

  const detail = openModule ? PLATFORM_MODULES.find((m) => m.id === openModule) : null;

  const detailOrgs = useMemo(() => {
    if (!feature) return { withIt: [] as PlannableOrg[], without: [] as PlannableOrg[] };
    const q = orgSearch.trim().toLowerCase();
    const match = (o: PlannableOrg) =>
      !q || o.displayName.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q);
    return {
      withIt: orgs.filter((o) => o.entitlements[feature]?.enabled && match(o)),
      without: orgs.filter((o) => !o.entitlements[feature]?.enabled && match(o)),
    };
  }, [feature, orgs, orgSearch]);

  const openDetail = (id: ModuleId) => {
    setOpenModule(id);
    setFeature(id);
  };

  const closeDetail = () => {
    setOpenModule(null);
    setFeature("");
    setSelected(new Set());
    setOrgSearch("");
  };

  /**
   * Build the plan for a scope, then show it. The operator confirms the PLAN,
   * never the intent — "revoke from all" and "revoke from the 11 that actually
   * have it" are different operations and the dialog says which one this is.
   */
  const propose = (scope: "selected" | "all", enable: boolean) => {
    if (!openModule) return;
    const target = scope === "all" ? orgs : orgs.filter((o) => selected.has(o.id));
    // `feature` is the module id, or a submodule id when the operator has
    // narrowed the target. The planner handles both — a submodule has no
    // dependants and cannot be essential, so it simply falls through to the
    // will-change / already comparison on its own resolved state.
    setConfirm({ plan: planBulkOperation(target, feature, enable), note: "" });
  };

  const execute = () => {
    if (!confirm) return;
    const { plan, note } = confirm;
    bulk.mutate(
      {
        organizationIds: plan.targets,
        moduleKey: plan.module,
        enabled: plan.enable,
        note: note.trim(),
      },
      { onSuccess: () => { setConfirm(null); setSelected(new Set()); } },
    );
  };

  const toggleOrg = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      {/* ── Summary ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Total modules" value={summary.total} tone={TILE_TONE.total} />
        <Tile label="Enabled everywhere" value={summary.everywhere} tone={TILE_TONE.AVAILABLE} />
        <Tile label="Partially enabled" value={summary.partial} tone={TILE_TONE.partial} />
        <Tile label="Enabled nowhere" value={summary.nowhere} tone={TILE_TONE.DISABLED} />
        <Tile label="Platform only" value={summary.platformOnly} tone={TILE_TONE.PLATFORM_ONLY} />
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search modules…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={audience} onValueChange={(v) => setAudience(v as ModuleAudience | "all")}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All audiences</SelectItem>
            <SelectItem value="customer">{AUDIENCE_LABELS.customer}</SelectItem>
            <SelectItem value="platform">{AUDIENCE_LABELS.platform}</SelectItem>
            <SelectItem value="internal">{AUDIENCE_LABELS.internal}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Module table ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">Module</th>
              <th className="px-3 py-2.5 text-left font-medium">Category</th>
              <th className="px-3 py-2.5 text-left font-medium">State</th>
              <th className="px-3 py-2.5 text-left font-medium">Organizations</th>
              <th className="px-3 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleModules.map((m) => {
              const state = moduleAvailability(m.id, withdrawn.has(m.id));
              const n = adoption[m.id] ?? 0;
              return (
                <tr key={m.id} className="hover:bg-accent/40">
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-[11px] text-muted-foreground">{m.description}</div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{CATEGORY_LABELS[m.category]}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium ${
                        state === "AVAILABLE" ? TILE_TONE.AVAILABLE : TILE_TONE[state]
                      }`}
                    >
                      {AVAILABILITY_LABELS[state]}
                    </span>
                    {m.essential && (
                      <span className="ml-1.5 rounded-full bg-slate-500/15 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">
                        Core
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {n} / {orgs.length}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button size="sm" variant="outline" onClick={() => openDetail(m.id)}>
                      Manage
                    </Button>
                  </td>
                </tr>
              );
            })}
            {visibleModules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No modules match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Module detail ────────────────────────────────────────────────── */}
      <Dialog open={!!openModule} onOpenChange={(v) => !v && closeDetail()}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.label}</DialogTitle>
                <DialogDescription>{detail.description}</DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {CATEGORY_LABELS[detail.category]}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {AUDIENCE_LABELS[detail.audience]}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {AVAILABILITY_LABELS[moduleAvailability(detail.id, withdrawn.has(detail.id))]}
                </span>
                {detail.dependsOn.length > 0 && (
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-400">
                    Needs {detail.dependsOn.join(", ")}
                  </span>
                )}
                {detail.requiredBy.length > 0 && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                    Required by {detail.requiredBy.join(", ")}
                  </span>
                )}
              </div>

              {/* ── What to act on ─────────────────────────────────────────
                  The whole module, or one page inside it. Choosing narrows
                  the two columns below immediately, so the counts an operator
                  confirms are always about the thing they are changing. */}
              <div className="space-y-1.5">
                <Label>Apply to</Label>
                <Select value={feature} onValueChange={setFeature}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={detail.id}>
                      {detail.label} — the whole module
                    </SelectItem>
                    {(SUBMODULES_OF.get(detail.id) ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                        {!s.wired && " (not built)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSubmoduleKey(feature) && (
                  <p className="text-[11px] text-muted-foreground">
                    Revoking one page leaves the rest of {detail.label} untouched. A submodule
                    cannot be switched on while its module is off.
                  </p>
                )}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search organizations…"
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <OrgColumn
                  title={`Has ${featureLabel(feature)}`}
                  count={detailOrgs.withIt.length}
                  orgs={detailOrgs.withIt}
                  selected={selected}
                  onToggle={toggleOrg}
                  moduleId={feature}
                  tone="on"
                />
                <OrgColumn
                  title={`Without ${featureLabel(feature)}`}
                  count={detailOrgs.without.length}
                  orgs={detailOrgs.without}
                  selected={selected}
                  onToggle={toggleOrg}
                  moduleId={feature}
                  tone="off"
                />
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                <div className="text-[11px] text-muted-foreground">
                  {selected.size} selected
                </div>
                <div className="flex flex-wrap gap-2">
                  {can("modules.bulk") && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.size === 0}
                        onClick={() => propose("selected", true)}
                      >
                        Grant to selected
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.size === 0}
                        onClick={() => propose("selected", false)}
                      >
                        Revoke from selected
                      </Button>
                      <Button size="sm" onClick={() => propose("all", true)}>
                        Grant to all
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => propose("all", false)}>
                        Revoke from all
                      </Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Impact confirmation ──────────────────────────────────────────── */}
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.plan.enable ? "Grant" : "Revoke"}{" "}
              {confirm ? featureLabel(confirm.plan.module) : ""}
            </DialogTitle>
            <DialogDescription>
              Applied to each organization individually, so one failure never aborts the rest and
              every affected customer gets its own audit entry. No tenant data is touched — records
              stay exactly where they are and reappear intact if the module is re-enabled.
            </DialogDescription>
          </DialogHeader>

          {confirm?.plan.refusal ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm">
              {confirm.plan.refusal}
            </div>
          ) : (
            confirm && <PlanBreakdown plan={confirm.plan} />
          )}

          {confirm && !confirm.plan.refusal && confirm.plan.targets.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="plan-note">
                Reason (required, recorded against every organization)
              </Label>
              <Textarea
                id="plan-note"
                rows={2}
                value={confirm.note}
                onChange={(e) => setConfirm((c) => (c ? { ...c, note: e.target.value } : c))}
                placeholder="e.g. Payroll is not included in this institution's purchased package."
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant={confirm?.plan.enable ? "default" : "destructive"}
              disabled={
                bulk.isPending ||
                !confirm ||
                !!confirm.plan.refusal ||
                confirm.plan.targets.length === 0 ||
                confirm.note.trim().length < 5
              }
              onClick={execute}
            >
              {bulk.isPending
                ? "Applying…"
                : `${confirm?.plan.enable ? "Grant" : "Revoke"} for ${confirm?.plan.targets.length ?? 0}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** One side of the module detail — organizations with or without it. */
const OrgColumn: React.FC<{
  title: string;
  count: number;
  orgs: PlannableOrg[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  moduleId: string;
  tone: "on" | "off";
}> = ({ title, count, orgs, selected, onToggle, moduleId, tone }) => (
  <div className="rounded-lg border border-border">
    <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-medium">
      <span>{title}</span>
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </div>
    <div className="max-h-52 overflow-y-auto">
      {orgs.map((o) => (
        <div key={o.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/40">
          <Checkbox
            checked={selected.has(o.id)}
            onCheckedChange={() => onToggle(o.id)}
            disabled={o.protected}
            aria-label={`Select ${o.displayName}`}
          />
          {tone === "on" ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          )}
          <Link
            to={`/platform/organization/${o.id}`}
            className="min-w-0 flex-1 truncate hover:underline"
            title={o.entitlements[moduleId]?.explain}
          >
            {o.displayName}
          </Link>
          {o.protected && (
            <ShieldAlert className="h-3 w-3 shrink-0 text-amber-500" aria-label="Protected" />
          )}
        </div>
      ))}
      {orgs.length === 0 && (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">None</div>
      )}
    </div>
  </div>
);

/**
 * The impact preview.
 *
 * Deliberately shows the buckets that will NOT change as prominently as the one
 * that will. "24 organizations affected" is how an operator confirms something
 * they did not mean; "11 will change, 12 already have it, 1 protected" is a
 * sentence they can check against what they intended.
 */
const PlanBreakdown: React.FC<{ plan: BulkPlan }> = ({ plan }) => (
  <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label="Considered" value={plan.total} tone="text-foreground" />
      <Tile label="Will change" value={plan.willChange.length} tone={TILE_TONE.AVAILABLE} />
      <Tile
        label={`Already ${plan.enable ? "enabled" : "disabled"}`}
        value={plan.already.length}
        tone="text-muted-foreground"
      />
      <Tile label="Protected" value={plan.protectedExcluded.length} tone={TILE_TONE.partial} />
    </div>

    {plan.protectedExcluded.length > 0 && (
      <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
        <ShieldAlert className="mt-px h-3 w-3 shrink-0" />
        {plan.protectedExcluded.map((e) => e.displayName).join(", ")} — protected and excluded from
        every bulk operation. Open them individually if the change is genuinely intended.
      </p>
    )}

    {plan.blocked.length > 0 && (
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          <X className="h-3.5 w-3.5" /> {plan.blocked.length} blocked by dependencies
        </div>
        <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
          {plan.blocked.slice(0, 6).map((e) => (
            <li key={e.organizationId}>
              <span className="font-medium text-foreground">{e.displayName}</span> — {e.reason}
            </li>
          ))}
          {plan.blocked.length > 6 && <li>…and {plan.blocked.length - 6} more.</li>}
        </ul>
      </div>
    )}

    {plan.targets.length === 0 && !plan.refusal && (
      <p className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
        <Users className="mt-px h-3 w-3 shrink-0" />
        Nothing to do — every organization in scope is already in the requested state, protected, or
        blocked. Running this would write override rows that change nothing.
      </p>
    )}
  </div>
);

export default ModuleControlCenter;
