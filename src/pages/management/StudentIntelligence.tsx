import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { X } from "lucide-react";

const StudentIntelligence: React.FC = () => {
  const { students, batches } = useAppData();
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);

  const safeCount = students.filter(s => s.risk === "safe").length;
  const watchCount = students.filter(s => s.risk === "watch").length;
  const criticalCount = students.filter(s => s.risk === "critical").length;

  const riskData = [
    { name: "Safe", value: safeCount, color: "hsl(142 76% 36%)" },
    { name: "Watch", value: watchCount, color: "hsl(45 100% 51%)" },
    { name: "Critical", value: criticalCount, color: "hsl(0 84% 60%)" },
  ];

  const selectedBatchInfo = batches.find(b => b.id === selectedBatch);

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Student Performance Intelligence</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Distribution with absolute numbers */}
        <div className="glass-card p-5">
          <h2 className="font-display font-semibold text-foreground mb-4">Risk Distribution</h2>
          {students.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
              No students yet — add students to see the risk distribution.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={riskData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value"
                  label={({ name, value, percent }) => `${name} – ${value} (${((percent ?? 0) * 100).toFixed(0)}%)`}>
                  {riskData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(213 60% 16%)", border: "1px solid hsl(213 30% 25%)", borderRadius: "8px", color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          {/* Summary cards with absolute numbers */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center p-2 rounded-lg bg-ark-success/10 border border-ark-success/20">
              <p className="text-lg font-bold text-ark-success">{safeCount}</p>
              <p className="text-xs text-muted-foreground">Safe</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-ark-warning/10 border border-ark-warning/20">
              <p className="text-lg font-bold text-ark-warning">{watchCount}</p>
              <p className="text-xs text-muted-foreground">Watch</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-ark-danger/10 border border-ark-danger/20">
              <p className="text-lg font-bold text-ark-danger">{criticalCount}</p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </div>
          </div>
        </div>

        {/* Batch Risk Heatmap - Clickable */}
        <div className="glass-card p-5">
          <h2 className="font-display font-semibold text-foreground mb-4">Batch Risk Heatmap</h2>
          <p className="text-xs text-muted-foreground mb-3">Click a batch to see weak chapters & teacher responsible</p>
          <div className="grid grid-cols-2 gap-3">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBatch(selectedBatch === b.id ? null : b.id)}
                className={`p-4 rounded-lg border text-center transition-all cursor-pointer ${
                  selectedBatch === b.id ? "ring-2 ring-accent" : ""
                } ${b.health === "strong" ? "border-ark-success/30 bg-ark-success/10 hover:bg-ark-success/15" :
                    b.health === "moderate" ? "border-ark-warning/30 bg-ark-warning/10 hover:bg-ark-warning/15" :
                      "border-ark-danger/30 bg-ark-danger/10 hover:bg-ark-danger/15"
                  }`}
              >
                <p className="font-medium text-foreground text-sm">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.campus}</p>
                <p className={`text-lg font-bold mt-1 ${b.health === "strong" ? "text-ark-success" :
                    b.health === "moderate" ? "text-ark-warning" : "text-ark-danger"
                  }`}>
                  {b.avgMarks}%
                </p>
                <p className={`text-xs font-medium capitalize ${b.health === "strong" ? "text-ark-success" :
                    b.health === "moderate" ? "text-ark-warning" : "text-ark-danger"
                  }`}>
                  {b.health}
                </p>
              </button>
            ))}
          </div>

          {/* Drill-down panel */}
          {selectedBatchInfo && (
            <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border/50 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-foreground text-sm">{selectedBatchInfo.name} Details</h3>
                <button onClick={() => setSelectedBatch(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Teacher Responsible</span>
                  <span className="text-foreground font-medium">{selectedBatchInfo.teacherResponsible || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retest Rate</span>
                  <span className="text-foreground font-medium">{selectedBatchInfo.retestRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Portion Complete</span>
                  <span className="text-foreground font-medium">{selectedBatchInfo.portionComplete}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Weak Chapters:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(selectedBatchInfo.weakChapters || []).length > 0 ? selectedBatchInfo.weakChapters!.map((ch, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-ark-danger/10 text-ark-danger text-xs">{ch}</span>
                    )) : <span className="text-xs text-muted-foreground">No weak chapters identified</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentIntelligence;
