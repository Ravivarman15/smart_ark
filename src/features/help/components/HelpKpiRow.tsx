import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export interface HelpKpi {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "positive" | "negative" | "warning" | "info";
}

const TONE: Record<NonNullable<HelpKpi["tone"]>, string> = {
  default: "bg-slate-50 text-slate-700",
  positive: "bg-emerald-50 text-emerald-700",
  negative: "bg-rose-50 text-rose-700",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-sky-50 text-sky-700",
};

interface Props {
  items: HelpKpi[];
}

export const HelpKpiRow = ({ items }: Props) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {items.map((it) => (
      <Card key={it.label} className="p-4 flex items-center gap-3">
        {it.icon && (
          <span
            className={`w-10 h-10 rounded-md flex items-center justify-center ${TONE[it.tone ?? "default"]}`}
          >
            {it.icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {it.label}
          </div>
          <div className="text-2xl font-semibold text-foreground leading-tight">
            {it.value}
          </div>
          {it.hint && (
            <div className="text-xs text-muted-foreground truncate">{it.hint}</div>
          )}
        </div>
      </Card>
    ))}
  </div>
);
