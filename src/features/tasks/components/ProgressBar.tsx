import { cn } from "@/lib/utils";

export const ProgressBar = ({
  value,
  className,
  showLabel = true,
}: {
  value: number;
  className?: string;
  showLabel?: boolean;
}) => {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const color =
    pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : pct > 0 ? "bg-blue-500" : "bg-slate-500";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{pct}%</span>}
    </div>
  );
};
