import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/core/constants/queryKeys";
import { AttendancePageShell, StatTile } from "../../components";
import { attendanceHealthService, type HealthStatus } from "../services";

const STATUS_META: Record<HealthStatus, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  healthy: { label: "Healthy", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700", Icon: CheckCircle2 },
  warning: { label: "Warning", tone: "border-amber-500/40 bg-amber-500/10 text-amber-700", Icon: AlertTriangle },
  critical: { label: "Critical", tone: "border-rose-500/40 bg-rose-500/10 text-rose-700", Icon: XCircle },
  unknown: { label: "Unknown", tone: "border-slate-500/40 bg-slate-500/10 text-slate-700", Icon: AlertTriangle },
};

const scoreTone = (s: number) => (s >= 90 ? "positive" : s >= 60 ? "warning" : "danger");

const AttendanceHealthPage = () => {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: queryKeys.attendance.health(),
    queryFn: () => attendanceHealthService.report(),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const pendingMigrations = Array.from(
    new Set((data?.checks ?? []).filter((c) => c.status !== "healthy" && c.migration).map((c) => c.migration as string)),
  ).sort();

  const overall = data?.overall ?? "unknown";
  const OverallIcon = STATUS_META[overall].Icon;

  return (
    <AttendancePageShell
      title="Attendance Health"
      description="Focused diagnostics for the attendance module — tables, settings, locks, approvals, alerts, automation runs and realtime. Run this after a migration or when something looks off."
      icon={<HeartPulse className="w-5 h-5" />}
      headerExtra={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Re-run check
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Probing attendance tables…
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Summary ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="glass-card p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Overall</p>
                <p className={`text-2xl font-display font-bold mt-1 ${STATUS_META[overall].tone.split(" ").pop()}`}>
                  {STATUS_META[overall].label}
                </p>
              </div>
              <OverallIcon className="w-7 h-7 opacity-70" />
            </div>
            <StatTile label="Health score" value={`${data?.score ?? 0}%`} tone={scoreTone(data?.score ?? 0)} />
            <StatTile label="Warnings" value={(data?.checks ?? []).filter((c) => c.status === "warning").length} tone="warning" />
            <StatTile label="Critical" value={(data?.checks ?? []).filter((c) => c.status === "critical").length} tone="danger" />
          </div>

          {/* ── Pending migrations callout ───────────────────────────── */}
          {pendingMigrations.length > 0 && (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> Apply these migrations
              </h3>
              <ul className="space-y-1">
                {pendingMigrations.map((m) => (
                  <li key={m} className="font-mono text-xs px-2 py-1 rounded bg-card border border-border/60 text-foreground">
                    supabase/migrations/{m}.sql
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                Then run <code className="font-mono">notify pgrst, 'reload schema';</code> and re-run this check.
              </p>
            </section>
          )}

          {/* ── Checks ───────────────────────────────────────────────── */}
          <div className="glass-card p-0 overflow-hidden">
            <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
              <Activity className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-medium text-foreground">Attendance checks</h3>
            </header>
            <div className="divide-y divide-border/30">
              {(data?.checks ?? []).map((c) => {
                const meta = STATUS_META[c.status];
                const Icon = meta.Icon;
                return (
                  <div key={c.key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{c.label}</span>
                        <Badge variant="outline" className={`text-[10px] inline-flex items-center gap-1 ${meta.tone}`}>
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </Badge>
                        {typeof c.rowCount === "number" && (
                          <span className="text-[10px] text-muted-foreground">{c.rowCount.toLocaleString()} rows</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.detail}</p>
                    </div>
                    {c.migration && (
                      <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{c.migration}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {data && (
            <p className="text-[10px] text-muted-foreground">
              Last probe: {new Date(data.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </AttendancePageShell>
  );
};

export default AttendanceHealthPage;
