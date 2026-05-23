import { useMemo, useState } from "react";
import {
  BarChart3,
  Clock,
  Loader2,
  Target,
  TrendingDown,
  Trophy,
  Users,
} from "lucide-react";
import { useMcqExamAnalytics } from "../hooks";
import type {
  QuestionDifficultyRow,
  SectionPerformance,
} from "../types/mcqExam.types";

interface Props {
  examId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// McqExamAnalyticsView — exam-wide insight dashboard.
//
// All numbers come from `useMcqExamAnalytics`, which composes already-scored
// attempt rows; this layer is pure presentation (CSS bar charts, sortable
// tables). No scoring or aggregation runs in the UI.
// ─────────────────────────────────────────────────────────────────────────────
export const McqExamAnalyticsView = ({ examId }: Props) => {
  const { data, isLoading, error } = useMcqExamAnalytics(examId);
  const [questionSort, setQuestionSort] = useState<"easiest" | "hardest">(
    "hardest",
  );

  const sortedQuestions = useMemo(() => {
    if (!data) return [];
    const list = [...data.questionDifficulty];
    return questionSort === "hardest"
      ? list.sort((a, b) => a.correctRate - b.correctRate)
      : list.sort((a, b) => b.correctRate - a.correctRate);
  }, [data, questionSort]);

  if (error) {
    return (
      <div className="rounded-lg border border-rose-300/60 bg-rose-50/40 text-rose-700 p-4">
        Failed to load analytics.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        Loading analytics…
      </div>
    );
  }

  if (!data || data.submittedCount === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/50 p-8 text-center">
        <BarChart3 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Analytics will appear once at least one student has submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Headline tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          icon={<Users className="w-4 h-4" />}
          label="Attempts"
          value={`${data.submittedCount} / ${data.attemptCount}`}
          tone="blue"
        />
        <Tile
          icon={<Target className="w-4 h-4" />}
          label="Avg %"
          value={`${data.averagePercentage.toFixed(1)}%`}
          tone="green"
        />
        <Tile
          icon={<Trophy className="w-4 h-4" />}
          label="Pass rate"
          value={`${data.passRate.toFixed(0)}%`}
          tone="amber"
        />
        <Tile
          icon={<Clock className="w-4 h-4" />}
          label="Highest %"
          value={`${data.highestPercentage.toFixed(1)}%`}
          tone="rose"
        />
      </div>

      {/* Topper podium */}
      {data.toppers.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Toppers
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.toppers.map((t) => (
              <div
                key={t.rank}
                className="rounded-xl border border-border/60 bg-card/60 p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Rank #{t.rank}
                  </span>
                  <Trophy
                    className={`w-4 h-4 ${
                      t.rank === 1
                        ? "text-amber-500"
                        : t.rank === 2
                          ? "text-slate-500"
                          : "text-orange-500"
                    }`}
                  />
                </div>
                <p className="text-base font-display font-semibold text-foreground">
                  {t.studentName}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.score} marks · {t.percentage.toFixed(1)}% ·{" "}
                  {t.accuracy.toFixed(0)}% accuracy
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section performance */}
      {data.sectionPerformance.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Section performance
          </h3>
          <div className="space-y-1.5">
            {[...data.sectionPerformance]
              .sort((a, b) => b.accuracy - a.accuracy)
              .map((s) => (
                <SectionBar key={s.chapter} section={s} />
              ))}
          </div>
        </section>
      )}

      {/* Weak chapters */}
      {data.weakChapters.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-rose-600" />
            Weak chapters (below 60% accuracy)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {data.weakChapters.map((s) => (
              <div
                key={s.chapter}
                className="rounded-lg border border-rose-200 bg-rose-50/40 p-3"
              >
                <p className="text-sm font-semibold text-rose-800">
                  {s.chapter}
                </p>
                <p className="text-xs text-rose-700">
                  {s.correct}/{s.questions} correct · {s.accuracy.toFixed(0)}%
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Question difficulty */}
      {sortedQuestions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">
              Question-wise difficulty
            </h3>
            <select
              value={questionSort}
              onChange={(e) =>
                setQuestionSort(e.target.value as "easiest" | "hardest")
              }
              className="bg-background border border-border rounded-md px-2 py-1 text-xs"
            >
              <option value="hardest">Hardest first</option>
              <option value="easiest">Easiest first</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2.5 font-medium">Question</th>
                  <th className="px-3 py-2.5 font-medium">Chapter</th>
                  <th className="px-3 py-2.5 font-medium">Correct</th>
                  <th className="px-3 py-2.5 font-medium">Correct rate</th>
                  <th className="px-3 py-2.5 font-medium">Avg time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {sortedQuestions.slice(0, 25).map((q) => (
                  <QuestionRow key={q.questionId} row={q} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

const QuestionRow = ({ row }: { row: QuestionDifficultyRow }) => {
  const tone =
    row.correctRate >= 70
      ? "text-emerald-600"
      : row.correctRate >= 40
        ? "text-amber-600"
        : "text-rose-600";
  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-3 py-2.5 max-w-md">
        <p className="text-foreground truncate">{row.questionText}</p>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground text-xs">
        {row.chapter ?? "—"}
      </td>
      <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
        {row.correct}/{row.attempts}
      </td>
      <td className={`px-3 py-2.5 font-semibold tabular-nums ${tone}`}>
        {row.correctRate.toFixed(1)}%
      </td>
      <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
        {row.avgTimeSeconds}s
      </td>
    </tr>
  );
};

const SectionBar = ({ section }: { section: SectionPerformance }) => {
  const pct = Math.max(0, Math.min(100, section.accuracy));
  const tone =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 60
        ? "bg-blue-500"
        : pct >= 40
          ? "bg-amber-500"
          : "bg-rose-500";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-foreground font-medium">{section.chapter}</span>
        <span className="text-muted-foreground tabular-nums">
          {section.correct}/{section.questions} · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full transition-all ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const Tile = ({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "amber" | "rose";
}) => {
  const cls = {
    blue: "text-blue-600",
    green: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
  }[tone];
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className={cls}>{icon}</span>
        {label}
      </div>
      <p className={`text-2xl font-display font-semibold mt-1 ${cls}`}>
        {value}
      </p>
    </div>
  );
};
