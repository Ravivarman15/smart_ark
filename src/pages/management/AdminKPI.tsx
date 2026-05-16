import React from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { ShieldCheck, Phone, UserX, Users, Trophy } from "lucide-react";

const AdminKPI: React.FC = () => {
  const { adminChecklist, retestQueue, feeRecords, admissionCalls, walkIns, attendance, students, admins, checkins } = useAppData();
  const today = new Date().toISOString().split("T")[0];

  const checklistCompletion = adminChecklist.length > 0
    ? Math.round((adminChecklist.filter(c => c.done).length / adminChecklist.length) * 100) : 0;

  const totalRetests = retestQueue.length;
  const retestHandled = retestQueue.filter(r => r.status === "completed" || r.status === "allocated").length;
  const retestSla = totalRetests > 0 ? Math.round((retestHandled / totalRetests) * 100) : 100;

  const feesPaid = feeRecords.filter(f => f.paid).length;
  const feeTarget = feeRecords.length > 0 ? Math.round((feesPaid / feeRecords.length) * 100) : 100;

  const todayCalls = admissionCalls.filter(c => c.date === today).length;
  const todayWalkIns = walkIns;

  // Absentee follow-up %
  const studentsAbsent3 = (() => {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split("T")[0];
    });
    const absentCounts: Record<string, number> = {};
    Object.values(attendance).forEach(teacherAtt => {
      last7.forEach(date => {
        const dayRecord = teacherAtt[date];
        if (dayRecord) {
          Object.entries(dayRecord).forEach(([student, status]) => {
            if (status === "absent") absentCounts[student] = (absentCounts[student] || 0) + 1;
          });
        }
      });
    });
    return Object.values(absentCounts).filter(c => c >= 3).length;
  })();

  // Admission KPI
  const admissionKpi = Math.min(100, Math.round((todayCalls / 10) * 50 + (todayWalkIns / 2) * 50));

  const finalScore = Math.round(
    checklistCompletion * 0.30 +
    feeTarget * 0.25 +
    admissionKpi * 0.20 +
    retestSla * 0.10 +
    retestSla * 0.10 +
    (studentsAbsent3 === 0 ? 100 : Math.max(0, 100 - studentsAbsent3 * 20)) * 0.05
  );

  const metrics = [
    { label: "Checklist Completion", value: `${checklistCompletion}%`, weight: "30%", color: checklistCompletion >= 90 ? "text-ark-success" : "text-ark-warning" },
    { label: "Fee Target", value: `${feeTarget}%`, weight: "25%", color: feeTarget >= 90 ? "text-ark-success" : "text-ark-warning" },
    { label: "Admission Activity", value: `${admissionKpi}%`, weight: "20%", color: admissionKpi >= 80 ? "text-ark-success" : "text-ark-warning" },
    { label: "Retest Allocation SLA", value: `${retestSla}%`, weight: "10%", color: retestSla >= 90 ? "text-ark-success" : "text-ark-danger" },
    { label: "Marks Verification SLA", value: `${retestSla}%`, weight: "10%", color: retestSla >= 90 ? "text-ark-success" : "text-ark-danger" },
    { label: "Student Care", value: studentsAbsent3 === 0 ? "100%" : `${Math.max(0, 100 - studentsAbsent3 * 20)}%`, weight: "5%", color: studentsAbsent3 === 0 ? "text-ark-success" : "text-ark-danger" },
  ];

  // Build dynamic admin leaderboard from live data
  const adminLeaderboard = admins.map(admin => {
    // Each admin gets the same global KPI for now (can be individualized later)
    return {
      id: admin.id,
      name: admin.name,
      finalScore,
      checklistCompletion,
      retestSla,
      feeTarget,
    };
  }).sort((a, b) => b.finalScore - a.finalScore);

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Admin Performance Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="metric-card">
          <Phone className="w-4 h-4 text-accent" />
          <p className="text-2xl font-display font-bold text-foreground">{todayCalls}</p>
          <p className="text-xs text-muted-foreground">Calls Today <span className="text-accent">(10 target)</span></p>
        </div>
        <div className="metric-card">
          <Users className="w-4 h-4 text-accent" />
          <p className="text-2xl font-display font-bold text-foreground">{todayWalkIns}</p>
          <p className="text-xs text-muted-foreground">Walk-ins <span className="text-accent">(2 target)</span></p>
        </div>
        <div className="metric-card">
          <UserX className="w-4 h-4 text-ark-danger" />
          <p className="text-2xl font-display font-bold text-foreground">{studentsAbsent3}</p>
          <p className="text-xs text-muted-foreground">Absentee Follow-ups</p>
        </div>
        <div className="metric-card border-accent/30">
          <ShieldCheck className="w-4 h-4 text-accent" />
          <p className={`text-2xl font-display font-bold ${finalScore >= 90 ? "text-ark-success" : finalScore >= 80 ? "text-accent" : "text-ark-danger"}`}>{finalScore}</p>
          <p className="text-xs text-muted-foreground">Final Score</p>
        </div>
      </div>

      {/* KPI Breakdown */}
      <div className="glass-card p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-accent" /> Admin KPI Breakdown
        </h2>
        <div className="space-y-3">
          {metrics.map((m, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/50">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">{m.weight}</span>
                <span className="text-sm text-foreground">{m.label}</span>
              </div>
              <span className={`font-bold text-sm ${m.color}`}>{m.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 p-4 rounded-lg bg-accent/5 border border-accent/20 text-center">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Weighted Final Score</span>
          <p className={`text-3xl font-display font-bold ${finalScore >= 90 ? "text-ark-success" : finalScore >= 80 ? "text-accent" : "text-ark-danger"}`}>{finalScore}</p>
        </div>
      </div>

      {/* Admin Performance Leaderboard */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-accent" /> Center Admin Leaderboard
        </h2>
        {adminLeaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No admin data available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 text-muted-foreground font-medium w-12">Rank</th>
                  <th className="pb-3 text-muted-foreground font-medium">Admin Name</th>
                  <th className="pb-3 text-muted-foreground font-medium">Final Score</th>
                  <th className="pb-3 text-muted-foreground font-medium">Checklist</th>
                  <th className="pb-3 text-muted-foreground font-medium">Retest SLA</th>
                  <th className="pb-3 text-muted-foreground font-medium">Fee Target</th>
                </tr>
              </thead>
              <tbody>
                {adminLeaderboard.map((admin, idx) => (
                  <tr key={admin.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                    <td className="py-3 font-bold text-muted-foreground">#{idx + 1}</td>
                    <td className="py-3 font-medium text-foreground">{admin.name}</td>
                    <td className={`py-3 font-bold ${admin.finalScore >= 90 ? "text-ark-success" : admin.finalScore >= 80 ? "text-accent" : "text-ark-danger"}`}>{admin.finalScore}</td>
                    <td className="py-3 text-muted-foreground">{admin.checklistCompletion}%</td>
                    <td className="py-3 text-muted-foreground">{admin.retestSla}%</td>
                    <td className="py-3 text-muted-foreground">{admin.feeTarget}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminKPI;
