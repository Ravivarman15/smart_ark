import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "positive" | "negative" | "warning" | "info";
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  default: "from-slate-50 to-white text-slate-900",
  positive: "from-emerald-50 to-white text-emerald-900",
  negative: "from-rose-50 to-white text-rose-900",
  warning: "from-amber-50 to-white text-amber-900",
  info: "from-sky-50 to-white text-sky-900",
};

const ICON_TONE: Record<NonNullable<Props["tone"]>, string> = {
  default: "bg-slate-100 text-slate-600",
  positive: "bg-emerald-100 text-emerald-700",
  negative: "bg-rose-100 text-rose-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-sky-100 text-sky-700",
};

export const PayrollKpiCard = ({ label, value, hint, icon, tone = "default" }: Props) => (
  <Card className={`bg-gradient-to-br ${TONE[tone]} border border-black/5 shadow-sm`}>
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            {label}
          </p>
          <p className="text-2xl font-semibold leading-tight">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && (
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${ICON_TONE[tone]}`}>
            {icon}
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);
