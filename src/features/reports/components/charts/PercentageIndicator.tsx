interface Props {
  value: number;
  tone?: "default" | "positive" | "warning" | "negative";
  size?: "sm" | "md";
  showBar?: boolean;
  label?: string;
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  default: "bg-sky-500",
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  negative: "bg-rose-500",
};

export const PercentageIndicator = ({
  value,
  tone = "default",
  size = "md",
  showBar = true,
  label,
}: Props) => {
  const clamped = Math.max(0, Math.min(100, value));
  const barH = size === "sm" ? "h-1" : "h-2";
  return (
    <div className="space-y-1 w-full">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value.toFixed(1)}%</span>
      </div>
      {showBar && (
        <div className={`${barH} rounded-full bg-muted overflow-hidden`}>
          <div
            className={`h-full rounded-full ${TONE[tone]}`}
            style={{ width: `${clamped}%` }}
          />
        </div>
      )}
    </div>
  );
};
