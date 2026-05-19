import { Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/features/fees";
import { useRevenueAnalytics } from "../hooks/useRevenueAnalytics";

/**
 * Fee receivables breakdown: today / upcoming / overdue / lifetime pending.
 * Bigger-than-tile card so management can plan collection calls.
 */
export const FeeDueCard = () => {
  const { data, isLoading, error } = useRevenueAnalytics();

  if (error) {
    return <p className="text-xs text-rose-600">Failed to load fee data</p>;
  }
  if (isLoading || !data) {
    return <Skeleton className="h-32 w-full" />;
  }

  const rows = [
    { label: "Today's Due", value: data.todayFeeDue, tone: "text-amber-600", bg: "bg-amber-500/5" },
    { label: "Upcoming (7d)", value: data.upcomingFeeDue, tone: "text-sky-600", bg: "bg-sky-500/5" },
    { label: "Overdue", value: data.feeOverdue, tone: "text-rose-600", bg: "bg-rose-500/5" },
    { label: "Total Pending", value: data.totalPendingFee, tone: "text-foreground", bg: "bg-muted/40" },
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      <header className="flex items-center gap-2">
        <span className="flex w-7 h-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
          <Calendar className="w-4 h-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Fee Receivables</h3>
          <p className="text-[11px] text-muted-foreground">Due-date breakdown</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 mt-auto">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`rounded-md border border-border/60 ${r.bg} p-2`}
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.label}</p>
            <p className={`text-base font-semibold ${r.tone} mt-0.5`}>{formatINR(r.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
