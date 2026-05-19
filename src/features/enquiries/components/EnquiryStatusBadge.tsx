import { Badge } from "@/components/ui/badge";
import { statusLabel } from "../utils/status";
import type { EnquiryStatus } from "../types/enquiry.types";

interface Props {
  status: EnquiryStatus;
}

// Single source of truth for status colours. Change here, change everywhere.
export const EnquiryStatusBadge = ({ status }: Props) => {
  const variant =
    status === "converted"
      ? "default"
      : status === "interested"
      ? "secondary"
      : status === "follow-up"
      ? "outline"
      : "destructive";

  return <Badge variant={variant as never}>{statusLabel(status)}</Badge>;
};
