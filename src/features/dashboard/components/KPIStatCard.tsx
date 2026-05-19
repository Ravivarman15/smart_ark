import { memo, type ReactNode } from "react";
import { resolveIcon } from "@/shared/icons";
import { TrendBadge } from "./TrendBadge";
import type { TrendSummary } from "../types/dashboard.types";

interface Props {
  label: string;
  value: ReactNode;
  /** Lucide icon key — see `src/shared/icons.ts`. */
  icon?: string;
  /** Optional sublabel (e.g. "vs last week"). */
  hint?: string;
  /** Trend chip; omit for static counters. */
  trend?: TrendSummary;
  /** Treat "down" as the good direction (expenses, overdue, refunds). */
  invertSentiment?: boolean;
  /** Tone of the icon dot — purely visual. */
  tone?: "default" | "success" | "warning" | "danger" | "info";
}

const TONE_BG: Record<NonNullable<Props["tone"]>, string> = {
  default: "bg-muted text-foreground",
  success: "bg-emerald-500/10 text-emerald-600",
  warning: "bg-amber-500/10 text-amber-600",
  danger: "bg-rose-500/10 text-rose-600",
  info: "bg-sky-500/10 text-sky-600",
};

/**
 * Generic KPI tile. All numeric counters on the dashboard render through
 * this — visual consistency without copy/pasting layout markup.
 *
 * Memoised because dashboards re-render on every analytics refresh; the tile
 * itself only changes when its props do.
 */
export const KPIStatCard = memo(function KPIStatCard({
  label,
  value,
  icon,
  hint,
  trend,
  invertSentiment,
  tone = "default",
}: Props) {
  const Icon = resolveIcon(icon);
  return (
    <div className="flex flex-col h-full justify-between gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wider uppercase text-muted-foreground">
          {label}
        </span>
        <span className={`flex items-center justify-center w-7 h-7 rounded-md ${TONE_BG[tone]}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className="text-2xl font-display font-semibold text-foreground leading-tight">
        {value}
      </div>
      <div className="flex items-center justify-between gap-2">
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : <span />}
        {trend ? (
          <TrendBadge
            changePct={trend.changePct}
            direction={trend.direction}
            invertSentiment={invertSentiment}
          />
        ) : null}
      </div>
    </div>
  );
});
