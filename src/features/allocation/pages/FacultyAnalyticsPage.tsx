import React, { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSchedules } from "../hooks/useSchedule";
import { useFacultyInsights, useFacultyWorkload } from "../hooks";
import { FacultyAnalyticsCharts } from "../components/FacultyAnalyticsCharts";
import { FacultyInsightsPanel } from "../components/FacultyInsightsPanel";
import { FacultyWorkloadPanel } from "../components/FacultyWorkloadPanel";
import { AllocationReportsPanel } from "../components/AllocationReportsPanel";

// Faculty Analytics & Reports (Phases 7, 10, 11) — management-facing.
// Every number is derived from the allocation services; exports run through the
// shared report export engine.

const monthRange = (): { from: string; to: string } => {
  const n = new Date();
  return {
    from: new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
};

const FacultyAnalyticsPage: React.FC = () => {
  const initial = useMemo(monthRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const { data: workloads = [], isLoading: loadingWorkload } = useFacultyWorkload(from, to);
  const { data: insights = [], isLoading: loadingInsights } = useFacultyInsights(from, to);
  const { data: schedules = [] } = useSchedules({ from, to, status: "all" });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Faculty Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Workload, productivity, teaching cost and downloadable reports.
            </p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="charts">
        <TabsList>
          <TabsTrigger value="charts">Analytics</TabsTrigger>
          <TabsTrigger value="workload">Workload</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="charts" className="pt-4">
          <FacultyAnalyticsCharts workloads={workloads} schedules={schedules} />
        </TabsContent>

        <TabsContent value="workload" className="pt-4">
          <FacultyWorkloadPanel rows={workloads} isLoading={loadingWorkload} />
        </TabsContent>

        <TabsContent value="insights" className="pt-4">
          <FacultyInsightsPanel insights={insights} isLoading={loadingInsights} />
        </TabsContent>

        <TabsContent value="reports" className="pt-4">
          <AllocationReportsPanel defaultFrom={from} defaultTo={to} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FacultyAnalyticsPage;
