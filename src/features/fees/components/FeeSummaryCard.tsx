import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "../utils/format";
import { FeeStatusBadge } from "./FeeStatusBadge";
import type { FeeRecord } from "../types/fee.types";

interface Props {
  fee: FeeRecord;
  className?: string;
}

// Compact financial summary for a single fee record. Drop this on any
// student-profile or fee-detail screen instead of re-laying-out the same
// six numbers each time.
export const FeeSummaryCard = ({ fee, className }: Props) => {
  const rows: { label: string; value: string; emphasis?: boolean }[] = [
    { label: "Gross total", value: formatINR(fee.amount) },
    { label: "Discount", value: formatINR(fee.discount ?? 0) },
    { label: "Final amount", value: formatINR(fee.finalAmount ?? fee.amount) },
    { label: "Received", value: formatINR(fee.received ?? 0) },
    ...(fee.refund ? [{ label: "Refund", value: formatINR(fee.refund) }] : []),
    { label: "Pending", value: formatINR(fee.pending ?? 0), emphasis: true },
  ];

  return (
    <Card className={className}>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{fee.student}</CardTitle>
          <p className="text-xs text-muted-foreground">{fee.batch}</p>
        </div>
        <FeeStatusBadge status={fee.status} paid={fee.paid} />
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={r.emphasis ? "font-semibold" : ""}>{r.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
