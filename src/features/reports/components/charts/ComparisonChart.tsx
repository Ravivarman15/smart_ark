import type { SeriesPoint } from "../../types/reports.types";
import { formatNumber } from "../../utils/reportCalc";

interface Props {
  data: SeriesPoint[];
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  height?: number;
  emptyLabel?: string;
}

// Side-by-side two-series bar chart. Each point exposes `value` (primary)
// and `secondary`. Used for plan vs actual, prev vs curr, etc.
export const ComparisonChart = ({
  data,
  primaryLabel = "Primary",
  secondaryLabel = "Secondary",
  primaryColor = "#0ea5e9",
  secondaryColor = "#94a3b8",
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
  const max = Math.max(
    1,
    ...data.flatMap((d) => [d.value, d.secondary ?? 0]),
  );
  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d) => {
          const ph = Math.max(2, Math.round((d.value / max) * 100));
          const sh = Math.max(2, Math.round(((d.secondary ?? 0) / max) * 100));
          return (
            <div
              key={d.label}
              className="flex-1 flex flex-col items-center min-w-0"
            >
              <div className="flex items-end gap-0.5 w-full justify-center flex-1">
                <div
                  className="w-3 rounded-t"
                  style={{ height: `${ph}%`, backgroundColor: primaryColor }}
                  title={`${primaryLabel} — ${d.label}: ${formatNumber(d.value)}`}
                />
                <div
                  className="w-3 rounded-t"
                  style={{ height: `${sh}%`, backgroundColor: secondaryColor }}
                  title={`${secondaryLabel} — ${d.label}: ${formatNumber(d.secondary ?? 0)}`}
                />
              </div>
              <div className="text-[10px] text-muted-foreground truncate w-full text-center mt-1">
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-center gap-3 text-[11px] text-muted-foreground mt-2">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded" style={{ backgroundColor: primaryColor }} />
          {primaryLabel}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded" style={{ backgroundColor: secondaryColor }} />
          {secondaryLabel}
        </span>
      </div>
    </div>
  );
};
