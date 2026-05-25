import type { SeriesPoint } from "../../types/reports.types";
import { formatNumber } from "../../utils/reportCalc";

interface Props {
  data: SeriesPoint[];
  height?: number;
  color?: string;
  emptyLabel?: string;
}

// Pure SVG line + area chart. No charting library — the path is computed
// from the data, the rest is CSS.
export const LineChart = ({
  data,
  height = 160,
  color = "#0ea5e9",
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
  const w = 600;
  const h = height;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data
    .map((d, i) => `${i * step},${h - (d.value / max) * (h - 20) - 10}`)
    .join(" ");
  const area = `0,${h} ${points} ${w},${h}`;
  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        <polygon points={area} fill={color} opacity="0.12" />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((d, i) => (
          <circle
            key={d.label}
            cx={i * step}
            cy={h - (d.value / max) * (h - 20) - 10}
            r={3}
            fill={color}
          >
            <title>{`${d.label}: ${formatNumber(d.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  );
};
