import { PhoneCall } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEnquiryAnalytics } from "../hooks/useEnquiryAnalytics";

const STATUS_TONE: Record<string, string> = {
  converted: "text-emerald-600 bg-emerald-500/10",
  interested: "text-sky-600 bg-sky-500/10",
  contacted: "text-amber-600 bg-amber-500/10",
  not_interested: "text-rose-600 bg-rose-500/10",
};

export const InquiryAnalyticsCard = () => {
  const { data, isLoading, error } = useEnquiryAnalytics();

  if (error) return <p className="text-xs text-rose-600">Failed to load enquiries</p>;
  if (isLoading || !data) return <Skeleton className="h-32 w-full" />;

  const buckets: { label: string; value: number }[] = [
    { label: "Today", value: data.todayEnquiries },
    { label: "Week", value: data.weekEnquiries },
    { label: "Month", value: data.monthEnquiries },
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex w-7 h-7 items-center justify-center rounded-md bg-violet-500/10 text-violet-600">
            <PhoneCall className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Enquiry Funnel</h3>
            <p className="text-[11px] text-muted-foreground">Inflow + status breakdown</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-display font-semibold text-foreground">
            {data.conversionPct}%
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Conversion</p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {buckets.map((b) => (
          <div key={b.label} className="rounded-md border border-border/60 bg-muted/30 p-2 text-center">
            <p className="text-lg font-semibold text-foreground">{b.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{b.label}</p>
          </div>
        ))}
      </div>

      <ul className="flex flex-wrap gap-1.5 mt-auto">
        {data.byStatus.length === 0 ? (
          <li className="text-[11px] text-muted-foreground">No enquiries yet</li>
        ) : (
          data.byStatus.map((s) => (
            <li
              key={s.status}
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                STATUS_TONE[s.status] ?? "text-muted-foreground bg-muted/40"
              }`}
            >
              {s.status.replace(/_/g, " ")} · {s.count}
            </li>
          ))
        )}
      </ul>
    </div>
  );
};
