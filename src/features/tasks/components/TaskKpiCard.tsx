import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const TaskKpiCard = ({
  label,
  value,
  icon: Icon,
  tone = "default",
  suffix,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "danger" | "success" | "accent";
  suffix?: string;
}) => {
  const toneCls: Record<string, string> = {
    default: "text-foreground",
    warning: "text-amber-500",
    danger: "text-red-500",
    success: "text-green-500",
    accent: "text-accent",
  };
  const iconBg: Record<string, string> = {
    default: "bg-muted/40 text-muted-foreground",
    warning: "bg-amber-500/15 text-amber-500",
    danger: "bg-red-500/15 text-red-500",
    success: "bg-green-500/15 text-green-500",
    accent: "bg-accent/15 text-accent",
  };
  return (
    <div className="glass-card flex items-center gap-3 p-4">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconBg[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className={cn("font-display text-2xl font-bold leading-none", toneCls[tone])}>
          {value}
          {suffix && <span className="text-sm font-semibold">{suffix}</span>}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
};
