import type { PublicQuestion } from "../services/onlineTest.service";
import type { AnswerDraft } from "../types/mcqExam.types";

interface Props {
  questions: PublicQuestion[];
  answers: Record<string, AnswerDraft>;
  currentIndex: number;
  onJump: (index: number) => void;
}

const isAnswered = (d?: AnswerDraft): boolean =>
  !!d &&
  ((d.selectedOptionIds?.length ?? 0) > 0 ||
    (d.numericValue != null && Number.isFinite(d.numericValue)));

// ─────────────────────────────────────────────────────────────────────────────
// Question palette — the navigator + progress tracker. Each cell is colour-
// coded (answered / marked-for-review / untouched) and jumps straight to that
// question. The footer is the remaining-questions counter.
// ─────────────────────────────────────────────────────────────────────────────
export const ExamPalette = ({
  questions,
  answers,
  currentIndex,
  onJump,
}: Props) => {
  let attempted = 0;
  let review = 0;
  for (const q of questions) {
    const d = answers[q.id];
    if (isAnswered(d)) attempted += 1;
    if (d?.markedForReview) review += 1;
  }
  const total = questions.length;
  const unattempted = total - attempted;
  const progress = total > 0 ? Math.round((attempted / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-medium text-foreground">Progress</span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Counter label="Answered" value={attempted} tone="green" />
        <Counter label="Left" value={unattempted} tone="slate" />
        <Counter label="Review" value={review} tone="amber" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-6 gap-1.5">
        {questions.map((q, i) => {
          const d = answers[q.id];
          const answered = isAnswered(d);
          const marked = d?.markedForReview;
          const current = i === currentIndex;
          const cls = marked
            ? "bg-amber-100 text-amber-800 border-amber-300"
            : answered
              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
              : "bg-muted/60 text-muted-foreground border-border/60";
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onJump(i)}
              className={`h-8 rounded-md border text-xs font-semibold transition-all ${cls} ${
                current ? "ring-2 ring-accent ring-offset-1" : ""
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        {unattempted} question{unattempted === 1 ? "" : "s"} remaining
      </p>
    </div>
  );
};

const Counter = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "slate" | "amber";
}) => {
  const cls = {
    green: "text-emerald-600",
    slate: "text-slate-600",
    amber: "text-amber-600",
  }[tone];
  return (
    <div className="rounded-md border border-border/60 bg-card/60 py-1">
      <p className={`text-base font-semibold ${cls}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
};
