import { ReactNode } from "react";

export interface LeaderRow {
  id: string;
  name: string;
  sub?: string;
  value: number;
  delta?: number;
}

interface Props {
  title: string;
  icon?: ReactNode;
  rows: LeaderRow[];
  suffix?: string;
  emptyLabel?: string;
}

/** Compact ranked list — top attendance / punctual / hours / improved. */
export const Leaderboard = ({ title, icon, rows, suffix = "", emptyLabel = "No data" }: Props) => (
  <div className="glass-card p-4">
    <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-1.5">{icon}{title}</h3>
    {rows.length === 0 ? (
      <p className="text-sm text-muted-foreground py-2">{emptyLabel}</p>
    ) : (
      <ol className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-5 text-center text-xs text-muted-foreground shrink-0">{i + 1}</span>
              <span className="truncate">{r.name}</span>
              {r.sub && <span className="text-xs text-muted-foreground truncate">· {r.sub}</span>}
            </span>
            <span className="font-medium shrink-0">
              {r.value}{suffix}
              {r.delta !== undefined && r.delta > 0 && (
                <span className="text-emerald-600 text-xs ml-1">▲{r.delta}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    )}
  </div>
);
