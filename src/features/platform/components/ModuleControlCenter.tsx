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
import { Check, Globe, Minus, Search, ShieldAlert, Users, X } from "lucide-react";
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
import { useBulkModules, useSetModule, useSetFeatureDefault, useModuleGovernance } from "../hooks/usePlatform";
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
  const setModule = useSetModule();
  const setDefault = useSetFeatureDefault();
  const { data: governanceRows } = useModuleGovernance();
  const governance = governanceRows ?? [];

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
  /** Pending "all organizations" decision, awaiting its reason. */
  const [setAllPrompt, setSetAllPrompt] = useState<{
    featureKey: string; label: string; enable: boolean | null; note: string;
  } | null>(null);

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

  /** Organizations shown as columns — filtered by the same search box. */
  const gridOrgs = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    if (!q) return orgs;
    const byName = orgs.filter(
      (o) => o.displayName.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q),
    );
    // A search that matches no organization is probably a submodule search, so
    // the columns stay put rather than emptying the grid entirely.
    return byName.length > 0 ? byName : orgs;
  }, [orgs, orgSearch]);

  /** Rows: the module itself, then each of its submodules. */
  const gridRows = useMemo(() => {
    if (!openModule) return [] as { id: string; label: string; isModule: boolean; wired: boolean }[];
    const q = orgSearch.trim().toLowerCase();
    const module = PLATFORM_MODULES.find((m) => m.id === openModule)!;
    const subs = (SUBMODULES_OF.get(openModule) ?? []).map((s) => ({
      id: s.id, label: s.label, isModule: false, wired: s.wired,
    }));
    const matchesOrg = orgs.some(
      (o) => o.displayName.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q),
    );
    // Filter submodules only when the query is not an organization name —
    // otherwise typing "ARK" would hide every row.
    const filtered =
      q && !matchesOrg
        ? subs.filter((s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
        : subs;
    return [
      { id: module.id, label: `${module.label} — whole module`, isModule: true, wired: true },
      ...filtered,
    ];
  }, [openModule, orgs, orgSearch]);

  const governanceOf = (key: string) => governance.find((g) => g.moduleKey === key) ?? null;

  /**
   * What setting a platform default would actually do to the current fleet.
   *
   * `conflicting` counts organizations whose OWN override disagrees — those are
   * the rows that get removed so they follow the platform. Protected ones are
   * counted separately because they are skipped entirely.
   */
  const allImpact = useMemo(() => {
    if (!setAllPrompt || setAllPrompt.enable === null) {
      return { follows: 0, conflicting: 0, protectedCount: 0 };
    }
    let conflicting = 0;
    let protectedCount = 0;
    for (const o of orgs) {
      const e = o.entitlements[setAllPrompt.featureKey];
      const disagrees = e && e.source === "override" && e.enabled !== setAllPrompt.enable;
      if (o.protected) {
        if (disagrees) protectedCount += 1;
        continue;
      }
      if (disagrees) conflicting += 1;
    }
    return {
      follows: orgs.filter((o) => !o.protected).length,
      conflicting,
      protectedCount,
    };
  }, [setAllPrompt, orgs]);

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

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search organizations or submodules…"
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                />
              </div>

              {/* ── The grid ────────────────────────────────────────────────
                  Rows are the module and every submodule; columns are the
                  organizations. Each cell is the resolved answer for that
                  pair, and clicking it changes exactly that pair.

                  Orientation is deliberate: a module can have 32 submodules
                  and the fleet is small, so submodules read down the page and
                  organizations across it. The header row scrolls with the
                  table rather than being frozen — with a large fleet the
                  "All organizations" column is what an operator reaches for
                  anyway. */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium">
                        Feature
                      </th>
                      <th className="whitespace-nowrap border-l border-border px-3 py-2 text-center font-medium">
                        <div className="flex items-center justify-center gap-1">
                          <Globe className="h-3 w-3" /> All organizations
                        </div>
                        <div className="text-[9px] font-normal normal-case">
                          existing &amp; future
                        </div>
                      </th>
                      {gridOrgs.map((o) => (
                        <th key={o.id} className="whitespace-nowrap px-3 py-2 text-center font-medium">
                          <div className="flex items-center justify-center gap-1">
                            {o.displayName}
                            {o.protected && <ShieldAlert className="h-3 w-3 text-amber-500" />}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {gridRows.map((row) => (
                      <GridRow
                        key={row.id}
                        row={row}
                        orgs={gridOrgs}
                        governance={governanceOf(row.id)}
                        canGrant={can("modules.grant")}
                        canRevoke={can("modules.revoke")}
                        canBulk={can("modules.bulk")}
                        busy={setModule.isPending || setDefault.isPending}
                        onToggleOne={(orgId, next) =>
                          setModule.mutate({
                            organizationId: orgId,
                            moduleKey: row.id,
                            enabled: next,
                            reason: "sales_override",
                            expiresAt: null,
                          })
                        }
                        onToggleAll={(next) =>
                          setSetAllPrompt({ featureKey: row.id, label: row.label, enable: next, note: "" })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-muted-foreground">
                A cell changes one organization. The{" "}
                <span className="font-medium">All organizations</span> column records a platform
                default that every organization follows unless it has its own decision —
                including organizations created later. Revoking a module switches off its
                submodules with it; a submodule cannot be on while its module is off.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── All organizations, existing and future ───────────────────────── */}
      <Dialog open={!!setAllPrompt} onOpenChange={(v) => !v && setSetAllPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {setAllPrompt?.enable === null
                ? "Clear the platform default"
                : `${setAllPrompt?.enable ? "Enable" : "Disable"} ${setAllPrompt?.label} everywhere`}
            </DialogTitle>
            <DialogDescription>
              {setAllPrompt?.enable === null
                ? "Organizations fall back to their plan, and future organizations get the built-in default again. No per-organization decision is changed."
                : "Records a platform default. Every organization without a decision of its own follows it — including organizations created from now on."}
            </DialogDescription>
          </DialogHeader>

          {setAllPrompt && setAllPrompt.enable !== null && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="font-medium">
                  {allImpact.follows} organization{allImpact.follows === 1 ? "" : "s"} will follow
                  this
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {allImpact.conflicting > 0 ? (
                    <>
                      {allImpact.conflicting} organization
                      {allImpact.conflicting === 1 ? " has" : "s have"} their own decision that
                      disagrees. Those overrides are <span className="font-medium">removed</span> so
                      they follow the platform too — removing them leaves the decision in one place
                      instead of writing rows that each look like a deliberate exception later.
                    </>
                  ) : (
                    "No organization has a conflicting decision of its own."
                  )}
                  {allImpact.protectedCount > 0 && (
                    <>
                      {" "}
                      <span className="text-amber-600 dark:text-amber-400">
                        {allImpact.protectedCount} protected organization
                        {allImpact.protectedCount === 1 ? " is" : "s are"} left untouched.
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  No tenant data is touched. Records stay exactly where they are and reappear
                  intact if this is reversed.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="default-note">Reason (required)</Label>
                <Textarea
                  id="default-note"
                  rows={2}
                  value={setAllPrompt.note}
                  onChange={(e) =>
                    setSetAllPrompt((p) => (p ? { ...p, note: e.target.value } : p))
                  }
                  placeholder="e.g. Certificate is included in every package from Sep 2026."
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSetAllPrompt(null)}>Cancel</Button>
            <Button
              variant={setAllPrompt?.enable === false ? "destructive" : "default"}
              disabled={
                !setAllPrompt ||
                setDefault.isPending ||
                (setAllPrompt.enable !== null && setAllPrompt.note.trim().length < 5)
              }
              onClick={() => {
                if (!setAllPrompt) return;
                setDefault.mutate(
                  {
                    featureKey: setAllPrompt.featureKey,
                    enabled: setAllPrompt.enable,
                    note: setAllPrompt.note.trim() || undefined,
                    applyToExisting: true,
                  },
                  { onSuccess: () => setSetAllPrompt(null) },
                );
              }}
            >
              {setDefault.isPending
                ? "Applying…"
                : setAllPrompt?.enable === null
                  ? "Clear default"
                  : "Apply to all organizations"}
            </Button>
          </DialogFooter>
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

/**
 * One feature across every organization, plus the platform default.
 *
 * The default cell is not a third state of the same switch — it answers a
 * different question. A per-organization cell says what THAT customer has; the
 * default says what a customer gets when nobody has decided for them, which is
 * the only way to reach organizations that do not exist yet.
 */
const GridRow: React.FC<{
  row: { id: string; label: string; isModule: boolean; wired: boolean };
  orgs: PlannableOrg[];
  governance: { defaultEnabled: boolean | null } | null;
  canGrant: boolean;
  canRevoke: boolean;
  canBulk: boolean;
  busy: boolean;
  onToggleOne: (orgId: string, next: boolean) => void;
  onToggleAll: (next: boolean | null) => void;
}> = ({ row, orgs, governance, canGrant, canRevoke, canBulk, busy, onToggleOne, onToggleAll }) => {
  const dflt = governance?.defaultEnabled ?? null;

  return (
    <tr className="hover:bg-accent/30">
      <td
        className={`sticky left-0 z-10 bg-card px-3 py-2 ${row.isModule ? "font-medium" : "pl-6"}`}
      >
        <div className="flex items-center gap-1.5">
          <span className={row.isModule ? "" : "text-[13px]"}>{row.label}</span>
          {!row.wired && (
            <span
              className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
              title="In the catalog, but no page renders it yet."
            >
              not built
            </span>
          )}
        </div>
        {!row.isModule && (
          <div className="font-mono text-[10px] text-muted-foreground">{row.id}</div>
        )}
      </td>

      {/* Platform default */}
      <td className="border-l border-border px-3 py-2 text-center">
        <div className="flex items-center justify-center gap-1">
          <Button
            size="sm"
            variant={dflt === true ? "default" : "outline"}
            className="h-6 px-2 text-[10px]"
            disabled={!canBulk || busy}
            onClick={() => onToggleAll(true)}
          >
            On
          </Button>
          <Button
            size="sm"
            variant={dflt === false ? "destructive" : "outline"}
            className="h-6 px-2 text-[10px]"
            disabled={!canBulk || busy}
            onClick={() => onToggleAll(false)}
          >
            Off
          </Button>
          {dflt !== null && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              title="Clear the platform default — organizations fall back to their plan"
              disabled={!canBulk || busy}
              onClick={() => onToggleAll(null)}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </td>

      {orgs.map((o) => {
        const e = o.entitlements[row.id];
        // Governance, status, audience and core are decided above the
        // organization layer, so a per-organization switch cannot move them.
        // A switch that silently does nothing is worse than a disabled one.
        const locked =
          !e ||
          e.source === "global_governance" ||
          e.source === "organization_status" ||
          e.source === "essential" ||
          e.source === "audience" ||
          e.source === "parent_module";
        const mayToggle = (e?.enabled ? canRevoke : canGrant) && !locked && !o.protected;

        return (
          <td key={o.id} className="px-3 py-2 text-center" title={e?.explain}>
            <button
              type="button"
              disabled={!mayToggle || busy}
              onClick={() => onToggleOne(o.id, !e!.enabled)}
              aria-label={`${e?.enabled ? "Disable" : "Enable"} ${row.label} for ${o.displayName}`}
              className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                e?.enabled ? "bg-emerald-500" : "bg-muted-foreground/25"
              } ${mayToggle && !busy ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  e?.enabled ? "translate-x-[18px]" : "translate-x-[2px]"
                }`}
              />
            </button>
          </td>
        );
      })}
    </tr>
  );
};

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
