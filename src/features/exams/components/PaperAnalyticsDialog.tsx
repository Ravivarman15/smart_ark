import { BarChart3, Lightbulb } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMcqPaperAnalytics } from "../hooks";
import { MCQ_QUESTION_TYPES } from "../types/mcq.types";

interface Props {
  paperId: string | null;
  onOpenChange: (open: boolean) => void;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "bg-emerald-500",
  medium: "bg-amber-500",
  hard: "bg-rose-500",
};

const typeLabel = (t: string) =>
  MCQ_QUESTION_TYPES.find((x) => x.value === t)?.label ?? t;

const Tile = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "amber" | "violet";
}) => {
  const cls = {
    default: "text-foreground",
    green: "text-emerald-600",
    amber: "text-amber-600",
    violet: "text-violet-600",
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

// ─────────────────────────────────────────────────────────────────────────────
// Paper analytics — chapter & difficulty distribution, type spread, estimated
// complexity and the narrative insights. Every figure is produced by the
// centralised scoring layer via mcqAnalyticsService — nothing computed here.
// ─────────────────────────────────────────────────────────────────────────────
export const PaperAnalyticsDialog = ({ paperId, onOpenChange }: Props) => {
  const { data, isLoading } = useMcqPaperAnalytics(paperId);

  return (
    <Dialog open={!!paperId} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent" />
            Paper Analytics{data ? ` — ${data.paper.title}` : ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Loading analytics…
          </p>
        ) : data.totalQuestions === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            This paper has no questions yet — add some to see analytics.
          </p>
        ) : (
          <div className="space-y-5">
            {/* KPI tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile label="Questions" value={`${data.totalQuestions}`} />
              <Tile label="Total Marks" value={`${data.totalMarks}`} />
              <Tile
                label="Difficulty"
                value={`${data.difficultyScore} · ${data.complexityLabel}`}
                tone="amber"
              />
              <Tile
                label="Est. Avg Score"
                value={`${data.estimatedAvgScorePct}%`}
                tone="green"
              />
            </div>

            {/* Difficulty distribution */}
            <Section title="Difficulty Distribution">
              <div className="space-y-1.5">
                {data.difficultyDistribution.map((d) => (
                  <div key={d.difficulty} className="flex items-center gap-2">
                    <span className="w-16 text-xs capitalize text-muted-foreground">
                      {d.difficulty}
                    </span>
                    <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          DIFFICULTY_COLOR[d.difficulty] ?? "bg-accent"
                        }`}
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                    <span className="w-24 text-xs text-right text-foreground">
                      {d.count} · {d.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Chapter distribution */}
            <Section title="Chapter Distribution">
              <div className="space-y-1.5">
                {data.chapterDistribution.map((c) => {
                  const max = Math.max(
                    1,
                    ...data.chapterDistribution.map((x) => x.marks),
                  );
                  return (
                    <div key={c.chapter} className="flex items-center gap-2">
                      <span className="w-32 text-xs truncate text-muted-foreground">
                        {c.chapter}
                      </span>
                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent/70"
                          style={{ width: `${(c.marks / max) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 text-xs text-right text-foreground">
                        {c.count}q · {c.marks}m
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Type spread */}
            <Section title="Question Types">
              <div className="flex flex-wrap gap-2">
                {data.typeDistribution.map((t) => (
                  <span
                    key={t.type}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/60 bg-muted/40"
                  >
                    {typeLabel(t.type)} · {t.count}
                  </span>
                ))}
              </div>
            </Section>

            {/* Insights */}
            <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 p-4">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" /> Complexity Insights
              </p>
              <ul className="space-y-1">
                {data.insights.map((line, i) => (
                  <li key={i} className="text-sm text-amber-900 flex gap-2">
                    <span className="text-amber-500">•</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg border border-border/60 bg-card/60 p-4">
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
      {title}
    </p>
    {children}
  </div>
);
