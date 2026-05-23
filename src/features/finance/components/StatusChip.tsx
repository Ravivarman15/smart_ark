import { Badge } from "@/components/ui/badge";
import type { TransactionStatus } from "../types/finance.types";

interface Props {
  status: TransactionStatus;
}

const STYLE: Record<TransactionStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-50 text-rose-800 border-rose-200",
  paid: "bg-sky-50 text-sky-800 border-sky-200",
  cancelled: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const LABEL: Record<TransactionStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const StatusChip = ({ status }: Props) => (
  <Badge variant="outline" className={`${STYLE[status]} font-medium`}>
    {LABEL[status]}
  </Badge>
);
