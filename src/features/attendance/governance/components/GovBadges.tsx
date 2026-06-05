import { Badge } from "@/components/ui/badge";
import { APPROVAL_STATUS_META, CLOSING_STATUS_META } from "../utils/governance";
import type { ApprovalStatus, ClosingStatus } from "../types/governance.types";

export const ApprovalStatusBadge = ({ status }: { status: ApprovalStatus }) => {
  const m = APPROVAL_STATUS_META[status];
  return (
    <Badge variant="outline" className={`text-[10px] ${m.tone}`}>
      {m.label}
    </Badge>
  );
};

export const ClosingStatusBadge = ({ status }: { status: ClosingStatus }) => {
  const m = CLOSING_STATUS_META[status];
  return (
    <Badge variant="outline" className={`text-[10px] ${m.tone}`}>
      {m.label}
    </Badge>
  );
};

export const LockBadge = ({ locked }: { locked: boolean }) => (
  <Badge
    variant="outline"
    className={`text-[10px] ${
      locked
        ? "border-rose-500/40 bg-rose-500/10 text-rose-700"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
    }`}
  >
    {locked ? "Locked" : "Unlocked"}
  </Badge>
);
