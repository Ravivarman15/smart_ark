import type { RiskLevel } from "../types/analytics.types";

const META: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  medium: { label: "Medium", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  high: { label: "High", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  critical: { label: "Critical", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

export const RiskBadge = ({ level }: { level: RiskLevel }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${META[level].className}`}>
    {META[level].label}
  </span>
);
