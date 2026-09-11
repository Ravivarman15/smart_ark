import { useMemo } from "react";
import {
  Award,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Lock,
  Sigma,
  Target,
  TrendingDown,
  Trophy,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudentExamResult } from "../hooks";
import { correctOptionIds } from "../utils";
import type {
  ResultAnswerRow,
  SectionPerformance,
} from "../types/mcqExam.types";

interface Props {
  attemptId: string;
  onClose?: () => void;
}

const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};

// ─────────────────────────────────────────────────────────────────────────────
// StudentResultView — the post-attempt screen.
//
// Pure presentation over `useStudentExamResult`. Shows the score card,
// section-wise accuracy, weak chapters and a per-question review with the
// student's choice, the correct answer key and the explanation. If the exam's
// results are not yet released (manual / scheduled), gates the review behind
// a friendly "results not released yet" panel.
// ─────────────────────────────────────────────────────────────────────────────
export const StudentResultView = ({ attemptId, onClose }: Props) => {
  const { data, isLoading, error } = useStudentExamResult(attemptId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        Loading your result…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-rose-300/60 bg-rose-50/40 text-rose-700 p-4">
        Failed to load result. Please try again.
      </div>
    );
  }

  const { exam, attempt, released, answers, sectionPerformance, weakChapters } =
    data;

  const score = attempt.totalScore ?? 0;
  const maxScore = attempt.maxScore ?? exam.totalMarks ?? 0;
  const percentage = attempt.percentage ?? 0;
  const accuracy = attempt.accuracy ?? 0;
  const isPass = !!attempt.isPass;

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold text-foreground">
            {exam.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {attempt.studentName} · Attempt #{attempt.attemptNumber} ·{" "}
            {fmtTime(attempt.timeSpentSeconds)}
          </p>
        </div>
        <div className="flex gap-2">
          {released && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Print / PDF
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </header>

      {/* Score summary */}
      <div className="rounded-xl border border-border/60 bg-gradient-to-br from-accent/5 to-transparent p-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          <SummaryCard
            icon={<Trophy className="w-4 h-4" />}
            label="Score"
            value={`${score} / ${maxScore}`}
            tone={isPass ? "green" : "rose"}
          />
          <SummaryCard
            icon={<Sigma className="w-4 h-4" />}
            label="Percentage"
            value={`${percentage.toFixed(1)}%`}
            tone={isPass ? "green" : "rose"}
          />
          <SummaryCard
            icon={<Target className="w-4 h-4" />}
            label="Accuracy"
            value={`${accuracy.toFixed(1)}%`}
            tone="blue"
          />
          <SummaryCard
            icon={<Award className="w-4 h-4" />}
            label="Rank"
            value={attempt.rank ? `#${attempt.rank}` : "—"}
            tone="amber"
            secondary={
              attempt.percentile != null
                ? `${attempt.percentile.toFixed(1)} pctl`
                : undefined
            }
          />
          <SummaryCard
            icon={<Clock className="w-4 h-4" />}
            label="Result"
            value={isPass ? "Passed" : "Failed"}
            tone={isPass ? "green" : "rose"}
            secondary={`Pass ≥ ${exam.passPercentage}%`}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4 text-center text-xs text-muted-foreground">
          <div>
            <p className="text-emerald-600 text-lg font-semibold">
              {attempt.correctCount ?? 0}
            </p>
            Correct
          </div>
          <div>
            <p className="text-rose-600 text-lg font-semibold">
              {attempt.wrongCount ?? 0}
            </p>
            Wrong
          </div>
          <div>
            <p className="text-slate-600 text-lg font-semibold">
              {attempt.unattemptedCount ?? 0}
            </p>
            Unattempted
          </div>
        </div>
      </div>

      {!released ? (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50/40 p-5 flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-700 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">
              Detailed review will be available later
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              {exam.resultRelease === "manual"
                ? "Your teacher will release the detailed answer review shortly."
                : exam.resultReleaseAt
                  ? `Detailed review unlocks on ${new Date(
                      exam.resultReleaseAt,
                    ).toLocaleString()}.`
                  : "Detailed review will be released soon."}
            </p>
          </div>
        </div>
      ) : (
        <ReleasedSections
          answers={answers}
          sectionPerformance={sectionPerformance}
          weakChapters={weakChapters}
        />
      )}
    </div>
  );
};

