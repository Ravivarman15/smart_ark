import { BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/features/fees";
import { useRevenueAnalytics } from "../hooks/useRevenueAnalytics";

/**
 * Big P/L tile. Income vs expense vs net, plus a margin% so managers can
 * eyeball how efficiently the business converts revenue.
 */
export const ProfitLossCard = () => {
  const { data, isLoading, error } = useRevenueAnalytics();

  if (error) {
    return <p className="text-xs text-rose-600">Failed to load P/L</p>;
  }
  if (isLoading || !data) {
    return <Skeleton className="h-32 w-full" />;
  }

  const profit = data.totalIncome - data.totalExpense;
  const margin =
    data.totalIncome > 0 ? Math.round((profit / data.totalIncome) * 100) : 0;
  const positive = profit >= 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      <header className="flex items-center gap-2">
        <span
          className={`flex w-7 h-7 items-center justify-center rounded-md ${
            positive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Profit / Loss</h3>
          <p className="text-[11px] text-muted-foreground">Lifetime — income − expense</p>
        </div>
      </header>

      <div className="flex items-baseline gap-3">
        <p
          className={`text-3xl font-display font-semibold ${
            positive ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {formatINR(profit)}
        </p>
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            positive
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-rose-500/10 text-rose-600"
          }`}
        >
          {margin}% margin
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 mt-auto">
        <div className="rounded-md border border-border/60 bg-emerald-500/5 p-2">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Income</dt>
          <dd className="text-sm font-semibold text-emerald-600">
            {formatINR(data.totalIncome)}
          </dd>
        </div>
        <div className="rounded-md border border-border/60 bg-rose-500/5 p-2">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Expense</dt>
          <dd className="text-sm font-semibold text-rose-600">
            {formatINR(data.totalExpense)}
          </dd>
        </div>
      </dl>
    </div>
  );
};
