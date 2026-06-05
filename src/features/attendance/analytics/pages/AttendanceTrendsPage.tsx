import { useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { AttendancePageShell } from "../../components";
import { AnalyticsFilters, MiniBarChart, MiniLineChart } from "../components";
import { useStudentAnalytics } from "../hooks/useAnalytics";
import { daysAgo, today } from "../../utils/dates";
import type { StudentAnalyticsFilters } from "../types/analytics.types";

const AttendanceTrendsPage = () => {
  const [filters, setFilters] = useState<StudentAnalyticsFilters>({ from: daysAgo(89), to: today() });
  const { data, isLoading } = useStudentAnalytics(filters);

  return (
    <AttendancePageShell
      title="Attendance Trends"
      description="Daily, monthly and comparative attendance trends across batches and standards."
      icon={<TrendingUp className="w-5 h-5" />}
      toolbar={<AnalyticsFilters value={filters} onChange={setFilters} />}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          <div className="glass-card p-4">
            <h3 className="text-sm font-display font-semibold mb-3">Daily trend</h3>
            <MiniLineChart data={data?.dailyTrend ?? []} suffix="%" height={200} />
          </div>
          <div className="glass-card p-4">
            <h3 className="text-sm font-display font-semibold mb-3">Monthly trend</h3>
            <MiniBarChart data={data?.monthlyTrend ?? []} suffix="%" color="#22c55e" height={200} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-3">Batch vs Batch</h3>
              <MiniBarChart data={(data?.batchComparison ?? []).map((g) => ({ label: g.name, value: g.attendancePct }))} suffix="%" />
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-3">Standard vs Standard</h3>
              <MiniBarChart data={(data?.standardComparison ?? []).map((g) => ({ label: g.name, value: g.attendancePct }))} suffix="%" color="#a855f7" />
            </div>
          </div>
        </div>
      )}
    </AttendancePageShell>
  );
};

export default AttendanceTrendsPage;
