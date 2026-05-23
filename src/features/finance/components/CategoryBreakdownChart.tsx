import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "../utils/financeCalc";
import { CategoryDot } from "./CategoryDot";
import type { CategoryBreakdownItem } from "../types/finance.types";

interface Props {
  items: CategoryBreakdownItem[];
  title?: string;
  tone?: "income" | "expense";
}

const FALLBACK_COLORS = ["#0ea5e9", "#a855f7", "#22c55e", "#f59e0b", "#ef4444"];

export const CategoryBreakdownChart = ({
  items,
  title = "By category",
  tone = "expense",
}: Props) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          No data yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 8).map((i, idx) => {
            const color = i.color ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
            return (
              <li key={i.categoryId ?? i.categoryName} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 truncate">
                    <CategoryDot color={color} />
                    <span className="truncate">{i.categoryName}</span>
                  </span>
                  <span className="font-medium">{formatINR(i.amount)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      tone === "income" ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                    style={{
                      width: `${Math.max(2, Math.round(i.share * 100))}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
);
