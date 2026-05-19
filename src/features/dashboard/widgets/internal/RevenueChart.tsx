import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SeriesPoint {
  date: string;
  income: number;
  expense: number;
}

/**
 * Pure presentation. Lazy-loaded by RevenueAnalyticsCard so recharts isn't
 * pulled into the main bundle.
 */
export const RevenueChart = ({ data }: { data: SeriesPoint[] }) => {
  const compact = data.map((d) => ({
    ...d,
    day: d.date.slice(5), // MM-DD for x-axis label
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={compact} margin={{ left: -16, right: 0, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="dash-income" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(142 76% 36%)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="dash-expense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v: number, name: string) => [`₹${v.toLocaleString("en-IN")}`, name]}
        />
        <Area
          type="monotone"
          dataKey="income"
          stroke="hsl(142 76% 36%)"
          fill="url(#dash-income)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="expense"
          stroke="hsl(0 84% 60%)"
          fill="url(#dash-expense)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
