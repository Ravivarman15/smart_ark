import type { SeriesPoint } from "../types/analytics.types";

interface Props {
  data: SeriesPoint[];
  height?: number;
  color?: string;
  /** Append "%" to point tooltips/labels. */
  suffix?: string;
  emptyLabel?: string;
}

/**
 * Pure SVG line + area chart — no charting library, fully responsive
 * (viewBox + preserveAspectRatio). Mirrors the reports-feature LineChart so
 * the analytics chunk stays lean.
 */
export const MiniLineChart = ({ data, height = 160, color = "#0ea5e9", suffix = "", emptyLabel = "No data" }: Props) => {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground py-6 text-center">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 600;
  const h = height;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data.map((d, i) => `${i * step},${h - (d.value / max) * (h - 20) - 10}`).join(" ");
  const area = `0,${h} ${points} ${w},${h}`;
  // Thin the x-axis labels so dense daily series stay readable.
  const labelEvery = Math.ceil(data.length / 12);
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <polygon points={area} fill={color} opacity="0.12" />
        <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={`${d.label}-${i}`} cx={i * step} cy={h - (d.value / max) * (h - 20) - 10} r={2.5} fill={color}>
            <title>{`${d.label}: ${d.value}${suffix}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        {data.map((d, i) => (
          <span key={`${d.label}-${i}`} className={i % labelEvery === 0 ? "" : "opacity-0"}>{d.label}</span>
        ))}
      </div>
    </div>
  );
};
