import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE } from "../utils/helpCalc";
import type { TicketStatus } from "../types/help.types";

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
  status: TicketStatus;
}

export const TicketStatusPill = ({ status }: Props) => (
  <Badge variant="outline" className={TONE_CLASS[STATUS_TONE[status]]}>
    {STATUS_LABEL[status]}
  </Badge>
);
