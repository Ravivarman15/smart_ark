import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClassSchedule, FacultyWorkload } from "../types/allocation.types";

// Management analytics (Phase 7). Charts are built with recharts — the same
// library the payroll / exam analytics already use — over data the allocation
// services already return. No new analytics engine.

const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#6366f1", "#0ea5e9", "#a855f7"];

const h = (mins: number): number => Math.round((mins / 60) * 10) / 10;

interface Props {
  workloads: FacultyWorkload[];
  schedules: ClassSchedule[];
}

export const FacultyAnalyticsCharts: React.FC<Props> = ({ workloads, schedules }) => {
  const workloadData = useMemo(
    () =>
      workloads
        .slice(0, 12)
        .map((w) => ({
          name: (w.teacherName ?? w.teacherId).split(" ")[0],
          Allocated: h(w.allocatedMinutes),
          Completed: h(w.completedMinutes),
        })),
    [workloads],
  );

  const departmentData = useMemo(() => {
    const acc = new Map<string, number>();
    for (const s of schedules) {
      if (s.status === "cancelled") continue;
      const k = s.department ?? "Unassigned";
      acc.set(k, (acc.get(k) ?? 0) + s.durationMinutes);
    }
    return [...acc.entries()].map(([name, mins]) => ({ name, value: h(mins) }));
  }, [schedules]);

  const qualityData = useMemo(() => {
    const cancelled = schedules.filter((s) => s.status === "cancelled").length;
    const missed = schedules.filter((s) => s.status === "missed").length;
    const late = schedules.filter((s) => (s.lateMinutes ?? 0) > 0).length;
    const onTime = schedules.filter(
      (s) => s.startedAt && (s.lateMinutes ?? 0) === 0,
    ).length;
    return [
      { name: "On time", value: onTime },
      { name: "Late starts", value: late },
      { name: "Cancelled", value: cancelled },
      { name: "Missed", value: missed },
    ];
  }, [schedules]);

  const costData = useMemo(
    () =>
      workloads
        .filter((w) => w.salaryEarned > 0)
        .slice(0, 12)
        .map((w) => ({
          name: (w.teacherName ?? w.teacherId).split(" ")[0],
          Cost: Math.round(w.salaryEarned),
          "₹/hour": Math.round(w.hourlyRate),
        })),
    [workloads],
  );

  const activity = useMemo(() => {
    const sorted = [...workloads].sort((a, b) => b.completedMinutes - a.completedMinutes);
    return { most: sorted.slice(0, 5), least: sorted.slice(-5).reverse() };
  }, [workloads]);

  const empty = schedules.length === 0;
  if (empty) {
    return (
      <p className="text-sm text-muted-foreground">
        No allocation data in this period yet — analytics appear once classes are scheduled.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Faculty workload (hours)</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workloadData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Allocated" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Department hours</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={departmentData}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label={(e: { name?: string; value?: number }) => `${e.name} (${e.value}h)`}
              >
                {departmentData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Delivery quality</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={qualityData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {qualityData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Salary cost &amp; cost per hour</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          {costData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Configure hourly or monthly rates in Payroll to see teaching cost.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Cost" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="₹/hour" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Most &amp; least active faculty</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-emerald-600">Most active</p>
            {activity.most.map((w) => (
              <div key={w.teacherId} className="flex justify-between text-sm">
                <span className="truncate">{w.teacherName ?? w.teacherId}</span>
                <span className="font-medium">{h(w.completedMinutes)}h</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-amber-600">Least active</p>
            {activity.least.map((w) => (
              <div key={w.teacherId} className="flex justify-between text-sm">
                <span className="truncate">{w.teacherName ?? w.teacherId}</span>
                <span className="font-medium">{h(w.completedMinutes)}h</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FacultyAnalyticsCharts;
