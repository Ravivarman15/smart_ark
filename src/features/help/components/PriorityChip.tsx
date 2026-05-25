import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABEL, PRIORITY_TONE } from "../utils/helpCalc";
import type { TicketPriority } from "../types/help.types";

const TONE_CLASS: Record<
  "default" | "positive" | "negative" | "warning" | "info",
  string
> = {
  default: "bg-slate-100 text-slate-700 border-slate-200",
  positive: "bg-emerald-100 text-emerald-700 border-emerald-200",
  negative: "bg-rose-100 text-rose-700 border-rose-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  info: "bg-sky-100 text-sky-700 border-sky-200",
};

interface Props {
  priority: TicketPriority;
}

export const PriorityChip = ({ priority }: Props) => (
  <Badge variant="outline" className={TONE_CLASS[PRIORITY_TONE[priority]]}>
    {PRIORITY_LABEL[priority]}
  </Badge>
);
