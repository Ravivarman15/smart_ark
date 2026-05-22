import { Award, Printer, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useExamAnalytics } from "../hooks";
import { GradeBadge } from "./GradeBadge";
import type { ExamAnalytics } from "../types/exam.types";

interface Props {
  examId: string | null;
  onOpenChange: (open: boolean) => void;
}

const Tile = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red" | "amber";
}) => {
  const cls = {
    default: "text-foreground",
    green: "text-emerald-600",
    red: "text-rose-600",
    amber: "text-amber-600",
  }[tone];
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`text-xl font-display font-semibold mt-0.5 ${cls}`}>
        {value}
      </p>
    </div>
  );
};

// Build a standalone printable mark sheet — independent of app styling.
const printMarkSheet = (a: ExamAnalytics): void => {
  const win = window.open("", "_blank", "width=820,height=720");
  if (!win) return;
  const rows = a.scored
    .slice()
    .sort((x, y) => (x.rank ?? 9999) - (y.rank ?? 9999))
    .map(
      (r) => `<tr>
        <td>${r.rank ?? "—"}</td>
        <td style="text-align:left">${r.studentName ?? "—"}</td>
        <td>${r.isAbsent ? "AB" : r.marks ?? "—"}</td>
        <td>${r.isAbsent ? "—" : r.percentage + "%"}</td>
        <td>${r.grade ?? "—"}</td>
        <td>${r.isAbsent ? "Absent" : r.passed ? "Pass" : "Fail"}</td>
      </tr>`,
    )
    .join("");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
    <title>Mark Sheet — ${a.exam.title}</title>
    <style>
      body{font-family:'Segoe UI',Arial,sans-serif;padding:24px;color:#0f172a}
      h1{font-size:18px;margin:0}
      p{color:#64748b;font-size:12px;margin:2px 0 14px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:center}
      th{background:#f8fafc}
    </style></head><body>
    <h1>${a.exam.title}</h1>
    <p>${a.exam.subjectName ?? ""} ${a.exam.batchName ? "· " + a.exam.batchName : ""}
       · Total ${a.exam.totalMarks} · Pass ${a.exam.passMarks}
       · Average ${a.stats.averagePercentage}% · Pass rate ${a.stats.passRate}%</p>
    <table><thead><tr>
      <th>Rank</th><th style="text-align:left">Student</th><th>Marks</th>
      <th>%</th><th>Grade</th><th>Result</th>
    </tr></thead><tbody>${rows}</tbody></table>
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-exam analytics dashboard — KPI tiles, grade distribution, toppers and the
// full ranked result table. All figures come from examAnalyticsService (the
// grading layer), never recomputed here. Includes a printable mark sheet.
// ─────────────────────────────────────────────────────────────────────────────
export const ExamAnalyticsDialog = ({ examId, onOpenChange }: Props) => {
  const { data, isLoading } = useExamAnalytics(examId);

  return (
    <Dialog open={!!examId} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            Exam Analytics{data ? ` — ${data.exam.title}` : ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Loading analytics…
          </p>
        ) : data.stats.appeared === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No marks recorded yet. Enter marks to see analytics.
          </p>
        ) : (
          <div className="space-y-5">
            {/* KPI tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile label="Appeared" value={`${data.stats.appeared}`} />
              <Tile
                label="Pass Rate"
                value={`${data.stats.passRate}%`}
                tone={data.stats.passRate >= 50 ? "green" : "red"}
              />
              <Tile
                label="Average"
                value={`${data.stats.averagePercentage}%`}
                tone="amber"
              />
              <Tile
                label="Highest"
                value={`${data.stats.highestMarks}`}
                tone="green"
              />
            </div>

            {/* Grade distribution */}
            <div className="rounded-lg border border-border/60 bg-card/60 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Grade Distribution
              </p>
              <div className="space-y-1.5">
                {data.gradeDistribution.map((g) => {
                  const max = Math.max(
                    1,
                    ...data.gradeDistribution.map((x) => x.count),
                  );
                  return (
                    <div key={g.grade} className="flex items-center gap-2">
                      <span className="w-8 text-xs font-medium text-muted-foreground">
                        {g.grade}
                      </span>
                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-accent/70 rounded-full"
                          style={{ width: `${(g.count / max) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 text-xs text-right text-foreground">
                        {g.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Toppers */}
            {data.toppers.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-card/60 p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" /> Toppers
                </p>
                <div className="space-y-1">
                  {data.toppers.map((t) => (
                    <div
                      key={t.rank}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>
                        <span className="text-muted-foreground mr-2">
                          #{t.rank}
                        </span>
                        {t.studentName}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{t.marks}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.percentage}%
                        </span>
                        <GradeBadge grade={t.grade} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full ranked table */}
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Rank</th>
                    <th className="px-3 py-2 font-medium">Student</th>
                    <th className="px-3 py-2 font-medium">Marks</th>
                    <th className="px-3 py-2 font-medium">%</th>
                    <th className="px-3 py-2 font-medium">Grade</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {data.scored
                    .slice()
                    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
                    .map((r) => (
                      <tr key={r.studentId} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {r.rank ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 font-medium text-foreground">
                          {r.studentName ?? "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {r.isAbsent ? "—" : r.marks}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {r.isAbsent ? "—" : `${r.percentage}%`}
                        </td>
                        <td className="px-3 py-1.5">
                          <GradeBadge grade={r.grade} />
                        </td>
                        <td className="px-3 py-1.5">
                          {r.isAbsent ? (
                            <span className="text-rose-500 text-xs">Absent</span>
                          ) : r.passed ? (
                            <span className="text-emerald-600 text-xs">
                              Pass
                            </span>
                          ) : (
                            <span className="text-rose-600 text-xs">Fail</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => printMarkSheet(data)}
            >
              <Printer className="w-4 h-4 mr-2" /> Print Mark Sheet
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
