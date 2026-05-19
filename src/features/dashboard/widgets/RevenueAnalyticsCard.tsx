import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { useRevenueAnalytics } from "../hooks/useRevenueAnalytics";
import { formatINR } from "@/features/fees";

// Recharts is heavy (~110KB gzip in the vendor-charts chunk) — lazy load so
// it only ships when this card actually renders.
const RevenueChart = lazy(() =>
  import("./internal/RevenueChart").then((m) => ({ default: m.RevenueChart }))
);

export const RevenueAnalyticsCard = () => {
  const { data, isLoading, error } = useRevenueAnalytics();

  return (
    <div className="flex flex-col gap-3 h-full">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex w-7 h-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
            <TrendingUp className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Revenue Trend</h3>
            <p className="text-[11px] text-muted-foreground">Income vs expense — last 30 days</p>
          </div>
        </div>
        {data && (
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Net 30d</p>
            <p
              className={`text-sm font-semibold ${
                data.totalIncome - data.totalExpense >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatINR((data.series ?? []).reduce((a, r) => a + r.income - r.expense, 0))}
            </p>
          </div>
        )}
      </header>

      {error ? (
        <p className="text-xs text-rose-600">Failed to load revenue data</p>
      ) : isLoading || !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <RevenueChart data={data.series} />
        </Suspense>
      )}
    </div>
  );
};
