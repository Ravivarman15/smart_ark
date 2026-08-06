import React from "react";
import { RefreshCw } from "lucide-react";
import {
  PageHeader, StatTile, LoadingBlock, formatBytes,
} from "../components/PlatformShell";
import {
  usePlatformSummary, useSystemHealth, useRefreshMetrics, useUsageTrend,
} from "../hooks/usePlatform";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-IN");

/**
 * Control-plane dashboard.
 *
 * Every figure comes from platform_summary() / platform_system_health(), both
 * of which return aggregates. No tenant row is read to render this page — that
 * is the whole design, and it is why "students" is a number here and never a
 * list you can click into.
 */
const PlatformDashboardPage: React.FC = () => {
  const { data: summary, isLoading } = usePlatformSummary();
  const { data: health } = useSystemHealth();
  const { data: trend } = useUsageTrend(30);
  const refresh = useRefreshMetrics();

  const orgs = summary?.organizations;
  const tenancy = summary?.tenancy;
  const usage = summary?.usage_30d;

  const queue = (health?.queue ?? {}) as Record<string, unknown>;
  const db = (health?.database ?? {}) as Record<string, unknown>;
  const tenantHealth = (health?.tenancy ?? {}) as Record<string, unknown>;

  // Aggregate the per-organization daily rows into one platform-wide series.
  const chart = React.useMemo(() => {
    const byDate = new Map<string, { date: string; messages: number; students: number }>();
    for (const r of trend ?? []) {
      const d = String(r.metric_date);
      const cur = byDate.get(d) ?? { date: d.slice(5), messages: 0, students: 0 };
      cur.messages += Number(r.messages_sent ?? 0);
      cur.students += Number(r.students ?? 0);
      byDate.set(d, cur);
    }
    return [...byDate.values()];
  }, [trend]);

  return (
    <div>
      <PageHeader
        title="Platform Dashboard"
        description={
          summary?.metrics_freshness
            ? `Metrics as of ${new Date(summary.metrics_freshness).toLocaleString()}`
            : "Metrics have not been computed yet"
        }
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => refresh.mutate(undefined)}
            disabled={refresh.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            Refresh metrics
          </Button>
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="p-6 space-y-6">
          {/* Organizations */}
          <section>
            <h2 className="text-sm font-medium mb-3">Organizations</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Total" value={n(orgs?.total)} />
              <StatTile label="Active" value={n(orgs?.active)} tone="positive" />
              <StatTile label="Trialing" value={n(orgs?.trialing)} />
              <StatTile
                label="Suspended"
                value={n(orgs?.suspended)}
                tone={Number(orgs?.suspended) > 0 ? "warning" : "default"}
              />
              <StatTile label="Cancelled" value={n(orgs?.cancelled)} />
              <StatTile label="New (30d)" value={n(orgs?.new_30d)} hint="Growth" />
            </div>
          </section>

          {/* Tenancy */}
          <section>
            <h2 className="text-sm font-medium mb-3">Tenancy</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Students" value={n(tenancy?.students)} />
              <StatTile label="Active students" value={n(tenancy?.active_students)} />
              <StatTile label="Staff" value={n(tenancy?.staff)} />
              <StatTile label="Parents" value={n(tenancy?.parents)} />
              <StatTile label="Branches" value={n(tenancy?.branches)} />
              <StatTile label="Storage" value={formatBytes(Number(tenancy?.storage_bytes ?? 0))} />
            </div>
          </section>

          {/* Usage */}
          <section>
            <h2 className="text-sm font-medium mb-3">Usage — last 30 days</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile label="Messages" value={n(usage?.messages)} />
              <StatTile label="WhatsApp" value={n(usage?.whatsapp)} hint="Metered — pass-through COGS" />
              <StatTile label="Email" value={n(usage?.emails)} />
            </div>

            {chart.length > 1 && (
              <div className="mt-4 rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground mb-3">Messages sent per day</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8, fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone" dataKey="messages"
                      stroke="hsl(var(--primary))" fill="hsl(var(--primary))"
                      fillOpacity={0.15} strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Health */}
          <section>
            <h2 className="text-sm font-medium mb-3">System</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Database size"
                value={formatBytes(Number(db.size_bytes ?? 0))}
                hint={`${n(db.tables)} tables · ${n(db.connections)}/${n(db.max_connections)} connections`}
              />
              <StatTile
                label="Queue pending"
                value={n(queue.pending)}
                tone={queue.status === "critical" ? "critical" : queue.status === "degraded" ? "warning" : "default"}
                hint={
                  queue.oldest_pending
                    ? `Oldest: ${new Date(String(queue.oldest_pending)).toLocaleString()}`
                    : "Queue clear"
                }
              />
              <StatTile
                label="Queue failed"
                value={n(queue.failed)}
                tone={Number(queue.failed) > 0 ? "warning" : "default"}
              />
              <StatTile
                label="Tenant isolation"
                value={tenantHealth.status === "ok" ? "Ready" : "Incomplete"}
                tone={tenantHealth.status === "ok" ? "positive" : "warning"}
                hint={`${n(tenantHealth.unsafe_unique_constraints)} unsafe unique constraint(s)`}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default PlatformDashboardPage;
