import { Badge } from "@/components/ui/badge";
import type { CheckInStatus, CheckOutStatus } from "../types/staff.types";

type Status = CheckInStatus | CheckOutStatus;

interface Props {
  status: Status;
}

// Single source of truth for attendance-status colours. Used by the
// timeline, the daily board, and the historical log.
export const StaffStatusBadge = ({ status }: Props) => {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "on-time"
      ? "default"
      : status === "late" || status === "absent"
      ? "destructive"
      : status === "early"
      ? "secondary"
      : "outline";

  const label =
    status === "on-time"
      ? "On time"
      : status === "late"
      ? "Late"
      : status === "absent"
      ? "Absent"
      : status === "early"
      ? "Early"
      : "Pending";

  return <Badge variant={variant}>{label}</Badge>;
};
