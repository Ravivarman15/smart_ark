import React from "react";
import { TrendingUp, AlertTriangle, Trophy, HelpCircle } from "lucide-react";
import type { TeacherWorkspace } from "./useTeacherWorkspace";
import { scoreTone } from "./scoreTone";

// Class performance, entirely derived from the teacher's recorded marks.
// Nothing here is a placeholder — if there's no data, it says so.

interface Props {
  ws: TeacherWorkspace;
}

const InsightsSection: React.FC<Props> = ({ ws }) => {
  const { classInsights, roster } = ws;
  const { classAverage, atRisk, topPerformers, unassessed, scored } = classInsights;

  return (
    <section id="insights" className="scroll-mt-24">
      <h2 className="section-heading">
        <TrendingUp className="w-4 h-4 text-accent" /> Class Insights
      </h2>

      {roster.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <TrendingUp className="w-6 h-6 text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Insights appear once students are linked to you.
          </p>
        </div>
      ) : scored.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <HelpCircle className="w-6 h-6 text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">No marks recorded yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Record a test above and your class average, at-risk list and top performers
            will build themselves.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Class average bar */}
          <div className="rounded-2xl bg-card/50 border border-border/60 p-4">
            <div className="flex items-end justify-between mb-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Class average
                </p>
                <p className={`text-3xl font-bold ${classAverage === null ? "text-muted-foreground" : scoreTone(classAverage).text}`}>
                  {classAverage === null ? "—" : `${classAverage}%`}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {scored.length} of {roster.length} students assessed
              </p>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  classAverage !== null && classAverage >= 75 ? "bg-ark-success"
                    : classAverage !== null && classAverage >= 40 ? "bg-ark-warning" : "bg-ark-danger"
                }`}
                style={{ width: `${classAverage ?? 0}%` }}
              />
            </div>
          </div>

          {/* At-risk */}
          {atRisk.length > 0 && (
            <div className="rounded-2xl bg-ark-danger/5 border border-ark-danger/20 p-4">
              <p className="text-xs font-semibold text-ark-danger flex items-center gap-1.5 mb-2.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Needs intervention ({atRisk.length})
              </p>
              <div className="space-y-1.5">
                {atRisk.slice(0, 5).map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span className="text-foreground truncate">{s.name}</span>
                    <span className="text-ark-danger font-bold tabular-nums">{s.average}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top performers */}
          {topPerformers.length > 0 && (
            <div className="rounded-2xl bg-card/50 border border-border/60 p-4">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2.5">
                <Trophy className="w-3.5 h-3.5 text-accent" /> Top performers
              </p>
              <div className="space-y-1.5">
                {topPerformers.map((s, i) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span className="text-foreground truncate">
                      <span className="text-muted-foreground mr-1.5">{i + 1}.</span>{s.name}
                    </span>
                    <span className="text-ark-success font-bold tabular-nums">{s.average}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coverage gap */}
          {unassessed.length > 0 && (
            <div className="rounded-2xl bg-ark-warning/5 border border-ark-warning/20 p-4">
              <p className="text-xs font-semibold text-ark-warning flex items-center gap-1.5 mb-1">
                <HelpCircle className="w-3.5 h-3.5" /> {unassessed.length} student
                {unassessed.length > 1 ? "s have" : " has"} no marks on record
              </p>
              <p className="text-xs text-muted-foreground">
                {unassessed.slice(0, 6).join(", ")}
                {unassessed.length > 6 && ` +${unassessed.length - 6} more`}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default InsightsSection;
