import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AnomalyFlag } from "../types/payroll.types";

// Warning badges shown on each Approval grid row. Critical anomalies (negative
// salary, duplicate employee) are red; soft warnings (>20% swing, missing data)
// are amber. Hovering reveals the detail.

const TONE: Record<AnomalyFlag["severity"], string> = {
  critical: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300",
  warning: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
};

export const AnomalyBadges = ({ flags }: { flags: AnomalyFlag[] }) => {
  if (flags.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f, i) => (
        <Tooltip key={`${f.type}-${i}`}>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`gap-1 text-[10px] font-medium ${TONE[f.severity]}`}
            >
              {f.severity === "critical" ? (
                <ShieldAlert className="w-3 h-3" />
              ) : (
                <AlertTriangle className="w-3 h-3" />
              )}
              {f.label}
            </Badge>
          </TooltipTrigger>
          {f.detail && <TooltipContent>{f.detail}</TooltipContent>}
        </Tooltip>
      ))}
    </div>
  );
};
