import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "../utils/financeCalc";
import type { MonthlyTrendPoint } from "../types/finance.types";

interface Props {
  points: MonthlyTrendPoint[];
  title?: string;
}

// Pure CSS bar/area chart. No extra deps. Stacks income (green) and expense
// (rose) side-by-side per month.
export const TrendChart = ({ points, title = "Cashflow trend" }: Props) => {
  const max = Math.max(
    1,
    ...points.flatMap((p) => [p.income, p.expense]),
  );
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            Not enough data yet.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end gap-2 h-40">
              {points.map((p) => {
                const incomeH = Math.round((p.income / max) * 100);
                const expenseH = Math.round((p.expense / max) * 100);
                return (
                  <div
                    key={p.month}
                    className="flex-1 flex flex-col items-center gap-1 min-w-0"
                  >
                    <div className="flex items-end gap-0.5 h-32 w-full justify-center">
                      <div
                        className="w-3 rounded-t bg-emerald-500"
                        style={{ height: `${Math.max(2, incomeH)}%` }}
                        title={`Income ${formatINR(p.income)}`}
                      />
                      <div
                        className="w-3 rounded-t bg-rose-500"
                        style={{ height: `${Math.max(2, expenseH)}%` }}
                        title={`Expense ${formatINR(p.expense)}`}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate w-full text-center">
                      {p.month}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded bg-emerald-500" /> Income
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded bg-rose-500" /> Expense
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
