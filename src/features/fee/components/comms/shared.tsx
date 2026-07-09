import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared presentational atoms for the Fee Communication Center. Pure UI — no
// data logic. Kept local to the comms panels so they stay self-contained.
// ─────────────────────────────────────────────────────────────────────────────

const ringColor = (pct: number): string =>
  pct >= 85 ? "#16a34a" : pct >= 60 ? "#d97706" : "#dc2626";

/** SVG progress ring (health %, delivery %, etc.). */
export const ProgressRing: React.FC<{
  value: number;
  label: string;
  size?: number;
  sub?: string;
}> = ({ value, label, size = 120, sub }) => {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (v / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor(v)}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="rotate-90"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
          style={{ fontSize: size * 0.22, fontWeight: 700, fill: "hsl(var(--foreground))" }}
        >
          {v}%
        </text>
      </svg>
      <p className="text-sm font-medium text-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
};

/** Compact KPI tile. `tone` colours the value for at-a-glance risk reading. */
export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  hint?: string;
}> = ({ label, value, tone = "default", hint }) => {
  const toneCls =
    tone === "good"
      ? "text-green-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-foreground";
  return (
    <div className="glass-card p-3 border border-border/40">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${toneCls}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
};

export const PanelHeading: React.FC<{ title: string; desc?: string; right?: React.ReactNode }> = ({
  title,
  desc,
  right,
}) => (
  <div className="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
    </div>
    {right}
  </div>
);

/** Small coloured status chip for delivery states. */
export const StatusChip: React.FC<{ status?: string }> = ({ status }) => {
  const s = (status ?? "").toLowerCase();
  const map: Record<string, string> = {
    read: "bg-green-50 text-green-700 border-green-200",
    delivered: "bg-green-50 text-green-700 border-green-200",
    sent: "bg-blue-50 text-blue-700 border-blue-200",
    queued: "bg-amber-50 text-amber-700 border-amber-200",
    processing: "bg-amber-50 text-amber-700 border-amber-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-slate-50 text-slate-600 border-slate-200",
  };
  const cls = map[s] ?? "bg-slate-50 text-slate-500 border-slate-200";
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {status ?? "not sent"}
    </span>
  );
};
