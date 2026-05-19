import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatChangePct } from "../utils/trend";
import type { TrendDirection } from "../types/dashboard.types";

interface Props {
  changePct: number | null;
  direction: TrendDirection;
  /** Whether "down" is the *desired* direction (e.g., expenses, overdue). */
  invertSentiment?: boolean;
  className?: string;
}

/**
 * Compact trend chip — arrow + percentage. Pure visual; trend math happens
 * in `summariseTrend()`.
 */
export const TrendBadge = ({ changePct, direction, invertSentiment, className = "" }: Props) => {
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;
  const isGood =
    direction === "flat"
      ? true
      : invertSentiment
        ? direction === "down"
        : direction === "up";

  const tone = direction === "flat"
    ? "text-muted-foreground bg-muted/40"
    : isGood
      ? "text-emerald-600 bg-emerald-500/10"
      : "text-rose-600 bg-rose-500/10";

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${tone} ${className}`}
    >
      <Icon className="w-3 h-3" />
      {formatChangePct(changePct)}
    </span>
  );
};
