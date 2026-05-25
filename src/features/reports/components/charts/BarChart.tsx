import { formatNumber } from "../../utils/reportCalc";
import type { SeriesPoint } from "../../types/reports.types";

interface Props {
  data: SeriesPoint[];
  /** Render value labels above bars. Defaults to true. */
  showValues?: boolean;
  /** Override the colour of every bar. Defaults to the accent ramp. */
  color?: string;
  height?: number;
  emptyLabel?: string;
}

const FALLBACK = ["#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ef4444"];

export const BarChart = ({
  data,
  showValues = true,
  color,
  height = 160,
  emptyLabel = "No data",
}: Props) => {
  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        {emptyLabel}
      </p>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.value / max) * 100));
          const fill = d.color ?? color ?? FALLBACK[i % FALLBACK.length];
          return (
            <div
              key={d.label}
              className="flex-1 flex flex-col items-center gap-1 min-w-0"
            >
              {showValues && (
                <span className="text-[10px] text-muted-foreground truncate">
                  {formatNumber(d.value)}
                </span>
              )}
              <div className="w-full bg-muted rounded-t overflow-hidden flex-1 flex items-end">
                <div
                  className="w-full rounded-t transition-all"
                  style={{ height: `${h}%`, backgroundColor: fill }}
                  title={`${d.label}: ${formatNumber(d.value)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-1">
        {data.map((d) => (
          <div key={d.label} className="flex-1 text-center text-[10px] text-muted-foreground truncate">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
};
