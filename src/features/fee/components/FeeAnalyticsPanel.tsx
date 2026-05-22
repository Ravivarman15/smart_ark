import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { useFeeAnalytics } from "../hooks";
import { formatINR } from "../utils";

// ─────────────────────────────────────────────────────────────────────────────
// Analytics panel — the read-only reporting surface seeded by feeAnalyticsService.
// Collection KPIs, status mix, an aging breakdown of overdue money and a
// six-month collection trend.
// ─────────────────────────────────────────────────────────────────────────────

const Tile = ({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "green" | "red" | "amber";
  icon?: React.ReactNode;
}) => {
  const toneClass = {
    default: "text-foreground",
    green: "text-green-600",
    red: "text-red-600",
    amber: "text-amber-600",
  }[tone];
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className={`text-xl font-display font-semibold mt-1 ${toneClass}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
};

export const FeeAnalyticsPanel = () => {
  const { data, isLoading } = useFeeAnalytics();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-lg border border-border/60 bg-muted/20 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const maxMonthly = Math.max(1, ...data.monthly.map((m) => m.collected));
  const maxAging = Math.max(1, ...data.aging.map((a) => a.amount));

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          label="Total Billed"
          value={formatINR(data.totalBilled)}
          hint={`${data.studentCount} students`}
          icon={<TrendingUp className="w-3.5 h-3.5" />}
        />
        <Tile
          label="Collected"
          value={formatINR(data.totalCollected)}
          tone="green"
          hint={`${data.collectionRate}% collection rate`}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        />
        <Tile
          label="Pending"
          value={formatINR(data.totalPending)}
          tone="red"
          hint={`${data.partialCount + data.pendingCount} owing`}
          icon={<Clock className="w-3.5 h-3.5" />}
        />
        <Tile
          label="Overdue"
          value={String(data.overdueCount)}
          tone="amber"
          hint={`${formatINR(
            data.aging.reduce((s, a) => s + a.amount, 0),
          )} past due`}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Aging breakdown */}
        <div className="rounded-lg border border-border/60 bg-card/60 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Overdue Aging
          </p>
          {data.overdueCount === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nothing overdue. 🎉
            </p>
          ) : (
            <div className="space-y-2">
              {data.aging.map((bucket) => (
                <div key={bucket.label}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-muted-foreground">
                      {bucket.label}{" "}
                      <span className="text-foreground/60">
                        ({bucket.count})
                      </span>
                    </span>
                    <span className="font-medium text-foreground">
                      {formatINR(bucket.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${(bucket.amount / maxAging) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monthly collection trend */}
        <div className="rounded-lg border border-border/60 bg-card/60 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Collection Trend (6 months)
          </p>
          <div className="flex items-end gap-2 h-28">
            {data.monthly.map((m) => (
              <div
                key={m.month}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full bg-accent/70 rounded-t transition-all"
                    style={{
                      height: `${Math.max(2, (m.collected / maxMonthly) * 100)}%`,
                    }}
                    title={formatINR(m.collected)}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {m.month}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
