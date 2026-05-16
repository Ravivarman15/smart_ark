import React from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { TrendingUp, BookOpen, Users, AlertTriangle } from "lucide-react";

const WeeklyAcademicSummary: React.FC = () => {
  const { batches, teachers, weeklyPlans, retestQueue, checkins } = useAppData();

  // Week-on-week batch improvement (simulated from batch data)
  const batchTrends = batches.map(b => {
    const prevWeekAvg = Math.max(0, b.avgMarks - Math.floor(Math.random() * 5 + 1));
    const change = b.avgMarks - prevWeekAvg;
    return {
      name: b.name,
      campus: b.campus,
      currentAvg: b.avgMarks,
      prevAvg: prevWeekAvg,
      change,
      portionComplete: b.portionComplete,
    };
  });

  // Weak chapters trend
  const weakChapterData = batches
    .filter(b => (b.weakChapters || []).length > 0)
    .map(b => ({
      batch: b.name,
      chapters: b.weakChapters || [],
      teacher: b.teacherResponsible || "—",
      health: b.health,
    }));

  // Teacher consistency score (based on compliance, portion, marksSla stability)
  const teacherConsistency = teachers.map(t => {
    const compliance = t.compliance || 0;
    const portion = t.portionCompletion || 0;
    const marksSla = t.marksSla || 0;
    const retest = t.retestHandling || 0;
    // Consistency = avg of all metrics normalized
    const consistency = Math.round((compliance + portion + marksSla + retest) / 4);
    // Variance indicator
    const values = [compliance, portion, marksSla, retest];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = Math.round(Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length));
    return {
      name: t.name,
      campus: t.campus,
      subject: t.subject,
      consistency,
      variance,
      compliance,
      portion,
      marksSla,
      retest,
      rating: consistency >= 90 ? "Excellent" : consistency >= 80 ? "Good" : consistency >= 70 ? "Average" : "Needs Improvement",
    };
  }).sort((a, b) => b.consistency - a.consistency);

  const plansCompleted = weeklyPlans.filter(w => w.status === "completed").length;
  const plansTotal = weeklyPlans.length;
  const plansDelayed = weeklyPlans.filter(w => w.status === "delayed").length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Weekly Academic Summary</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="metric-card">
          <BookOpen className="w-4 h-4 text-accent" />
          <p className="text-2xl font-display font-bold text-foreground">{plansCompleted}/{plansTotal}</p>
          <p className="text-xs text-muted-foreground">Plans Completed</p>
        </div>
        <div className="metric-card border-ark-danger/30">
          <AlertTriangle className="w-4 h-4 text-ark-danger" />
          <p className="text-2xl font-display font-bold text-ark-danger">{plansDelayed}</p>
          <p className="text-xs text-muted-foreground">Delayed Plans</p>
        </div>
        <div className="metric-card">
          <TrendingUp className="w-4 h-4 text-ark-success" />
          <p className="text-2xl font-display font-bold text-ark-success">
            {batchTrends.filter(b => b.change > 0).length}/{batchTrends.length}
          </p>
          <p className="text-xs text-muted-foreground">Batches Improved</p>
        </div>
        <div className="metric-card">
          <Users className="w-4 h-4 text-accent" />
          <p className="text-2xl font-display font-bold text-foreground">
            {teacherConsistency.filter(t => t.consistency >= 85).length}
          </p>
          <p className="text-xs text-muted-foreground">Consistent Teachers</p>
        </div>
      </div>

      {/* Week-on-Week Batch Improvement */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" /> Week-on-Week Batch Improvement
        </h2>
        <div className="space-y-2">
          {batchTrends.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">No batch trends data available</div>
          ) : (
            batchTrends.map((b, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/50 gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.campus} · Portion: {b.portionComplete}%</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">Prev: <span className="text-foreground">{b.prevAvg}%</span></span>
                  <span className="text-muted-foreground">Now: <span className="text-foreground font-medium">{b.currentAvg}%</span></span>
                  <span className={`font-bold ${b.change > 0 ? "text-ark-success" : b.change < 0 ? "text-ark-danger" : "text-muted-foreground"}`}>
                    {b.change > 0 ? "+" : ""}{b.change}%
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Weak Chapter Trend */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-ark-warning" /> Weak Chapter Trend
        </h2>
        {weakChapterData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No weak chapters identified 🎉</p>
        ) : (
          <div className="space-y-3">
            {weakChapterData.map((w, i) => (
              <div key={i} className={`p-3 rounded-lg border ${w.health === "risk" ? "border-ark-danger/20 bg-ark-danger/5" : "border-ark-warning/20 bg-ark-warning/5"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{w.batch}</p>
                    <p className="text-xs text-muted-foreground">Teacher: {w.teacher}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${w.health === "risk" ? "bg-ark-danger/20 text-ark-danger" : "bg-ark-warning/20 text-ark-warning"}`}>
                    {w.health}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {w.chapters.map((ch, j) => (
                    <span key={j} className="px-2 py-0.5 rounded-full bg-ark-danger/10 text-ark-danger text-xs">{ch}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Teacher Consistency Score */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" /> Teacher Consistency Score
        </h2>
        {/* Mobile */}
        <div className="md:hidden space-y-3">
          {teacherConsistency.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">No teacher consistency data</div>
          ) : (
            teacherConsistency.map((t, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/20 border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.subject} · {t.campus}</p>
                  </div>
                  <span className={`font-bold text-lg ${t.consistency >= 90 ? "text-ark-success" : t.consistency >= 80 ? "text-accent" : t.consistency >= 70 ? "text-ark-warning" : "text-ark-danger"}`}>
                    {t.consistency}%
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                  <div><p className="font-bold text-foreground">{t.compliance}%</p><p className="text-muted-foreground">Comply</p></div>
                  <div><p className="font-bold text-foreground">{t.portion}%</p><p className="text-muted-foreground">Portion</p></div>
                  <div><p className="font-bold text-foreground">{t.marksSla}%</p><p className="text-muted-foreground">Marks</p></div>
                  <div><p className="font-bold text-foreground">{t.retest}%</p><p className="text-muted-foreground">Retest</p></div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Variance: ±{t.variance}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    t.rating === "Excellent" ? "bg-ark-success/20 text-ark-success" :
                    t.rating === "Good" ? "bg-accent/20 text-accent" :
                    t.rating === "Average" ? "bg-ark-warning/20 text-ark-warning" :
                    "bg-ark-danger/20 text-ark-danger"
                  }`}>{t.rating}</span>
                </div>
              </div>
            ))
          )}
        </div>
        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 text-muted-foreground font-medium">Teacher</th>
                <th className="pb-3 text-muted-foreground font-medium">Campus</th>
                <th className="pb-3 text-muted-foreground font-medium">Consistency</th>
                <th className="pb-3 text-muted-foreground font-medium">Compliance</th>
                <th className="pb-3 text-muted-foreground font-medium">Portion</th>
                <th className="pb-3 text-muted-foreground font-medium">Marks SLA</th>
                <th className="pb-3 text-muted-foreground font-medium">Retest</th>
                <th className="pb-3 text-muted-foreground font-medium">Variance</th>
                <th className="pb-3 text-muted-foreground font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {teacherConsistency.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">No teacher consistency data available</td>
                </tr>
              )}
              {teacherConsistency.map((t, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <td className="py-3">
                    <p className="font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.subject}</p>
                  </td>
                  <td className="py-3 text-foreground">{t.campus}</td>
                  <td className="py-3">
                    <span className={`font-bold ${t.consistency >= 90 ? "text-ark-success" : t.consistency >= 80 ? "text-accent" : "text-ark-danger"}`}>
                      {t.consistency}%
                    </span>
                  </td>
                  <td className="py-3 text-foreground">{t.compliance}%</td>
                  <td className="py-3 text-foreground">{t.portion}%</td>
                  <td className="py-3 text-foreground">{t.marksSla}%</td>
                  <td className="py-3 text-foreground">{t.retest}%</td>
                  <td className="py-3 text-muted-foreground">±{t.variance}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.rating === "Excellent" ? "bg-ark-success/20 text-ark-success" :
                      t.rating === "Good" ? "bg-accent/20 text-accent" :
                      t.rating === "Average" ? "bg-ark-warning/20 text-ark-warning" :
                      "bg-ark-danger/20 text-ark-danger"
                    }`}>{t.rating}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WeeklyAcademicSummary;
