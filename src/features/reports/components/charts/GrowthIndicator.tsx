import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

interface Props {
  value: number;
  /** When true, "down" is treated as the positive direction (e.g. expense growth). */
  invert?: boolean;
  suffix?: string;
  className?: string;
}

export const GrowthIndicator = ({
  value,
  invert = false,
  suffix = "%",
  className,
}: Props) => {
  const up = value > 0;
  const flat = value === 0;
  const positive = flat ? false : invert ? !up : up;
  const tone = flat
    ? "text-muted-foreground"
    : positive
      ? "text-emerald-600"
      : "text-rose-600";
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${tone} ${className ?? ""}`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
};
