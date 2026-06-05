import type { SeriesPoint } from "../types/analytics.types";

interface Props {
  data: SeriesPoint[];
  height?: number;
  color?: string;
  suffix?: string;
  emptyLabel?: string;
}

const FALLBACK = ["#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ef4444"];

/** Pure CSS bar chart — responsive, no charting library. */
export const MiniBarChart = ({ data, height = 160, color, suffix = "", emptyLabel = "No data" }: Props) => {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground py-6 text-center">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.value / max) * 100));
          const fill = d.color ?? color ?? FALLBACK[i % FALLBACK.length];
          return (
            <div key={`${d.label}-${i}`} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span className="text-[10px] text-muted-foreground truncate">{d.value}{suffix}</span>
              <div className="w-full bg-muted rounded-t overflow-hidden flex-1 flex items-end">
                <div className="w-full rounded-t transition-all" style={{ height: `${barH}%`, backgroundColor: fill }} title={`${d.label}: ${d.value}${suffix}`} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-1">
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="flex-1 text-center text-[10px] text-muted-foreground truncate">{d.label}</div>
        ))}
      </div>
    </div>
  );
};
