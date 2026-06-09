import { Badge } from "@/components/ui/badge";
import type { PayrollItemStatus, PayrollRunStatus } from "../types/payroll.types";

const RUN_TONE: Record<PayrollRunStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-sky-100 text-sky-800 border-sky-200",
  on_hold: "bg-orange-100 text-orange-800 border-orange-200",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
};

const ITEM_TONE: Record<PayrollItemStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-sky-100 text-sky-800 border-sky-200",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export const PayrollStatusBadge = ({
  status,
}: {
  status: PayrollRunStatus | PayrollItemStatus;
}) => {
  const tone =
    (RUN_TONE as Record<string, string>)[status] ??
    (ITEM_TONE as Record<string, string>)[status] ??
    RUN_TONE.draft;
  return (
    <Badge variant="outline" className={`capitalize font-medium ${tone}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
};
