// ──────────────────────────────────────────────────────────────────────────────
// System Health & Migrations — production-readiness dashboard.
//
// Probes every Supabase table the app depends on (and select additive
// columns) so operators can see at a glance which migrations are applied,
// which are pending, and which modules are running in degraded mode.
//
// Companion to PermissionDiagnosticsPage: that one answers "why does this
// user see X?", this one answers "is the database wired up correctly?".
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Radio,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  systemHealthService,
  type CheckStatus,
  type ModuleCheck,
} from "../services/systemHealth.service";

const STATUS_META: Record<CheckStatus, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  ok:       { label: "OK",       tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700", Icon: CheckCircle2 },
  degraded: { label: "Degraded", tone: "border-amber-500/40 bg-amber-500/10 text-amber-700",        Icon: AlertTriangle },
  missing:  { label: "Missing",  tone: "border-rose-500/40 bg-rose-500/10 text-rose-700",           Icon: XCircle },
  unknown:  { label: "Unknown",  tone: "border-slate-500/40 bg-slate-500/10 text-slate-700",        Icon: AlertTriangle },
};

const SCORE_TONE = (score: number) =>
  score >= 90
    ? "text-emerald-600"
    : score >= 70
      ? "text-amber-600"
      : "text-rose-600";

const SystemHealthPage = () => {
  const [filter, setFilter] = useState("");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["system-health"] as const,
    queryFn: () => systemHealthService.report(),
    // Probing every table is cheap individually but heavy in aggregate, so
    // we don't auto-refetch — operators click Refresh after applying a
    // migration to verify it landed.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, ModuleCheck[]>();
    const q = filter.trim().toLowerCase();
    for (const c of data?.checks ?? []) {
      if (
        q &&
        !c.module.toLowerCase().includes(q) &&
        !c.table.toLowerCase().includes(q) &&
        !(c.column ?? "").toLowerCase().includes(q)
      ) {
        continue;
      }
      const existing = map.get(c.module) ?? [];
      existing.push(c);
      map.set(c.module, existing);
    }
    return Array.from(map.entries());
  }, [data?.checks, filter]);

  // List of migration filenames that have at least one missing/degraded
  // probe — the actionable "what should I apply?" callout at the top.
  // `unknown` probes are deliberately excluded: that status means the table
  // exists but the probe errored for a non-schema reason (almost always RLS /
  // permission-denied), so re-running the migration won't change anything.
  const pendingMigrations = useMemo(() => {
    const set = new Set<string>();
    for (const c of data?.checks ?? []) {
      if ((c.status === "missing" || c.status === "degraded") && c.migration) set.add(c.migration);
    }
    return Array.from(set).sort();
  }, [data?.checks]);

  // Probes that errored for a non-schema reason — surfaced separately so an
  // RLS-blocked table doesn't masquerade as a pending migration.
  const unknownChecks = useMemo(
    () => (data?.checks ?? []).filter((c) => c.status === "unknown"),
    [data?.checks],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex w-9 h-9 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600">
            <Database className="w-4 h-4" />
          </span>
          <div>
            <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
              System Health &amp; Migrations
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Live probe of every table this app expects. Use after applying a
              migration to verify it landed and the schema cache reloaded.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          {isFetching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Re-run health check
        </Button>
      </header>

      {/* ── Summary ──────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <ScoreTile
          label="Readiness"
          value={data ? `${data.summary.readinessScore}%` : "—"}
          tone={data ? SCORE_TONE(data.summary.readinessScore) : ""}
          big
        />
        <ScoreTile label="OK"        value={data?.summary.ok ?? 0}       tone="text-emerald-600" />
        <ScoreTile label="Degraded"  value={data?.summary.degraded ?? 0} tone="text-amber-600" />
        <ScoreTile label="Missing"   value={data?.summary.missing ?? 0}  tone="text-rose-600" />
        <ScoreTile label="Unknown"   value={data?.summary.unknown ?? 0}  tone="text-slate-500" />
        <ScoreTile label="Total"     value={data?.summary.total ?? 0}    tone="text-foreground" />
      </section>

      {/* ── Pending migrations callout ─────────────────────────────── */}
      {pendingMigrations.length > 0 && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Apply these migrations in order
          </h3>
          <p className="text-xs text-muted-foreground">
            Run these SQL files via the Supabase SQL editor (or CLI), then click
            "Re-run health check" above. Each migration is additive and idempotent
            — re-running an already-applied migration is a safe no-op.
          </p>
          <ul className="space-y-1">
            {pendingMigrations.map((m) => (
              <li
                key={m}
                className="font-mono text-xs px-2 py-1 rounded bg-card border border-border/60 text-foreground"
              >
                supabase/migrations/{m}.sql
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            After applying, also run <code className="font-mono">notify pgrst, 'reload schema';</code> in
            the SQL editor to clear PostgREST's column cache.
          </p>
        </section>
      )}

      {/* ── Unknown probes callout ─────────────────────────────────── */}
      {unknownChecks.length > 0 && (
        <section className="rounded-lg border border-slate-500/40 bg-slate-500/5 p-4 space-y-2">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-slate-500" />
            {unknownChecks.length} table{unknownChecks.length > 1 ? "s" : ""} could not be probed
          </h3>
          <p className="text-xs text-muted-foreground">
            These tables exist but the probe errored for a non-schema reason —
            almost always <strong>row-level security denying the current
            role</strong> read access. This is <em>not</em> a missing migration, so
            re-running SQL or reloading the schema won't change it. Check the table's
            RLS policies if this role should be able to read it.
          </p>
          <ul className="space-y-1">
            {unknownChecks.map((c) => (
              <li
                key={`${c.table}-${c.column ?? ""}`}
                className="text-xs px-2 py-1 rounded bg-card border border-border/60 text-foreground"
              >
                <span className="font-mono">{c.table}{c.column ? ` · ${c.column}` : ""}</span>
                {c.message && <span className="text-muted-foreground"> — {c.message}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Filter ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by module, table or column…"
          className="max-w-xs h-9"
        />
      </div>

      {/* ── Results ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Probing tables…
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">No probes match your filter.</p>
          ) : (
            grouped.map(([module, checks]) => (
              <section
                key={module}
                className="rounded-lg border border-border/60 bg-card/40 overflow-hidden"
              >
                <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    {module}
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    {checks.filter((c) => c.status === "ok").length}/{checks.length} green
                  </span>
                </header>
                <div className="divide-y divide-border/30">
                  {checks.map((c, i) => {
                    const meta = STATUS_META[c.status];
                    const Icon = meta.Icon;
                    return (
                      <div
                        key={`${c.table}-${c.column ?? ""}-${i}`}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-foreground truncate">
                              {c.table}
                              {c.column && (
                                <span className="text-muted-foreground"> · {c.column}</span>
                              )}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] inline-flex items-center gap-1 ${meta.tone}`}
                            >
                              <Icon className="w-3 h-3" />
                              {meta.label}
                            </Badge>
                            {c.status === "ok" && typeof c.rowCount === "number" && (
                              <span className="text-[10px] text-muted-foreground">
                                {c.rowCount.toLocaleString()} rows
                              </span>
                            )}
                          </div>
                          {c.message && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {c.message}
                            </p>
                          )}
                        </div>
                        {c.migration && (
                          <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                            {c.migration}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {/* ── Realtime channels ────────────────────────────────────── */}
      {data?.realtimeChannels && (
        <section className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
          <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Radio className="w-4 h-4 text-indigo-600" />
              Realtime channels
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {data.realtimeChannels.length} mounted
            </span>
          </header>
          <div className="divide-y divide-border/30">
            {data.realtimeChannels.map((ch) => {
              // A channel is "ready" only if every table it watches is OK
              // (not missing / not degraded). This makes the at-a-glance
              // status honest — a channel watching 4 tables where one is
              // missing won't actually propagate that table's changes.
              const channelChecks = (data.checks ?? []).filter((c) =>
                ch.tables.includes(c.table) && !c.column,
              );
              const anyMissing = channelChecks.some((c) => c.status === "missing");
              const anyDegraded = channelChecks.some((c) => c.status === "degraded");
              const tone = anyMissing
                ? "border-rose-500/40 bg-rose-500/10 text-rose-700"
                : anyDegraded
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700";
              const label = anyMissing ? "tables missing" : anyDegraded ? "degraded" : "ready";

              return (
                <div
                  key={ch.name}
                  className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-foreground">{ch.name}</span>
                      <Badge variant="outline" className={`text-[10px] ${tone}`}>
                        {label}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{ch.purpose}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Tables:{" "}
                      <span className="font-mono">{ch.tables.join(", ")}</span>
                    </p>
                  </div>
                  {ch.publicationMigration && (
                    <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                      pub via {ch.publicationMigration}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground px-4 py-2 border-t border-border/40">
            Tables must be added to <code className="font-mono">supabase_realtime</code> publication
            before postgres_changes fires. Channel status above reflects whether
            the underlying tables exist — it does <em>not</em> verify publication
            membership (PostgREST doesn't expose <code>pg_publication_tables</code> by default).
          </p>
        </section>
      )}

      {data && (
        <p className="text-[10px] text-muted-foreground">
          Last probe: {new Date(data.generatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
};

const ScoreTile = ({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string | number;
  tone?: string;
  big?: boolean;
}) => (
  <div className="rounded-lg border border-border/60 bg-card/60 px-4 py-3">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p
      className={`font-display font-semibold ${big ? "text-3xl" : "text-2xl"} ${
        tone ?? "text-foreground"
      }`}
    >
      {value}
    </p>
  </div>
);

export default SystemHealthPage;
