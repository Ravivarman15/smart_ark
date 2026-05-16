import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Trophy, TrendingUp, Filter } from "lucide-react";

const TeacherRanking: React.FC = () => {
  const { teachers, campuses } = useAppData();
  const [campusFilter, setCampusFilter] = useState("All");
  const [subjectFilter, setSubjectFilter] = useState("All");

  const subjects = [...new Set(teachers.map(t => t.subject))];

  const filtered = teachers.filter(t => {
    if (campusFilter !== "All" && t.campus !== campusFilter) return false;
    if (subjectFilter !== "All" && t.subject !== subjectFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => (b.kpiScore || 0) - (a.kpiScore || 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Teacher Performance Ranking</h1>
        <p className="text-xs text-muted-foreground">Monthly KPI (Locked)</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select value={campusFilter} onChange={e => setCampusFilter(e.target.value)}
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground">
          <option value="All">All Campuses</option>
          {campuses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground">
          <option value="All">All Subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="glass-card p-4 md:p-5">
        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {sorted.map((t, i) => (
            <div key={t.id} className="p-3 rounded-lg bg-muted/20 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${i === 0 ? "gradient-accent text-accent-foreground" : i === 1 ? "bg-muted text-foreground" : i === 2 ? "bg-ark-warning/20 text-ark-warning" : "text-muted-foreground bg-muted/30"}`}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-foreground text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.subject} · {t.campus}</p>
                  </div>
                </div>
                <span className={`font-bold text-lg ${(t.kpiScore || 0) >= 90 ? "text-ark-success" : (t.kpiScore || 0) >= 80 ? "text-accent" : "text-ark-danger"}`}>
                  {t.kpiScore}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div><p className="font-bold text-foreground">{t.compliance}%</p><p className="text-muted-foreground">Compliance</p></div>
                <div><p className="font-bold text-foreground">{t.portionCompletion || 0}%</p><p className="text-muted-foreground">Portion</p></div>
                <div><p className={`font-bold ${(t.lateCount || 0) > 5 ? "text-ark-danger" : "text-foreground"}`}>{t.lateCount}</p><p className="text-muted-foreground">Late</p></div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 text-muted-foreground font-medium">Rank</th>
                <th className="pb-3 text-muted-foreground font-medium">Teacher</th>
                <th className="pb-3 text-muted-foreground font-medium">Campus</th>
                <th className="pb-3 text-muted-foreground font-medium">KPI Score</th>
                <th className="pb-3 text-muted-foreground font-medium">Compliance</th>
                <th className="pb-3 text-muted-foreground font-medium">Late</th>
                <th className="pb-3 text-muted-foreground font-medium">Improvement</th>
                <th className="pb-3 text-muted-foreground font-medium">Portion %</th>
                <th className="pb-3 text-muted-foreground font-medium">Retest %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t, i) => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-3">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${i === 0 ? "gradient-accent text-accent-foreground" : i === 1 ? "bg-muted text-foreground" : i === 2 ? "bg-ark-warning/20 text-ark-warning" : "text-muted-foreground"}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-3">
                    <div>
                      <p className="font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.subject}</p>
                    </div>
                  </td>
                  <td className="py-3 text-foreground">{t.campus}</td>
                  <td className="py-3">
                    <span className={`font-bold ${(t.kpiScore || 0) >= 90 ? "text-ark-success" : (t.kpiScore || 0) >= 80 ? "text-accent" : "text-ark-danger"}`}>
                      {t.kpiScore}
                    </span>
                  </td>
                  <td className="py-3 text-foreground">{t.compliance}%</td>
                  <td className="py-3">
                    <span className={(t.lateCount || 0) > 5 ? "text-ark-danger font-medium" : "text-foreground"}>
                      {t.lateCount}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className="text-ark-success flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> {t.studentImprovement}%
                    </span>
                  </td>
                  <td className="py-3 text-foreground">{t.portionCompletion || 0}%</td>
                  <td className="py-3 text-foreground">{t.retestHandling || 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TeacherRanking;
