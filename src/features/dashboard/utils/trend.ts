import type { TrendDirection, TrendSummary } from "../types/dashboard.types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Derive change% + direction between two raw counts/amounts.
 * `previous = 0` returns `changePct: null` so the UI can render "—" instead
 * of a noisy "+Infinity%".
 */
export const summariseTrend = (current: number, previous: number): TrendSummary => {
  if (previous === 0) {
    return {
      current,
      previous,
      changePct: null,
      direction: current > 0 ? "up" : "flat",
    };
  }
  const change = round2(((current - previous) / Math.abs(previous)) * 100);
  const direction: TrendDirection = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return { current, previous, changePct: change, direction };
};

/** "+12.4%" / "−3.1%" / "—" for display. */
export const formatChangePct = (changePct: number | null): string => {
  if (changePct === null) return "—";
  if (changePct === 0) return "0%";
  const sign = changePct > 0 ? "+" : "−";
  return `${sign}${Math.abs(changePct).toFixed(1)}%`;
};
