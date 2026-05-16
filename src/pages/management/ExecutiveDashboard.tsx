import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { useStrictModeEnforcement } from "@/hooks/useStrictModeEnforcement";
import { Activity, TrendingUp, Users, GraduationCap, ShieldCheck, DollarSign, AlertTriangle, BookOpen, RotateCcw, Clock, ToggleLeft, ToggleRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { Switch } from "@/components/ui/switch";

const campusOptions = ["All Campuses", "Junior Campus", "Senior Campus", "Nestlings"];

const ExecutiveDashboard: React.FC = () => {
  const [campus, setCampus] = useState("All Campuses");
  const [drillDown, setDrillDown] = useState<string | null>(null);
  const { checkins, retestQueue, feeRecords, adminChecklist, teachers, students, campusMetrics, ihiTrend, alerts, batches, weeklyPlans, strictMode, setStrictMode, violations, overrideRequests } = useAppData();

  // Run strict mode enforcement
  useStrictModeEnforcement();

  const today = new Date().toISOString().split("T")[0];

  // Live metrics
  const filteredTeachers = campus === "All Campuses" ? teachers : teachers.filter(t => t.campus === campus);
  const checkedIn = filteredTeachers.filter(t => checkins[t.id]?.[today]).length;
  const teacherCompliance = filteredTeachers.length > 0 ? Math.round((checkedIn / filteredTeachers.length) * 100) : 0;
  const feesPaid = feeRecords.filter(f => f.paid).length;
  const feePercent = feeRecords.length > 0 ? Math.round((feesPaid / feeRecords.length) * 100) : 0;
  const checklistDone = adminChecklist.filter(c => c.done).length;
  const adminChecklistPct = adminChecklist.length > 0 ? Math.round((checklistDone / adminChecklist.length) * 100) : 0;
  const retestPending = retestQueue.filter(r => r.status === "pending").length;
  const retestCompleted = retestQueue.filter(r => r.status === "completed").length;
  const retestCompletionPct = retestQueue.length > 0 ? Math.round((retestCompleted / retestQueue.length) * 100) : 0;
  const studentAvg = students.length > 0 ? Math.round(students.reduce((s, x) => s + x.spi, 0) / students.length) : 0;
  const portionAvg = batches.length > 0 ? Math.round(batches.reduce((s, b) => s + b.portionComplete, 0) / batches.length) : 0;
  const marksSlaAvg = filteredTeachers.length > 0 ? Math.round(filteredTeachers.reduce((s, t) => s + (t.marksSla || 85), 0) / filteredTeachers.length) : 0;

  const ihi = Math.round(teacherCompliance * 0.3 + studentAvg * 0.3 + adminChecklistPct * 0.2 + feePercent * 0.2);
  const ihiStatus = ihi >= 85 ? "Strong" : ihi >= 70 ? "Stable" : "Attention Required";
  const ihiColor = ihi >= 85 ? "text-ark-success" : ihi >= 70 ? "text-accent" : "text-ark-danger";

  const pendingEscalations = violations.filter(v => !v.resolved).length;
  const pendingOverrides = overrideRequests.filter(o => o.status === "pending").length;

  const operationalAlerts = [
    ...(retestPending > 2 ? [{ msg: `${retestPending} retest allocations pending >24 hrs`, type: "danger" }] : []),
    ...(feePercent < 75 ? [{ msg: `Fee collection at ${feePercent}% — below target`, type: "warning" }] : []),
    ...(teacherCompliance < 90 ? [{ msg: `Teacher compliance at ${teacherCompliance}%`, type: "warning" }] : []),
  ];

  const annotatedTrend = ihiTrend.map((d: any) => ({
    ...d,
    annotationLabel: d.annotation || undefined,
  }));

  // Drill-down data
  const getDrillDownContent = (metric: string) => {
    switch (metric) {
      case "teacher-compliance":
        return filteredTeachers.map(t => ({
          label: t.name,
          value: checkins[t.id]?.[today] ? checkins[t.id][today].status : "absent",
          status: checkins[t.id]?.[today]?.status || "absent",
        }));
      case "student-avg":
        return students.sort((a, b) => a.spi - b.spi).slice(0, 10).map(s => ({
          label: `${s.name} (${s.batch})`,
          value: `SPI: ${s.spi}`,
          status: s.risk,
        }));
      case "portion":
        return batches.map(b => ({
          label: b.name,
          value: `${b.portionComplete}%`,
          status: b.portionComplete >= 80 ? "safe" : b.portionComplete >= 60 ? "watch" : "critical",
        }));
      case "marks-sla":
        return filteredTeachers.map(t => ({
          label: t.name,
          value: `${t.marksSla || 85}%`,
          status: (t.marksSla || 85) >= 90 ? "safe" : "watch",
        }));
      case "retest":
        return retestQueue.map(r => ({
          label: `${r.student} — ${r.subject}`,
          value: `${r.marks}% → ${r.status}`,
          status: r.status === "completed" ? "safe" : r.status === "allocated" ? "watch" : "critical",
        }));
      case "fee":
        return feeRecords.filter(f => !f.paid).map(f => ({
          label: `${f.student} (${f.batch})`,
          value: `Due: ${f.dueSince}`,
          status: "critical",
        }));
      default:
        return [];
    }
  };

  const statusColor = (s: string) =>
    s === "safe" || s === "on-time" || s === "completed" ? "text-ark-success" :
    s === "watch" || s === "late" || s === "allocated" ? "text-ark-warning" :
    "text-ark-danger";

  const metricCards = [
    { icon: Users, label: "Teacher Compliance", value: `${teacherCompliance}%`, color: "text-accent", key: "teacher-compliance" },
    { icon: GraduationCap, label: "Student Avg", value: `${studentAvg}`, color: "text-accent", key: "student-avg" },
    { icon: ShieldCheck, label: "Admin Checklist", value: `${adminChecklistPct}%`, color: "text-accent", key: "admin-checklist" },
    { icon: DollarSign, label: "Fee Collection", value: `${feePercent}%`, color: feePercent >= 90 ? "text-ark-success" : "text-ark-warning", key: "fee" },
    { icon: BookOpen, label: "Portion Complete", value: `${portionAvg}%`, color: "text-accent", key: "portion" },
    { icon: Clock, label: "Marks SLA", value: `${marksSlaAvg}%`, color: marksSlaAvg >= 90 ? "text-ark-success" : "text-ark-warning", key: "marks-sla" },
    { icon: RotateCcw, label: "Retest Complete", value: `${retestCompletionPct}%`, color: retestCompletionPct >= 80 ? "text-ark-success" : "text-ark-danger", key: "retest" },
    { icon: AlertTriangle, label: "Retest Pending", value: `${retestPending}`, color: "text-ark-danger", key: "retest" },
    { icon: Activity, label: "Active Alerts", value: `${operationalAlerts.length}`, color: "text-ark-warning", key: "alerts" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">Real-time Overview</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${strictMode ? "bg-ark-danger/10 border-ark-danger/30" : "bg-muted/30 border-border/50"}`}>
            <span className={`text-xs ${strictMode ? "text-ark-danger font-medium" : "text-muted-foreground"}`}>
              {strictMode ? "⚡ Strict Mode ON" : "Strict Mode"}
            </span>
            <Switch checked={strictMode} onCheckedChange={setStrictMode} />
            {strictMode ? <ToggleRight className="w-4 h-4 text-ark-danger" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
          </div>
          {campusOptions.map((c) => (
            <button key={c} onClick={() => setCampus(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${campus === c ? "gradient-accent text-accent-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Strict Mode Warning Banner */}
      {strictMode && (
        <div className="p-3 rounded-lg bg-ark-danger/10 border border-ark-danger/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-ark-danger flex-shrink-0" />
          <div>
            <p className="text-sm text-foreground font-medium">Performance Strict Mode Active</p>
            <p className="text-xs text-muted-foreground">Auto penalties enabled · SLA breaches trigger immediate KPI deductions · All violations logged</p>
          </div>
        </div>
      )}

      {/* IHI + Breakdown + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 glass-card p-6 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Institutional Health Index</span>
          <div className="relative w-28 h-28 md:w-32 md:h-32 mb-3">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(0 84% 60% / 0.15)" strokeWidth="10" />
              <circle cx="60" cy="60" r="50" fill="none"
                stroke="hsl(38 92% 50% / 0.15)" strokeWidth="10"
                strokeDasharray={`${(70/100)*314} 314`} />
              <circle cx="60" cy="60" r="50" fill="none"
                stroke="hsl(142 76% 36% / 0.15)" strokeWidth="10"
                strokeDasharray={`${(85/100)*314} 314`} />
              <circle cx="60" cy="60" r="50" fill="none"
                stroke={ihi >= 85 ? "hsl(142 76% 36%)" : ihi >= 70 ? "hsl(45 100% 51%)" : "hsl(0 84% 60%)"}
                strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(ihi / 100) * 314} 314`} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-3xl font-display font-bold ${ihiColor}`}>{ihi}</span>
            </div>
          </div>
          <span className={`text-sm font-semibold ${ihiColor} mb-3`}>{ihiStatus}</span>
          {/* IHI Breakdown - clickable */}
          <div className="grid grid-cols-2 gap-2 w-full text-left">
            {[
              { label: "Teacher KPI", value: `${teacherCompliance}%`, weight: "30%", drag: teacherCompliance < 70 },
              { label: "Student Avg", value: `${studentAvg}`, weight: "30%", drag: studentAvg < 70 },
              { label: "Admin KPI", value: `${adminChecklistPct}%`, weight: "20%", drag: adminChecklistPct < 70 },
              { label: "Fee", value: `${feePercent}%`, weight: "20%", drag: feePercent < 70 },
            ].map((item, i) => (
              <div key={i} className={`flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${item.drag ? "bg-ark-danger/10 border border-ark-danger/20" : "bg-muted/20"}`}>
                <span className="text-muted-foreground">{item.label} <span className="text-[10px]">({item.weight})</span></span>
                <span className={`font-bold ${item.drag ? "text-ark-danger" : "text-foreground"}`}>{item.value}</span>
                {item.drag && <span className="text-[8px] text-ark-danger ml-1">⬇</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {metricCards.map((m, i) => (
            <div key={i}
              className="metric-card animate-slide-up cursor-pointer hover:border-accent/30 transition-all"
              style={{ animationDelay: `${i * 50}ms` }}
              onClick={() => setDrillDown(drillDown === m.key ? null : m.key)}>
              <m.icon className={`w-4 h-4 ${m.color}`} />
              <p className={`text-xl font-display font-bold ${m.color}`}>{m.value}</p>
              <p className="text-[11px] text-muted-foreground">{m.label}</p>
              <p className="text-[9px] text-accent/60">Click to drill down →</p>
            </div>
          ))}
        </div>
      </div>

      {/* Drill-down panel */}
      {drillDown && drillDown !== "alerts" && drillDown !== "admin-checklist" && (
        <div className="glass-card p-4 md:p-5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-foreground text-sm capitalize">
              {drillDown.replace(/-/g, " ")} — Detail
            </h2>
            <button onClick={() => setDrillDown(null)} className="text-xs text-muted-foreground hover:text-foreground">✕ Close</button>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {getDrillDownContent(drillDown).map((item, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/10 border border-border/30 text-sm">
                <span className="text-foreground">{item.label}</span>
                <span className={`font-medium capitalize ${statusColor(item.status)}`}>{item.value}</span>
              </div>
            ))}
            {getDrillDownContent(drillDown).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data available.</p>
            )}
          </div>
        </div>
      )}

      {/* Escalation Summary */}
      {(pendingEscalations > 0 || pendingOverrides > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="metric-card border-ark-danger/30">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Pending Violations</span>
            <p className="text-2xl font-display font-bold text-ark-danger">{pendingEscalations}</p>
          </div>
          <div className="metric-card border-ark-warning/30">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Override Requests</span>
            <p className="text-2xl font-display font-bold text-ark-warning">{pendingOverrides}</p>
          </div>
        </div>
      )}

      {/* IHI Trend with Annotations */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" /> IHI Trend (12 Weeks)
        </h2>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={annotatedTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(213 30% 25%)" />
            <XAxis dataKey="week" stroke="hsl(213 20% 60%)" fontSize={12} />
            <YAxis domain={[60, 100]} stroke="hsl(213 20% 60%)" fontSize={12} />
            <Tooltip contentStyle={{ background: "hsl(213 60% 16%)", border: "1px solid hsl(213 30% 25%)", borderRadius: "8px", color: "#fff" }}
              formatter={(value: any) => [value, "IHI"]}
              labelFormatter={(label: string) => {
                const point = annotatedTrend.find((d: any) => d.week === label);
                return point?.annotation ? `${label} — ${point.annotation}` : label;
              }}
            />
            <Line type="monotone" dataKey="ihi" stroke="hsl(45 100% 51%)" strokeWidth={3} dot={(props: any) => {
              const { cx, cy, payload } = props;
              if (payload.annotation) {
                return (
                  <g key={payload.week}>
                    <circle cx={cx} cy={cy} r={6} fill="hsl(0 84% 60%)" stroke="hsl(0 0% 100%)" strokeWidth={2} />
                    <text x={cx} y={cy - 12} textAnchor="middle" fill="hsl(0 84% 60%)" fontSize={9} fontWeight="bold">{payload.annotation}</text>
                  </g>
                );
              }
              return <circle key={payload.week} cx={cx} cy={cy} r={4} fill="hsl(45 100% 51%)" />;
            }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Campus Performance */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4">Campus Performance</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={campusMetrics}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(213 30% 25%)" />
            <XAxis dataKey="campus" stroke="hsl(213 20% 60%)" fontSize={12} />
            <YAxis stroke="hsl(213 20% 60%)" fontSize={12} />
            <Tooltip contentStyle={{ background: "hsl(213 60% 16%)", border: "1px solid hsl(213 30% 25%)", borderRadius: "8px", color: "#fff" }} />
            <Legend />
            <Bar dataKey="avgMarks" name="Avg Marks" fill="hsl(45 100% 51%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="attendance" name="Attendance" fill="hsl(142 76% 36%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="portionComplete" name="Portion %" fill="hsl(200 80% 50%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="teacherCompliance" name="Compliance" fill="hsl(330 100% 65%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="retestRate" name="Retest %" fill="hsl(270 60% 55%)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Alerts */}
      {operationalAlerts.length > 0 && (
        <div className="glass-card p-4 md:p-5 border-ark-danger/20">
          <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-ark-danger" /> Operational Alerts
          </h2>
          <div className="space-y-2">
            {operationalAlerts.map((a, i) => (
              <div key={i} className={`p-3 rounded-lg border ${a.type === "danger" ? "border-ark-danger/30 bg-ark-danger/5" : "border-ark-warning/30 bg-ark-warning/5"}`}>
                <p className="text-sm text-foreground">{a.msg}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutiveDashboard;
