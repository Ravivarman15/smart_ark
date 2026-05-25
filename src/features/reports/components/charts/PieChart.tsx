import type { SeriesPoint } from "../../types/reports.types";
import { formatNumber, percent } from "../../utils/reportCalc";

interface Props {
  data: SeriesPoint[];
  size?: number;
  emptyLabel?: string;
}

const FALLBACK = ["#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6", "#f97316"];

// Pure SVG pie/donut. No deps. Each slice gets a unique colour from the
// fallback ramp unless the data point specifies its own.
export const PieChart = ({ data, size = 180, emptyLabel = "No data" }: Props) => {
  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        {emptyLabel}
      </p>
    );
  }
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  let acc = 0;
  const r = size / 2;
  const cx = r;
  const cy = r;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          const startAngle = (acc / total) * Math.PI * 2;
          acc += d.value;
          const endAngle = (acc / total) * Math.PI * 2;
          const x1 = cx + r * Math.sin(startAngle);
          const y1 = cy - r * Math.cos(startAngle);
          const x2 = cx + r * Math.sin(endAngle);
          const y2 = cy - r * Math.cos(endAngle);
          const large = endAngle - startAngle > Math.PI ? 1 : 0;
          const fill = d.color ?? FALLBACK[i % FALLBACK.length];
          if (data.length === 1) {
            return <circle key={d.label} cx={cx} cy={cy} r={r} fill={fill} />;
          }
          return (
            <path
              key={d.label}
              d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`}
              fill={fill}
            />
          );
        })}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
      </svg>
      <ul className="space-y-1 text-xs flex-1 min-w-0">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 truncate">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: d.color ?? FALLBACK[i % FALLBACK.length] }}
              />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="text-muted-foreground">
              {formatNumber(d.value)} ({percent(d.value, total)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
