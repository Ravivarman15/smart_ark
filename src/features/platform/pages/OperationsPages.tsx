// ──────────────────────────────────────────────────────────────────────────────
// OPERATIONS & GOVERNANCE PAGES
// usage · storage · system health · audit · security · logs · support ·
// backups · platform settings · platform users · feature flags
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Plus, Pencil } from "lucide-react";
import {
  PageHeader, StatTile, StatusPill, LoadingBlock, EmptyState, ReservedNotice,
  formatBytes,
} from "../components/PlatformShell";
import {
  useUsageTrend, useSystemHealth, usePlatformAudit, useOrganizations,
  usePlatformSettings, usePlatformUsers, useInvitePlatformUser,
  useImpersonationGrants, useRefreshMetrics, useSaveSetting,
} from "../hooks/usePlatform";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const num = (v: unknown) => Number(v ?? 0);

// ── Usage ───────────────────────────────────────────────────────────────────

export const UsagePage: React.FC = () => {
  const [days, setDays] = useState("30");
  const { data: rows, isLoading } = useUsageTrend(Number(days));
  const refresh = useRefreshMetrics();

  const series = useMemo(() => {
    const m = new Map<string, { date: string; whatsapp: number; email: number; students: number }>();
    for (const r of rows ?? []) {
      const d = String(r.metric_date);
      const cur = m.get(d) ?? { date: d.slice(5), whatsapp: 0, email: 0, students: 0 };
      cur.whatsapp += num(r.whatsapp_sent);
      cur.email += num(r.emails_sent);
      cur.students += num(r.students);
      m.set(d, cur);
    }
    return [...m.values()];
  }, [rows]);

  const totals = useMemo(() => {
    let wa = 0, em = 0, msg = 0;
    for (const r of rows ?? []) {
      wa += num(r.whatsapp_sent); em += num(r.emails_sent); msg += num(r.messages_sent);
    }
    return { wa, em, msg };
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Usage Analytics"
        description="Aggregated from the daily rollup — no tenant row is read to render this"
        actions={
          <>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => refresh.mutate(undefined)} disabled={refresh.isPending}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refresh.isPending ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </>
        }
      />
      {isLoading ? <LoadingBlock /> : (
        <div className="p-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Messages" value={totals.msg.toLocaleString("en-IN")} />
            <StatTile label="WhatsApp" value={totals.wa.toLocaleString("en-IN")} hint="Pass-through COGS — meter and bill this" />
            <StatTile label="Email" value={totals.em.toLocaleString("en-IN")} />
          </div>
          {series.length > 1 ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="whatsapp" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="email" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Not enough data yet"
              description="The rollup runs nightly. Press Refresh to compute today's row now."
            />
          )}
        </div>
      )}
    </div>
  );
};

// ── Storage ─────────────────────────────────────────────────────────────────

