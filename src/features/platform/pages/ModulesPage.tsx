// ──────────────────────────────────────────────────────────────────────────────
// GLOBAL MODULE GOVERNANCE  —  /platform/modules
//
// Three views over one dataset:
//   Catalog   every module, how many organizations have it, global availability
//   Matrix    organizations × modules, entitlement state only
//   Bulk      apply one change to many organizations, one call each
//
// Everything here reads `platform_module_matrix()`, which returns entitlement
// rows and nothing else — no student counts, no contact details, no names
// beyond the organization's own. A grid of ticks needs nothing more, and
// anything more would be tenant data on a platform screen.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Minus, Globe, ShieldAlert, Layers } from "lucide-react";
import {
  PageHeader, LoadingBlock, EmptyState, StatusPill,
} from "../components/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import {
  useModuleMatrix, useModuleGovernance, useSetModuleGovernance, useBulkModules,
} from "../hooks/usePlatform";
import { resolveEntitlements } from "../modules/entitlements";
import { PLATFORM_MODULES, CATEGORY_LABELS } from "../modules/moduleRegistry";
import type { ModuleId } from "@/features/rbac/constants/catalog";

const ModulesPage: React.FC = () => {
  const { can } = usePlatformAuth();
  const { data: matrix, isLoading } = useModuleMatrix();
  const { data: governance } = useModuleGovernance();
  const setGovernance = useSetModuleGovernance();
  const bulk = useBulkModules();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkModule, setBulkModule] = useState<ModuleId>("whatsapp");
  const [bulkEnable, setBulkEnable] = useState(true);
  const [bulkNote, setBulkNote] = useState("");
  const [withdraw, setWithdraw] = useState<{ id: ModuleId; note: string } | null>(null);

  const withdrawn = useMemo(
    () => new Set((governance ?? []).filter((g) => !g.isGloballyAvailable).map((g) => g.moduleKey)),
    [governance],
  );

  /** Resolved entitlements per organization, computed once per matrix load. */
  const rows = useMemo(
    () =>
      (matrix ?? []).map((r) => ({ ...r, entitlements: resolveEntitlements(r.layers) })),
    [matrix],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.displayName.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q),
    );
  }, [rows, search]);

  /** How many organizations currently have each module. */
  const adoption = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of PLATFORM_MODULES) {
      out[m.id] = rows.filter((r) => r.entitlements[m.id]?.enabled).length;
    }
    return out;
  }, [rows]);

  const eligible = useMemo(
    () => filtered.filter((r) => selected.has(r.id) && !r.protected),
    [filtered, selected],
  );
  const blockedByProtection = useMemo(
    () => filtered.filter((r) => selected.has(r.id) && r.protected),
    [filtered, selected],
  );

  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(filtered.map((r) => r.id)) : new Set());

  const toggleOne = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = () => {
    bulk.mutate(
      {
        organizationIds: [...selected],
        moduleKey: bulkModule,
        enabled: bulkEnable,
        note: bulkNote.trim(),
      },
      { onSuccess: () => { setBulkOpen(false); setBulkNote(""); setSelected(new Set()); } },
    );
  };

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Modules"
        description={`${PLATFORM_MODULES.length} modules across ${rows.length} organizations`}
        actions={
          can("modules.bulk") && (
            <Button size="sm" disabled={selected.size === 0} onClick={() => setBulkOpen(true)}>
              <Layers className="mr-1.5 h-3.5 w-3.5" /> Bulk change ({selected.size})
            </Button>
          )
        }
      />

      <div className="space-y-4 p-6">
        <Tabs defaultValue="catalog">
          <TabsList>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="matrix">Matrix</TabsTrigger>
          </TabsList>

          {/* ── Catalog ─────────────────────────────────────────────────── */}
          <TabsContent value="catalog" className="mt-4">
            <div className="divide-y divide-border rounded-lg border border-border">
              {PLATFORM_MODULES.map((m) => {
                const isWithdrawn = withdrawn.has(m.id);
                const note = governance?.find((g) => g.moduleKey === m.id)?.note;
                return (
                  <div key={m.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{m.label}</span>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {CATEGORY_LABELS[m.category]}
                        </span>
                        {m.essential && (
                          <span className="rounded-full bg-slate-500/15 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">
                            Core
                          </span>
                        )}
                        {isWithdrawn && (
                          <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                            Withdrawn platform-wide
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Enabled for{" "}
                        <span className="font-medium tabular-nums">{adoption[m.id] ?? 0}</span> of{" "}
                        {rows.length} organizations
                        {m.dependsOn.length > 0 && ` · depends on ${m.dependsOn.join(", ")}`}
                        {m.requiredBy.length > 0 && ` · required by ${m.requiredBy.join(", ")}`}
                      </p>
                      {isWithdrawn && note && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{note}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      <Switch
                        checked={!isWithdrawn}
                        // Core modules have no global kill switch. Withdrawing
                        // Students platform-wide would take every tenant offline
                        // at once — a capability with no legitimate use that is
                        // one misclick away from a total outage.
                        disabled={!can("modules.govern") || m.essential || setGovernance.isPending}
                        onCheckedChange={(v) => {
                          if (v) setGovernance.mutate({ moduleKey: m.id, available: true });
                          else setWithdraw({ id: m.id, note: "" });
                        }}
                        aria-label={`Global availability of ${m.label}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              A global withdrawal outranks every plan and every override. It is the platform
              safety switch — use it when a module must come off the board everywhere at once.
            </p>
          </TabsContent>

          {/* ── Matrix ──────────────────────────────────────────────────── */}
          <TabsContent value="matrix" className="mt-4 space-y-3">
            <Input
              placeholder="Filter organizations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />

            {filtered.length === 0 ? (
              <EmptyState title="No organizations match" />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selected.size > 0 && selected.size === filtered.length}
                            onCheckedChange={(v) => toggleAll(Boolean(v))}
                            aria-label="Select all organizations"
                          />
                          Organization
                        </div>
                      </th>
                      {PLATFORM_MODULES.map((m) => (
                        <th
                          key={m.id}
                          className="px-2 py-2.5 text-center font-medium"
                          title={m.label}
                        >
                          {/* Vertical headers: 20 modules across a table cannot
                              carry horizontal labels without a 3000px scroll. */}
                          <span className="inline-block whitespace-nowrap [writing-mode:vertical-rl] rotate-180">
                            {m.label}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((r) => (
                      <tr key={r.id} className="hover:bg-accent/40">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={selected.has(r.id)}
                              onCheckedChange={() => toggleOne(r.id)}
                              aria-label={`Select ${r.displayName}`}
                            />
                            <div>
                              <Link
                                to={`/platform/organization/${r.id}`}
                                className="font-medium hover:underline"
                              >
                                {r.displayName}
                              </Link>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">{r.slug}</span>
                                {r.protected && (
                                  <ShieldAlert
                                    className="h-3 w-3 text-amber-500"
                                    aria-label="Protected organization"
                                  />
                                )}
                                <StatusPill status={r.status} />
                              </div>
                            </div>
                          </div>
                        </td>
                        {PLATFORM_MODULES.map((m) => {
                          const e = r.entitlements[m.id];
                          return (
                            <td key={m.id} className="px-2 py-2 text-center" title={e?.explain}>
                              {e?.enabled ? (
                                <Check className="mx-auto h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Minus className="mx-auto h-3.5 w-3.5 text-muted-foreground/40" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Bulk dialog ───────────────────────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk module change</DialogTitle>
            <DialogDescription>
              Applied to each organization individually, so one failure never aborts the rest
              and every affected customer gets its own audit entry.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Module</Label>
                <Select value={bulkModule} onValueChange={(v) => setBulkModule(v as ModuleId)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORM_MODULES.filter((m) => !m.essential).map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Action</Label>
                <Select
                  value={bulkEnable ? "grant" : "revoke"}
                  onValueChange={(v) => setBulkEnable(v === "grant")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grant">Grant</SelectItem>
                    <SelectItem value="revoke">Revoke</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Impact preview BEFORE the button, never after. */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="font-medium">
                {selected.size} organization{selected.size === 1 ? "" : "s"} selected
              </div>
              <div className="mt-1 text-muted-foreground">
                {eligible.length} eligible
                {blockedByProtection.length > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-600 dark:text-amber-400">
                      {blockedByProtection.length} blocked (protected)
                    </span>
                  </>
                )}
              </div>
              {blockedByProtection.length > 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {blockedByProtection.map((r) => r.displayName).join(", ")} — protected
                  organizations are excluded from every bulk operation. Open them individually
                  if the change is genuinely intended.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-note">Reason (required, recorded against every organization)</Label>
              <Textarea
                id="bulk-note"
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                rows={2}
                placeholder="e.g. Communication Center included in Growth plan from Oct 2026."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button
              onClick={runBulk}
              variant={bulkEnable ? "default" : "destructive"}
              disabled={bulk.isPending || eligible.length === 0 || bulkNote.trim().length < 5}
            >
              {bulk.isPending
                ? "Applying…"
                : `${bulkEnable ? "Grant" : "Revoke"} for ${eligible.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Global withdrawal dialog ──────────────────────────────────────── */}
      <Dialog open={!!withdraw} onOpenChange={(v) => !v && setWithdraw(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw module platform-wide</DialogTitle>
            <DialogDescription>
              Removes this module from EVERY organization at once, outranking their plans and
              any Super Admin overrides. No tenant data is touched, and re-enabling restores
              each organization to whatever it had before.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm">
              This affects{" "}
              <span className="font-medium">
                {withdraw ? adoption[withdraw.id] ?? 0 : 0} organization
                {(withdraw ? adoption[withdraw.id] ?? 0 : 0) === 1 ? "" : "s"}
              </span>{" "}
              currently using{" "}
              {withdraw ? PLATFORM_MODULES.find((m) => m.id === withdraw.id)?.label : ""}.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="withdraw-note">Reason (required)</Label>
              <Textarea
                id="withdraw-note"
                rows={2}
                value={withdraw?.note ?? ""}
                onChange={(e) => setWithdraw((w) => (w ? { ...w, note: e.target.value } : w))}
                placeholder="e.g. Provider outage — WhatsApp sending disabled until AiSensy restores service."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdraw(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!withdraw || withdraw.note.trim().length < 5 || setGovernance.isPending}
              onClick={() =>
                withdraw &&
                setGovernance.mutate(
                  { moduleKey: withdraw.id, available: false, note: withdraw.note.trim() },
                  { onSuccess: () => setWithdraw(null) },
                )
              }
            >
              Withdraw everywhere
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModulesPage;
