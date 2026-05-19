import { ReactNode } from "react";

interface Props {
  label: string;
  used?: number;
  limit?: number;
  unit?: string;
  icon?: ReactNode;
  /** Optional override message when limit/used aren't meaningful. */
  hint?: string;
}

/**
 * Single usage indicator (e.g. "Staff seats: 12 of 50"). When `limit` is
 * absent the card renders the count only without a progress bar.
 */
export const UsageStatCard = ({ label, used, limit, unit, icon, hint }: Props) => {
  const pct =
    typeof used === "number" && typeof limit === "number" && limit > 0
      ? Math.min(100, Math.round((used / limit) * 100))
      : null;
  const danger = pct !== null && pct >= 85;

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="text-sm font-display font-semibold text-foreground">
            {typeof used === "number" ? used.toLocaleString() : "—"}
            {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
            {typeof limit === "number" && (
              <span className="text-xs text-muted-foreground"> / {limit.toLocaleString()}</span>
            )}
          </p>
        </div>
        {icon && (
          <span className="flex w-7 h-7 items-center justify-center rounded-md bg-muted/60 text-muted-foreground shrink-0">
            {icon}
          </span>
        )}
      </div>
      {pct !== null ? (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              danger ? "bg-destructive" : "bg-accent"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        hint && <p className="text-[10px] text-muted-foreground italic">{hint}</p>
      )}
    </div>
  );
};
