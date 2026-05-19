import { Badge } from "@/components/ui/badge";
import type { FeeStatus } from "../types/fee.types";

interface Props {
  status?: FeeStatus;
  /** Derive from paid flag if status is absent (legacy rows). */
  paid?: boolean;
}

// Single source of truth for the fee-status badge styling.
// If we ever change "partial" colour, it changes in one place.
export const FeeStatusBadge = ({ status, paid }: Props) => {
  const resolved: FeeStatus = status ?? (paid ? "paid" : "pending");

  const variant =
    resolved === "paid"
      ? "default"
      : resolved === "partial"
      ? "secondary"
      : "outline";

  const label =
    resolved === "paid" ? "Paid" : resolved === "partial" ? "Partial" : "Pending";

  return (
    <Badge variant={variant as never} className="capitalize">
      {label}
    </Badge>
  );
};
