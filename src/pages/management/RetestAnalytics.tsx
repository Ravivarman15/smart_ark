import React from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { RotateCcw, Clock } from "lucide-react";

const RetestAnalytics: React.FC = () => {
  const { retestQueue, teachers } = useAppData();
  const total = retestQueue.length;
  const completedRetests = retestQueue.filter(r => r.status === "completed");
  const completed = completedRetests.length;
  const pending = retestQueue.filter(r => r.status === "pending").length;
  const allocated = retestQueue.filter(r => r.status === "allocated").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const withMarks = completedRetests.filter(r => r.retestMarks !== undefined);
  const avgImprovement = withMarks.length > 0
    ? Math.round(withMarks.reduce((s, r) => s + (r.retestMarks! - r.marks), 0) / withMarks.length)
    : 0;

  // SLA compliance: allocated within 24hrs of creation
  const slaCompliance = total > 0 ? Math.round(((completed + allocated) / total) * 100) : 100;

  // Delayed: pending and past due date
  const today = new Date().toISOString().split("T")[0];
  const delayed = retestQueue.filter(r => r.status === "pending" && r.dueDate < today).length;

  // Teacher-wise retest performance
  const teacherRetestMap: Record<string, { total: number; completed: number; avgImprove: number }> = {};
  retestQueue.forEach(r => {
    const teacherKey = r.teacher || "Unassigned";
    if (!teacherRetestMap[teacherKey]) teacherRetestMap[teacherKey] = { total: 0, completed: 0, avgImprove: 0 };
    teacherRetestMap[teacherKey].total++;
    if (r.status === "completed") {
      teacherRetestMap[teacherKey].completed++;
      if (r.retestMarks !== undefined) {
        teacherRetestMap[teacherKey].avgImprove += (r.retestMarks - r.marks);
      }
    }
  });
  const teacherRetestData = Object.entries(teacherRetestMap).map(([teacher, data]) => ({
    teacher,
    total: data.total,
    completed: data.completed,
    completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    avgImprove: data.completed > 0 ? Math.round(data.avgImprove / data.completed) : 0,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Retest Control Analytics</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="metric-card">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Below 75%</span>
          <p className="text-2xl font-display font-bold text-ark-warning">{total}</p>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Completion</span>
          <p className="text-2xl font-display font-bold text-accent">{completionRate}%</p>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Avg Improve</span>
          <p className="text-2xl font-display font-bold text-ark-success">{avgImprovement >= 0 ? "+" : ""}{avgImprovement}%</p>
        </div>
        <div className="metric-card border-ark-danger/30">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Delayed</span>
          <p className="text-2xl font-display font-bold text-ark-danger">{delayed}</p>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">SLA Compliance</span>
          <p className={`text-2xl font-display font-bold ${slaCompliance >= 90 ? "text-ark-success" : "text-ark-warning"}`}>{slaCompliance}%</p>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Pending</span>
          <p className="text-2xl font-display font-bold text-ark-warning">{pending}</p>
        </div>
      </div>

      {/* Retest Queue */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-accent" /> Retest Queue
        </h2>
        {/* Mobile */}
        <div className="md:hidden space-y-3">
          {retestQueue.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">No retests in queue</div>
          ) : (
            retestQueue.map((r, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/20 border border-border/50 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground text-sm">{r.student}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${r.status === "completed" ? "bg-ark-success/20 text-ark-success" : r.status === "allocated" ? "bg-blue-500/20 text-blue-400" : "bg-ark-warning/20 text-ark-warning"}`}>
                    {r.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{r.subject} · {r.marks}% → {r.retestMarks !== undefined ? `${r.retestMarks}%` : "—"}</p>
                <p className="text-xs text-muted-foreground">Teacher: {r.teacher} · Due: {r.dueDate}</p>
              </div>
            ))
          )}
        </div>
        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 text-muted-foreground font-medium">Student</th>
                <th className="pb-3 text-muted-foreground font-medium">Subject</th>
                <th className="pb-3 text-muted-foreground font-medium">Marks</th>
                <th className="pb-3 text-muted-foreground font-medium">Retest Marks</th>
                <th className="pb-3 text-muted-foreground font-medium">Teacher</th>
                <th className="pb-3 text-muted-foreground font-medium">Due Date</th>
                <th className="pb-3 text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {retestQueue.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No retests in queue</td>
                </tr>
              )}
              {retestQueue.map((r, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-3 text-foreground font-medium">{r.student}</td>
                  <td className="py-3 text-foreground">{r.subject}</td>
                  <td className="py-3 text-ark-danger font-medium">{r.marks}%</td>
                  <td className="py-3 text-foreground">{r.retestMarks !== undefined ? <span className="text-ark-success">{r.retestMarks}%</span> : "—"}</td>
                  <td className="py-3 text-foreground">{r.teacher}</td>
                  <td className="py-3 text-muted-foreground">{r.dueDate}</td>
                  <td className="py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${r.status === "completed" ? "bg-ark-success/20 text-ark-success" : r.status === "allocated" ? "bg-blue-500/20 text-blue-400" : "bg-ark-warning/20 text-ark-warning"}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Teacher-wise Retest Performance */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" /> Teacher-wise Retest Performance
        </h2>
        <div className="space-y-2">
          {teacherRetestData.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">No retest data available</div>
          ) : (
            teacherRetestData.map((t, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/50 gap-2">
                <span className="text-sm font-medium text-foreground">{t.teacher}</span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">Total: <span className="text-foreground font-medium">{t.total}</span></span>
                  <span className="text-muted-foreground">Done: <span className="text-foreground font-medium">{t.completed}</span></span>
                  <span className={`font-medium ${t.completionRate >= 80 ? "text-ark-success" : "text-ark-warning"}`}>{t.completionRate}%</span>
                  <span className="text-ark-success font-medium">+{t.avgImprove}%</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default RetestAnalytics;
