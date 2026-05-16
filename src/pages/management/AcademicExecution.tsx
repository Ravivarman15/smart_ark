import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { BookOpen, Clock, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";

const AcademicExecution: React.FC = () => {
  const { batches, weeklyPlans, retestQueue, teachers, checkins, attendance } = useAppData();
  const today = new Date().toISOString().split("T")[0];
  const [drillDown, setDrillDown] = useState<string | null>(null);

  const portionAvg = batches.length > 0 ? Math.round(batches.reduce((s, b) => s + b.portionComplete, 0) / batches.length) : 0;
  const marksSlaAvg = teachers.length > 0 ? Math.round(teachers.reduce((s, t) => s + (t.marksSla || 85), 0) / teachers.length) : 0;

  const testsPlanned = weeklyPlans.length;
  const testsConducted = weeklyPlans.filter(w => w.status === "completed").length;

  const retestTotal = retestQueue.length;
  const retestHandled = retestQueue.filter(r => r.status === "completed" || r.status === "allocated").length;
  const retestSla = retestTotal > 0 ? Math.round((retestHandled / retestTotal) * 100) : 100;

  const teachersWithAttendance = Object.keys(attendance).filter(tid => attendance[tid]?.[today]).length;
  const attendanceCompliance = teachers.length > 0 ? Math.round((teachersWithAttendance / teachers.length) * 100) : 0;

  // SLA countdown timers
  const pendingRetests = retestQueue.filter(r => r.status === "pending");
  const overdueRetests = pendingRetests.filter(r => r.dueDate < today);

  const getTimeSince = (dateStr: string) => {
    if (!dateStr) return 0;
    const ts = new Date(dateStr).getTime();
    if (isNaN(ts)) return 0;
    const hours = Math.floor((new Date().getTime() - ts) / (1000 * 60 * 60));
    return Math.max(0, hours);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Academic Execution Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="metric-card cursor-pointer hover:border-accent/30 transition-all" onClick={() => setDrillDown(drillDown === "portion" ? null : "portion")}>
          <BookOpen className="w-4 h-4 text-accent" />
          <p className={`text-2xl font-display font-bold ${portionAvg >= 80 ? "text-ark-success" : "text-ark-warning"}`}>{portionAvg}%</p>
          <p className="text-xs text-muted-foreground">Portion Completion</p>
          <p className="text-[9px] text-accent/60">Click to drill down →</p>
        </div>
        <div className="metric-card cursor-pointer hover:border-accent/30 transition-all" onClick={() => setDrillDown(drillDown === "marks" ? null : "marks")}>
          <Clock className="w-4 h-4 text-accent" />
          <p className={`text-2xl font-display font-bold ${marksSlaAvg >= 90 ? "text-ark-success" : "text-ark-warning"}`}>{marksSlaAvg}%</p>
          <p className="text-xs text-muted-foreground">Marks SLA</p>
          <p className="text-[9px] text-accent/60">Click to drill down →</p>
        </div>
        <div className="metric-card cursor-pointer hover:border-accent/30 transition-all" onClick={() => setDrillDown(drillDown === "tests" ? null : "tests")}>
          <CheckCircle2 className="w-4 h-4 text-accent" />
          <p className="text-2xl font-display font-bold text-foreground">{testsConducted}/{testsPlanned}</p>
          <p className="text-xs text-muted-foreground">Tests Done/Planned</p>
          <p className="text-[9px] text-accent/60">Click to drill down →</p>
        </div>
        <div className="metric-card cursor-pointer hover:border-accent/30 transition-all" onClick={() => setDrillDown(drillDown === "retest" ? null : "retest")}>
          <RotateCcw className="w-4 h-4 text-accent" />
          <p className={`text-2xl font-display font-bold ${retestSla >= 90 ? "text-ark-success" : "text-ark-warning"}`}>{retestSla}%</p>
          <p className="text-xs text-muted-foreground">Retest SLA</p>
          <p className="text-[9px] text-accent/60">Click to drill down →</p>
        </div>
        <div className="metric-card cursor-pointer hover:border-accent/30 transition-all" onClick={() => setDrillDown(drillDown === "attendance" ? null : "attendance")}>
          <AlertTriangle className="w-4 h-4 text-accent" />
          <p className={`text-2xl font-display font-bold ${attendanceCompliance >= 90 ? "text-ark-success" : "text-ark-danger"}`}>{attendanceCompliance}%</p>
          <p className="text-xs text-muted-foreground">Attendance Marking</p>
          <p className="text-[9px] text-accent/60">Click to drill down →</p>
        </div>
      </div>

      {/* Drill-down panel */}
      {drillDown && (
        <div className="glass-card p-4 md:p-5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-foreground text-sm capitalize">{drillDown} — Detail</h2>
            <button onClick={() => setDrillDown(null)} className="text-xs text-muted-foreground hover:text-foreground">✕ Close</button>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {drillDown === "portion" && (batches.length === 0 ? <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">No batch data</div> : batches.map((b, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/10 border border-border/30 text-sm">
                <span className="text-foreground">{b.name} ({b.campus})</span>
                <span className={`font-medium ${b.portionComplete >= 80 ? "text-ark-success" : "text-ark-warning"}`}>{b.portionComplete}%</span>
              </div>
            )))}
            {drillDown === "marks" && (teachers.length === 0 ? <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">No teacher data</div> : teachers.map((t, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/10 border border-border/30 text-sm">
                <span className="text-foreground">{t.name} ({t.subject})</span>
                <span className={`font-medium ${(t.marksSla || 85) >= 90 ? "text-ark-success" : "text-ark-warning"}`}>{t.marksSla || 85}%</span>
              </div>
            )))}
            {drillDown === "tests" && (weeklyPlans.length === 0 ? <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">No tests planned</div> : weeklyPlans.map((w, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${w.status === "completed" ? "bg-ark-success/5 border-ark-success/20" : w.status === "delayed" ? "bg-ark-danger/5 border-ark-danger/20" : "bg-muted/10 border-border/30"}`}>
                <span className="text-foreground">{w.batch} — {w.portionPlanned}</span>
                <span className={`font-medium capitalize ${w.status === "completed" ? "text-ark-success" : w.status === "delayed" ? "text-ark-danger" : "text-accent"}`}>{w.status}</span>
              </div>
            )))}
            {drillDown === "retest" && (retestQueue.length === 0 ? <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">No retests in queue</div> : retestQueue.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/10 border border-border/30 text-sm">
                <span className="text-foreground">{r.student} — {r.subject} ({r.marks}%)</span>
                <span className={`font-medium capitalize ${r.status === "completed" ? "text-ark-success" : r.status === "allocated" ? "text-accent" : "text-ark-warning"}`}>{r.status}</span>
              </div>
            )))}
            {drillDown === "attendance" && (teachers.length === 0 ? <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">No teacher data</div> : teachers.map((t, i) => {
              const hasMarked = !!attendance[t.id]?.[today];
              return (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/10 border border-border/30 text-sm">
                  <span className="text-foreground">{t.name}</span>
                  <span className={`font-medium ${hasMarked ? "text-ark-success" : "text-ark-danger"}`}>{hasMarked ? "✓ Marked" : "✗ Not Marked"}</span>
                </div>
              );
            }))}
          </div>
        </div>
      )}

      {/* SLA Countdown Timers */}
      {overdueRetests.length > 0 && (
        <div className="glass-card p-4 md:p-5 border-ark-danger/20">
          <h2 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-ark-danger" /> SLA Countdown — Overdue Items
          </h2>
          <div className="space-y-2">
            {overdueRetests.map((r, i) => {
              const hrs = getTimeSince(r.dueDate);
              return (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-ark-danger/5 border border-ark-danger/20">
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.student} — {r.subject}</p>
                    <p className="text-xs text-muted-foreground">Due: {r.dueDate} · Teacher: {r.teacher}</p>
                  </div>
                  <span className="text-sm font-bold text-ark-danger">{hrs}h overdue</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly Plans */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4">Weekly Plan Status</h2>
        <div className="space-y-2">
          {weeklyPlans.map(wp => (
            <div key={wp.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-2 ${wp.status === "completed" ? "border-ark-success/20 bg-ark-success/5" : wp.status === "delayed" ? "border-ark-danger/20 bg-ark-danger/5" : "border-border/50 bg-muted/10"}`}>
              <div>
                <p className="text-sm font-medium text-foreground">{wp.batch} — {wp.portionPlanned}</p>
                <p className="text-xs text-muted-foreground">{wp.teacher} · Test: {wp.testDate}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${wp.status === "completed" ? "bg-ark-success/20 text-ark-success" : wp.status === "delayed" ? "bg-ark-danger/20 text-ark-danger" : "bg-accent/20 text-accent"}`}>
                {wp.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Batch Portion Breakdown */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4">Batch-wise Portion Completion</h2>
        <div className="space-y-3">
          {batches.map(b => (
            <div key={b.id} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-foreground font-medium">{b.name}</span>
                <span className={b.portionComplete >= 80 ? "text-ark-success" : "text-ark-warning"}>{b.portionComplete}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className={`rounded-full h-2 transition-all ${b.portionComplete >= 80 ? "bg-ark-success" : b.portionComplete >= 60 ? "bg-accent" : "bg-ark-danger"}`} style={{ width: `${b.portionComplete}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AcademicExecution;
