import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "success" | "warning" | "danger";

const TONE: Record<Tone, string> = {
  default: "text-foreground",
  accent: "text-primary",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
};

export const LeadKpiCard = ({
  label,
  value,
  suffix,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  suffix?: string;
  icon?: LucideIcon;
  tone?: Tone;
}) => (
  <div className="glass-card flex items-center justify-between gap-3 p-4">
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", TONE[tone])}>
        {value}
        {suffix ? <span className="ml-0.5 text-base font-medium">{suffix}</span> : null}
      </p>
    </div>
    {Icon ? <Icon className={cn("h-5 w-5 shrink-0", TONE[tone])} /> : null}
  </div>
);
