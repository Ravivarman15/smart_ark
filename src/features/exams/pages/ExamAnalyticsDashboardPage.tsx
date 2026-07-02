import { useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExamLookups, useExamAnalyticsBundle } from "../hooks";
import type { InsightsFilters } from "../services";
import { monthLabel } from "../types/exam.types";
import type { StudentAggregate } from "../utils/analytics";

// ─────────────────────────────────────────────────────────────────────────────
// Advanced Analytics Dashboard (Phase 5). Every figure comes from the reused
// examInsightsService.analytics() engine; charts use the app's recharts stack.
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = ["#0ea5e9", "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
const selectCls = "bg-background border border-border rounded-md px-2.5 py-1.5 text-sm";

const heatColor = (v: number): string => {
  if (v < 0) return "#f1f5f9";
  if (v >= 75) return "#16a34a";
  if (v >= 60) return "#65a30d";
  if (v >= 50) return "#d97706";
  if (v >= 35) return "#ea580c";
  return "#dc2626";
};

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <Card className="border-border/60">
    <CardContent className="p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xl font-display font-semibold text-foreground">{value}</p>
    </CardContent>
  </Card>
);

const StudentTable = ({ title, rows, metric }: { title: string; rows: StudentAggregate[]; metric: (s: StudentAggregate) => string }) => (
  <Card className="border-border/60">
    <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
    <CardContent className="p-0">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border/40">
          {rows.length === 0 ? (
            <tr><td className="px-4 py-3 text-muted-foreground text-xs">No data</td></tr>
          ) : rows.map((r) => (
            <tr key={r.studentId} className="hover:bg-muted/20">
              <td className="px-4 py-1.5">{r.studentName}<span className="text-[11px] text-muted-foreground ml-1">{r.standardName ?? ""}</span></td>
              <td className="px-4 py-1.5 text-right font-medium">{metric(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent>
  </Card>
);

const ExamAnalyticsDashboardPage = () => {
  const { data: lookups } = useExamLookups();
  const [filters, setFilters] = useState<InsightsFilters>({});
  const { data: a, isLoading } = useExamAnalyticsBundle(filters);
  const set = (p: Partial<InsightsFilters>) => setFilters((f) => ({ ...f, ...p }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">Exam Analytics</h1>
          <p className="text-sm text-muted-foreground">School-wide performance, comparisons, heat maps and predictions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={selectCls} value={filters.academicYearId ?? ""} onChange={(e) => set({ academicYearId: e.target.value || undefined })}>
            <option value="">All years</option>
            {(lookups?.academicYears ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <select className={selectCls} value={filters.standardId ?? ""} onChange={(e) => set({ standardId: e.target.value || undefined })}>
            <option value="">All classes</option>
            {(lookups?.standards ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className={selectCls} value={filters.subjectId ?? ""} onChange={(e) => set({ subjectId: e.target.value || undefined })}>
            <option value="">All subjects</option>
            {(lookups?.subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </header>

      {isLoading || !a ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Crunching analytics…</p>
      ) : a.examCount === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No exam results match these filters yet.</p>
      ) : (
        <>
          {/* KPI row */}
          <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Stat label="Exams" value={a.examCount} />
            <Stat label="Students" value={a.studentCount} />
            <Stat label="Average %" value={`${a.school.averagePercentage}%`} />
            <Stat label="Median %" value={`${a.school.medianPercentage}%`} />
            <Stat label="Std Dev" value={a.school.stdDeviation} />
            <Stat label="Pass %" value={`${a.school.passRate}%`} />
            <Stat label="Fail %" value={`${a.school.failRate}%`} />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Monthly trend — Line + Area */}
            <Card className="border-border/60">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Performance Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={a.byMonth.map((m) => ({ name: monthLabel(m.key), avg: m.avgPercentage, pass: m.passRate }))}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />
                    <Tooltip /><Legend />
                    <Area type="monotone" dataKey="avg" name="Avg %" stroke={COLORS[0]} fill="url(#g1)" />
                    <Line type="monotone" dataKey="pass" name="Pass %" stroke={COLORS[3]} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Subject comparison — Bar */}
            <Card className="border-border/60">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Subject Comparison (avg %)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={a.bySubject.map((s) => ({ name: s.label, avg: s.avgPercentage }))}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="avg" name="Avg %" radius={[4, 4, 0, 0]}>
                      {a.bySubject.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Grade distribution — Donut */}
            <Card className="border-border/60">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Grade Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={a.gradeDistribution.filter((g) => g.count > 0)} dataKey="count" nameKey="grade" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {a.gradeDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Rank distribution — Bar */}
            <Card className="border-border/60">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Rank Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={a.rankDistribution.map((r) => ({ name: r.band, count: r.count }))}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="count" name="Students" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Class comparison — Radar */}
            <Card className="border-border/60">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Class Comparison</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={a.byClass.map((c) => ({ name: c.label, avg: c.avgPercentage }))}>
                    <PolarGrid /><PolarAngleAxis dataKey="name" fontSize={11} /><PolarRadiusAxis fontSize={10} />
                    <Radar dataKey="avg" name="Avg %" stroke={COLORS[2]} fill={COLORS[2]} fillOpacity={0.4} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Faculty performance — Bar */}
            <Card className="border-border/60">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Faculty Performance (avg %)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart layout="vertical" data={a.byFaculty.map((f) => ({ name: f.label, avg: f.avgPercentage }))}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" fontSize={11} width={110} />
                    <Tooltip />
                    <Bar dataKey="avg" name="Avg %" fill={COLORS[4]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Heat map: section × subject */}
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Heat Map — Section × Subject (avg %)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {a.heatMap.rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data.</p>
              ) : (
                <table className="text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2 text-left" />
                      {a.heatMap.cols.map((c) => <th key={c} className="p-2 font-medium text-muted-foreground">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {a.heatMap.rows.map((rlabel, ri) => (
                      <tr key={rlabel}>
                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap">{rlabel}</td>
                        {a.heatMap.cells[ri].map((v, ci) => (
                          <td key={ci} className="p-0">
                            <div className="w-14 h-9 flex items-center justify-center text-white font-medium rounded m-0.5" style={{ background: heatColor(v) }}>
                              {v < 0 ? "" : `${Math.round(v)}`}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Student intelligence tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <StudentTable title="Top 10 Students" rows={a.topStudents} metric={(s) => `${s.averagePercentage}%`} />
            <StudentTable title="Bottom 10 Students" rows={a.bottomStudents} metric={(s) => `${s.averagePercentage}%`} />
            <StudentTable title="Most Improved" rows={a.mostImproved} metric={(s) => `+${s.trendDelta}%`} />
            <StudentTable title="Performance Drops" rows={a.performanceDrops} metric={(s) => `${s.trendDelta}%`} />
            <StudentTable title="Risk Students" rows={a.riskStudents.slice(0, 10)} metric={(s) => `${s.averagePercentage}% · ${s.fails} fail`} />
            <StudentTable title="Scholarship Candidates" rows={a.scholarshipCandidates.slice(0, 10)} metric={(s) => `${s.averagePercentage}%`} />
          </div>
        </>
      )}
    </div>
  );
};

export default ExamAnalyticsDashboardPage;