export const StoragePage: React.FC = () => {
  const { data: orgs, isLoading } = useOrganizations();
  const total = (orgs ?? []).reduce((s, o) => s + o.storageBytes, 0);

  if (isLoading) return <LoadingBlock />;
  return (
    <div>
      <PageHeader title="Storage" description={`${formatBytes(total)} across ${orgs?.length ?? 0} organization(s)`} />
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border divide-y divide-border">
          {(orgs ?? []).map((o) => (
            <div key={o.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <Link to={`/platform/organization/${o.id}`} className="hover:underline">
                {o.displayName}
              </Link>
              <span className="tabular-nums text-muted-foreground">{formatBytes(o.storageBytes)}</span>
            </div>
          ))}
        </div>
        <ReservedNotice phase="Phase 1E operations">
          Per-object storage accounting requires the relocation script to have run so
          every object sits under its organization prefix. Until then these figures
          come from the rollup and may under-report legacy objects.
        </ReservedNotice>
      </div>
    </div>
  );
};

// ── System health ───────────────────────────────────────────────────────────

export const SystemHealthPage: React.FC = () => {
  const { data: health, isLoading } = useSystemHealth();
  if (isLoading) return <LoadingBlock />;

  const section = (key: string) => (health?.[key] ?? {}) as Record<string, unknown>;
  const db = section("database"), queue = section("queue"), rt = section("realtime");
  const tenancy = section("tenancy"), imp = section("impersonation"), infra = section("infrastructure");

  const tone = (s: unknown) =>
    s === "critical" ? "critical" : s === "degraded" ? "warning" : "positive";

  return (
    <div>
      <PageHeader title="System Health" description="Live, refreshed every 60 seconds" />
      <div className="p-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Database size" value={formatBytes(num(db.size_bytes))}
            hint={`${num(db.tables)} tables`} />
          <StatTile label="Connections" value={`${num(db.connections)} / ${num(db.max_connections)}`} />
          <StatTile label="Queue pending" value={num(queue.pending)} tone={tone(queue.status) as never}
            hint={queue.oldest_pending ? `Oldest ${new Date(String(queue.oldest_pending)).toLocaleTimeString()}` : "Clear"} />
          <StatTile label="Queue failed" value={num(queue.failed)}
            tone={num(queue.failed) > 0 ? "warning" : "default"} />
          <StatTile label="Realtime tables" value={num(rt.published_tables)} />
          <StatTile label="Tenant isolation" value={tenancy.status === "ok" ? "Ready" : "Incomplete"}
            tone={tone(tenancy.status) as never}
            hint={`${num(tenancy.unsafe_unique_constraints)} unsafe constraint(s)`} />
          <StatTile label="Active impersonations" value={num(imp.active)}
            hint={`${num(imp.last_24h)} in last 24h`} />
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-medium">Infrastructure</div>
          <p className="text-sm text-muted-foreground mt-1">{String(infra.note ?? "")}</p>
          <p className="text-[11px] text-muted-foreground mt-2">
            Deliberately reported as unavailable rather than fabricated. A dashboard
            showing an invented 42% CPU is worse than one that says it cannot see it.
          </p>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-medium mb-2">Tenancy readiness</div>
          <div className="space-y-1 text-sm">
            {Object.entries((tenancy.readiness ?? {}) as Record<string, boolean>).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-muted-foreground font-mono text-xs">{k}</span>
                <StatusPill status={v ? "active" : "past_due"} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Audit ───────────────────────────────────────────────────────────────────

export const AuditPage: React.FC = () => {
  const [action, setAction] = useState("all");
  const { data: entries, isLoading } = usePlatformAudit({
    action: action === "all" ? undefined : action,
    limit: 300,
  });

  const actions = useMemo(
    () => [...new Set((entries ?? []).map((e) => e.action))].sort(),
    [entries],
  );

  return (
    <div>
      <PageHeader
        title="Audit Center"
        description="Append-only. UPDATE and DELETE are blocked by a database trigger, not by convention."
        actions={
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      <div className="p-6">
        {isLoading ? <LoadingBlock />
          : !entries?.length ? <EmptyState title="No audit entries" />
          : (
            <div className="rounded-lg border border-border divide-y divide-border text-sm">
              {entries.map((e) => (
                <div key={e.id} className="px-4 py-2.5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium">{e.action}</div>
                    {e.detail && <div className="text-xs text-muted-foreground truncate">{e.detail}</div>}
                    {e.targetType && (
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {e.targetType}:{e.targetId?.slice(0, 8)}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <div>{e.actorEmail ?? "—"}</div>
                    <div>{e.createdAt.slice(0, 19).replace("T", " ")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
};

// ── Security ────────────────────────────────────────────────────────────────

export const SecurityPage: React.FC = () => {
  const { data: grants, isLoading } = useImpersonationGrants();
  const { data: health } = useSystemHealth();
  const tenancy = (health?.tenancy ?? {}) as Record<string, unknown>;

  const active = (grants ?? []).filter((g) => !g.endedAt && new Date(g.expiresAt) > new Date());

  return (
    <div>
      <PageHeader title="Security" description="Tenant access and isolation posture" />
      <div className="p-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Active impersonations" value={active.length}
            tone={active.length > 0 ? "warning" : "positive"} />
          <StatTile label="Total sessions" value={grants?.length ?? 0} />
          <StatTile label="Unsafe unique constraints" value={num(tenancy.unsafe_unique_constraints)}
            tone={num(tenancy.unsafe_unique_constraints) > 0 ? "warning" : "positive"} />
        </div>

        <div className="rounded-lg border border-border p-4 text-sm space-y-2">
          <div className="font-medium">Access model</div>
          <p className="text-muted-foreground">
            No policy on any of the 167 tenant tables references <code>is_platform_admin()</code>.
            Platform staff read aggregates only; reaching a tenant row requires a
            time-boxed, reason-tagged impersonation grant capped at 60 minutes.
          </p>
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Impersonation history</div>
          {isLoading ? <LoadingBlock />
            : !grants?.length ? <EmptyState title="No impersonation sessions recorded" />
            : (
              <div className="rounded-lg border border-border divide-y divide-border text-sm">
                {grants.map((g) => (
                  <div key={g.id} className="px-4 py-2.5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{g.reason}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {g.ticketRef ? `${g.ticketRef} · ` : ""}
                        {g.customerConsent ? "consented" : "no recorded consent"}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <div>{g.startedAt.slice(0, 19).replace("T", " ")}</div>
                      <div>{g.endedAt ? "Ended" : new Date(g.expiresAt) > new Date() ? "Active" : "Expired"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

// ── Logs ────────────────────────────────────────────────────────────────────

export const LogsPage: React.FC = () => (
  <div>
    <PageHeader title="Logs" />
    <div className="p-6">
      <ReservedNotice phase="Phase 11 (Observability)">
        Application and edge-function logs live in the Supabase log stream, not in
        Postgres, so they cannot be queried from here. Phase 11 introduces log
        shipping with an <code>organization_id</code> dimension. Until then, use the
        Audit Center for platform actions and the Supabase dashboard for runtime logs —
        rather than a page that appears to show logs and does not.
      </ReservedNotice>
    </div>
  </div>
);

// ── Support ─────────────────────────────────────────────────────────────────

export const SupportPage: React.FC = () => {
  const { data: orgs, isLoading } = useOrganizations();
  const atRisk = (orgs ?? []).filter((o) => o.healthScore < 40 && o.status !== "cancelled");

  if (isLoading) return <LoadingBlock />;
  return (
    <div>
      <PageHeader title="Support & Customer Success" description="Health-scored account list" />
      <div className="p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Accounts" value={orgs?.length ?? 0} />
          <StatTile label="At risk (health < 40)" value={atRisk.length}
            tone={atRisk.length > 0 ? "warning" : "positive"} />
          <StatTile label="Trialing" value={(orgs ?? []).filter((o) => o.status === "trialing").length} />
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Accounts needing attention</div>
          {atRisk.length === 0 ? (
            <EmptyState title="No at-risk accounts" />
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border text-sm">
              {atRisk.map((o) => (
                <div key={o.id} className="px-4 py-2.5 flex items-center justify-between">
                  <Link to={`/platform/organization/${o.id}`} className="hover:underline font-medium">
                    {o.displayName}
                  </Link>
                  <div className="flex items-center gap-3">
                    <StatusPill status={o.status} />
                    <span className="text-xs text-red-600 dark:text-red-400 tabular-nums">
                      {o.healthScore}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <ReservedNotice phase="Phase 10 (Customer Success)">
          Ticket triage reuses the existing <code>support_tickets</code> module rather than
          duplicating it. Cross-tenant ticket views arrive with the Customer Success phase.
        </ReservedNotice>
      </div>
    </div>
  );
};

// ── Backups ─────────────────────────────────────────────────────────────────

export const BackupsPage: React.FC = () => (
  <div>
    <PageHeader title="Backups & Disaster Recovery" />
    <div className="p-6 space-y-4">
      <div className="rounded-lg border border-border p-4 text-sm space-y-2">
        <div className="font-medium">Current posture</div>
        <p className="text-muted-foreground">
          Backups and point-in-time recovery are managed by Supabase at the project
          level and are not controllable from SQL — so this page deliberately does not
          offer a "Back up now" button it cannot honour.
        </p>
        <p className="text-muted-foreground">
          Operational requirement: <strong>a restore that has not been tested is not a
          backup.</strong> Verify PITR monthly. Target RPO 5 minutes, RTO 4 hours.
        </p>
      </div>
      <ReservedNotice phase="Phase 11 (Scale)">
        Per-organization export, retention policy and automated restore rehearsal.
      </ReservedNotice>
    </div>
  </div>
);

// ── Platform settings ───────────────────────────────────────────────────────

/**
 * One editable setting row.
 *
 * The value is jsonb of no fixed shape, so the editor is a JSON textarea rather
 * than a generated form — a form would have to guess at keys and would silently
 * drop any it did not know about. Parsing is validated on every keystroke and
 * Save is disabled while the text is invalid, because writing malformed config
 * to a table the whole platform reads is not an error worth discovering later.
 */
const SettingRow: React.FC<{ row: Record<string, unknown>; editable: boolean }> = ({
  row, editable,
}) => {
  const save = useSaveSetting();
  const original = useMemo(() => JSON.stringify(row.value, null, 2), [row.value]);
  const [draft, setDraft] = useState(original);
  const [editing, setEditing] = useState(false);

  // A realtime update from another operator must not be silently overwritten by
  // a stale draft, so re-sync whenever the row changes while not being edited.
  useEffect(() => {
    if (!editing) setDraft(original);
  }, [original, editing]);

  const parsed = useMemo(() => {
    try { return { ok: true as const, value: JSON.parse(draft) }; }
    catch (e) { return { ok: false as const, message: (e as Error).message }; }
  }, [draft]);

  const dirty = draft !== original;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium font-mono">{String(row.key)}</div>
          <div className="text-[11px] text-muted-foreground">{String(row.description ?? "")}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.is_secret ? <StatusPill status="suspended" /> : null}
          {editable && !editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            rows={Math.min(12, draft.split("\n").length + 1)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-[11px]"
            spellCheck={false}
          />
          {!parsed.ok && (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              Invalid JSON — {parsed.message}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!parsed.ok || !dirty || save.isPending}
              onClick={() =>
                save.mutate(
                  { key: String(row.key), value: parsed.ok ? parsed.value : null },
                  { onSuccess: () => setEditing(false) },
                )
              }
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost"
              onClick={() => { setDraft(original); setEditing(false); }}>
              Cancel
            </Button>
            {dirty && <span className="text-[11px] text-muted-foreground">Unsaved changes</span>}
          </div>
        </div>
      ) : (
        <pre className="mt-2 rounded bg-muted/50 p-2 text-[11px] overflow-x-auto">
          {original}
        </pre>
      )}
    </div>
  );
};

export const PlatformSettingsPage: React.FC = () => {
  const { data: settings, isLoading } = usePlatformSettings();
  const { can } = usePlatformAuth();
  if (isLoading) return <LoadingBlock />;

  const editable = can("settings.manage");

  return (
    <div>
      <PageHeader
        title="Platform Settings"
        description={
          editable
            ? "Global configuration — changes apply immediately across the platform"
            : "Global configuration (read-only — requires `settings.manage`)"
        }
      />
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border divide-y divide-border">
          {(settings ?? []).map((s) => (
            <SettingRow key={String(s.key)} row={s} editable={editable} />
          ))}
        </div>
        <div className="rounded-lg border border-border p-4 text-sm">
          <div className="font-medium">Provider credentials</div>
          <p className="text-muted-foreground mt-1">
            API keys are <strong>never</strong> stored in this table. It is readable by
            every platform employee and reachable over PostgREST; secrets live in edge
            function environment variables only
            (<code>npx supabase secrets set …</code>).
          </p>
        </div>
      </div>
    </div>
  );
};

// ── Platform users ──────────────────────────────────────────────────────────

export const PlatformUsersPage: React.FC = () => {
  const { data: users, isLoading } = usePlatformUsers();
  const { can } = usePlatformAuth();
  const invite = useInvitePlatformUser();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "support" });

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Platform Users"
        description="Smart ARK employees. Never a profiles row in any tenant."
        actions={
          can("platform.users.manage") ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Invite
            </Button>
          ) : null
        }
      />
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-4 py-2.5">Email</th>
                <th className="text-left font-medium px-4 py-2.5">Role</th>
                <th className="text-left font-medium px-4 py-2.5">MFA</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(users ?? []).map((u) => (
                <tr key={String(u.id)}>
                  <td className="px-4 py-2.5 font-medium">{String(u.name)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{String(u.email)}</td>
                  <td className="px-4 py-2.5 capitalize">{String(u.role).replace("_", " ")}</td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={u.mfa_enrolled ? "active" : "past_due"} />
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={u.is_active ? "active" : "suspended"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          An invited account cannot reach the control plane until MFA is enrolled — the
          access-token hook issues no platform claim without it. Invitation is not access.
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite platform user</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="pname">Name</Label>
              <Input id="pname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pemail">Email</Label>
              <Input id="pemail" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["owner","admin","finance","support","sales","customer_success","auditor"].map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => invite.mutate(form, { onSuccess: () => setOpen(false) })}
              disabled={invite.isPending || !form.email || !form.name}
            >
              Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Feature flags (cross-organization view) ─────────────────────────────────

export const FeatureFlagsPage: React.FC = () => {
  const { data: orgs, isLoading } = useOrganizations();
  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Feature Flags"
        description="Per-organization module toggles. Open an organization to edit."
      />
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border divide-y divide-border text-sm">
          {(orgs ?? []).map((o) => (
            <Link
              key={o.id}
              to={`/platform/organization/${o.id}`}
              className="px-4 py-2.5 flex items-center justify-between hover:bg-accent/40"
            >
              <span className="font-medium">{o.displayName}</span>
              <span className="text-xs text-muted-foreground">
                {o.planCode ?? "no plan"} · configure →
              </span>
            </Link>
          ))}
        </div>
        <div className="rounded-lg border border-border p-4 text-sm">
          <div className="font-medium">Resolution order</div>
          <p className="text-muted-foreground mt-1">
            <code>plan_features</code> → overridden by <code>organization_features</code> →
            intersected with RBAC permissions. Every change is written to
            <code> feature_flag_assignments</code> by a trigger, so "this module vanished"
            always has an answer.
          </p>
          <p className="text-muted-foreground mt-2">
            Enforcement in the ERP sidebar and in RLS arrives with Phase 6. Phase 2
            manages the data.
          </p>
        </div>
      </div>
    </div>
  );
};