const ReleasedSections = ({
  answers,
  sectionPerformance,
  weakChapters,
}: {
  answers: ResultAnswerRow[];
  sectionPerformance: SectionPerformance[];
  weakChapters: SectionPerformance[];
}) => {
  const sortedSections = useMemo(
    () => [...sectionPerformance].sort((a, b) => b.accuracy - a.accuracy),
    [sectionPerformance],
  );

  return (
    <div className="space-y-5">
      {/* Section performance */}
      {sortedSections.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Chapter performance
          </h3>
          <div className="space-y-1.5">
            {sortedSections.map((s) => (
              <SectionBar key={s.chapter} section={s} />
            ))}
          </div>
        </section>
      )}

      {/* Weak chapters */}
      {weakChapters.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-rose-600" />
            Focus areas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {weakChapters.map((s) => (
              <div
                key={s.chapter}
                className="rounded-lg border border-rose-200 bg-rose-50/40 p-3"
              >
                <p className="text-sm font-semibold text-rose-800">
                  {s.chapter}
                </p>
                <p className="text-xs text-rose-700">
                  {s.correct} / {s.questions} correct ·{" "}
                  {s.accuracy.toFixed(0)}% accuracy
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-question review */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Answer review
        </h3>
        <div className="space-y-3">
          {answers.map((row, i) => (
            <ReviewCard key={row.question.id} row={row} index={i} />
          ))}
        </div>
      </section>
    </div>
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

const ReviewCard = ({ row, index }: { row: ResultAnswerRow; index: number }) => {
  const { question, answer, awarded, maxMarks, correct, attempted } = row;
  const tone = !attempted
    ? "border-slate-200 bg-slate-50/40"
    : correct
      ? "border-emerald-200 bg-emerald-50/40"
      : "border-rose-200 bg-rose-50/40";

  const correctIds = useMemo(
    () =>
      new Set(
        question.options
          .filter((o) => o.isCorrect)
          .map((o, idx) => o.id || `o${idx + 1}`),
      ),
    [question.options],
  );
  const selectedIds = new Set(answer?.selectedOptionIds ?? []);

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1">
            Question {index + 1}
            {question.chapter ? ` · ${question.chapter}` : ""}
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {question.questionText}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 text-xs">
          {!attempted ? (
            <span className="text-slate-600 font-medium">Skipped</span>
          ) : correct ? (
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Correct
            </span>
          ) : (
            <span className="flex items-center gap-1 text-rose-700 font-medium">
              <XCircle className="w-3.5 h-3.5" /> Wrong
            </span>
          )}
          <span className="text-muted-foreground tabular-nums">
            {awarded > 0 ? `+${awarded}` : awarded} / {maxMarks}
          </span>
        </div>
      </div>

      {question.questionType === "numerical" ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Field
            label="Your answer"
            value={answer?.numericValue?.toString() ?? "—"}
          />
          <Field
            label="Correct answer"
            value={
              question.numericalAnswer
                ? `${question.numericalAnswer.value} (±${question.numericalAnswer.tolerance})`
                : "—"
            }
          />
        </div>
      ) : (
        <div className="space-y-1 mt-2">
          {question.options.map((opt, i) => {
            const optId = opt.id || `o${i + 1}`;
            const isCorrect = correctIds.has(optId);
            const wasSelected = selectedIds.has(optId);
            const cls = isCorrect
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : wasSelected
                ? "border-rose-300 bg-rose-50 text-rose-900"
                : "border-border/60 bg-card/50 text-foreground";
            return (
              <div
                key={optId}
                className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm ${cls}`}
              >
                <span>
                  <span className="font-semibold mr-2">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {opt.text}
                </span>
                <span className="text-[10px] uppercase tracking-wider opacity-80">
                  {isCorrect && "Correct"}
                  {!isCorrect && wasSelected && "Your pick"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {question.explanation && (
        <div className="mt-3 text-xs rounded-md border border-border/40 bg-background/60 px-3 py-2">
          <p className="font-semibold text-foreground mb-0.5">Explanation</p>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {question.explanation}
          </p>
        </div>
      )}
    </div>
  );
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border/60 bg-card/50 px-2.5 py-1.5">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <p className="text-sm text-foreground font-medium">{value}</p>
  </div>
);

const SummaryCard = ({
  icon,
  label,
  value,
  tone,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "green" | "rose" | "blue" | "amber";
  secondary?: string;
}) => {
  const cls = {
    green: "text-emerald-600",
    rose: "text-rose-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
  }[tone];
  return (
    <div className="rounded-lg border border-border/60 bg-card/70 p-3">
      <div
        className={`flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground`}
      >
        <span className={cls}>{icon}</span>
        {label}
      </div>
      <p className={`text-lg md:text-xl font-display font-semibold mt-1 ${cls}`}>
        {value}
      </p>
      {secondary && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{secondary}</p>
      )}
    </div>
  );
};
