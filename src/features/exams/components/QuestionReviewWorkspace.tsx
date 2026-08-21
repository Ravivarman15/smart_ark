import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Smartphone,
  Tablet,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  blockingReason,
  reviewQuestion,
  summariseReview,
  type ReviewStatus,
} from "../utils/reviewStatus";
import { MCQ_QUESTION_TYPES, isAutoEvaluable } from "../types/mcq.types";
import type { McqQuestionType } from "../types/mcq.types";
import type { ParsedQuestion } from "../utils/paperParser";

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW, WITH THE STUDENT'S VIEW BESIDE IT
//
// ┌── WHY THE PREVIEW IS NOT A SEPARATE SCREEN ────────────────────────────┐
// │ A "Preview" button opens a modal, the teacher glances at question one, │
// │ closes it, and never looks again. The mistakes that matter — an option │
// │ that is blank, a stem that lost its second half, the wrong option      │
// │ ticked — are visible in exactly one place: the question rendered the   │
// │ way a student will meet it.                                           │
// │                                                                        │
// │ So it sits alongside the editor and updates as you type. It is also    │
// │ deliberately the SAME shape the real engine renders — no answer key,   │
// │ no explanation — because a preview that shows more than the student    │
// │ sees is not a preview of anything.                                     │
// └────────────────────────────────────────────────────────────────────────┘
//
// Publishing is blocked on `answer_unknown` and `parse_failed`, never on
// `needs_review`: a low-confidence question is a thing to look at, not a thing
// to forbid, and forbidding it would train people to click past the warning
// that actually matters.
// ─────────────────────────────────────────────────────────────────────────────

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "max-w-full",
  tablet: "max-w-[640px]",
  mobile: "max-w-[380px]",
};

const STATUS_TONE: Record<ReviewStatus, string> = {
  ready: "text-accent",
  needs_review: "text-amber-600 dark:text-amber-400",
  answer_unknown: "text-destructive",
  parse_failed: "text-destructive",
};

const STATUS_DOT: Record<ReviewStatus, string> = {
  ready: "bg-accent",
  needs_review: "bg-amber-500",
  answer_unknown: "bg-destructive",
  parse_failed: "bg-destructive",
};

interface Props {
  questions: ParsedQuestion[];
  onChange: (next: ParsedQuestion[]) => void;
  /** Rendered above the preview, so the teacher sees the real test header. */
  testTitle?: string;
}

export const QuestionReviewWorkspace = ({
  questions,
  onChange,
  testTitle,
}: Props) => {
  const [index, setIndex] = useState(0);
  const [device, setDevice] = useState<Device>("desktop");

  const verdicts = useMemo(
    () =>
      questions.map((q) =>
        reviewQuestion({
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options,
          numericalAnswer: q.numericalAnswer ?? null,
          answerText: q.answerText,
          matchPairs: q.matchPairs,
          marks: q.marks,
          confidence: q.confidence,
        }),
      ),
    [questions],
  );

  const summary = useMemo(() => summariseReview(verdicts), [verdicts]);
  const blocked = blockingReason(summary);

  const current = questions[index];
  const verdict = verdicts[index];

  const patch = (changes: Partial<ParsedQuestion>) =>
    onChange(questions.map((q, i) => (i === index ? { ...q, ...changes } : q)));

  const remove = () => {
    const next = questions.filter((_, i) => i !== index);
    onChange(next);
    setIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
  };

  const setOption = (optIndex: number, text: string) =>
    patch({
      options: current.options.map((o, i) => (i === optIndex ? { ...o, text } : o)),
    });

  const setCorrect = (optIndex: number) =>
    patch({
      options: current.options.map((o, i) => ({
        ...o,
        // A single-correct question gets exactly one tick. Toggling without
        // clearing the others is how a paper ends up with two correct options
        // and grades every student zero.
        isCorrect:
          current.questionType === "multiple"
            ? i === optIndex
              ? !o.isCorrect
              : o.isCorrect
            : i === optIndex,
      })),
    });

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 py-16 text-center">
        <p className="text-sm font-medium text-foreground">No questions yet</p>
        <p className="text-xs text-muted-foreground mt-1.5">
          Go back and add some — a test with no questions cannot be published.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Counters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 p-3.5">
        <Counter label="Total" value={summary.total} />
        <Counter label="Ready" value={summary.ready} tone="text-accent" />
        <Counter
          label="Needs review"
          value={summary.needsReview}
          tone="text-amber-600 dark:text-amber-400"
        />
        <Counter
          label="Answer missing"
          value={summary.answerUnknown}
          tone="text-destructive"
        />
        {summary.parseFailed > 0 && (
          <Counter
            label="Unreadable"
            value={summary.parseFailed}
            tone="text-destructive"
          />
        )}
      </div>

      {blocked && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3.5">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-foreground">{blocked}</p>
        </div>
      )}

      <div className="grid lg:grid-cols-[220px_1fr_1fr] gap-4">
        {/* ── The list ─────────────────────────────────────────────────────── */}
        <aside className="rounded-xl border border-border/70 p-2 max-h-[32rem] overflow-y-auto">
          {questions.map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition",
                i === index ? "bg-accent/10" : "hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                  STATUS_DOT[verdicts[i].status],
                )}
              />
              <span className="min-w-0">
                <span className="block text-xs text-foreground truncate">
                  {i + 1}. {q.questionText || "(empty)"}
                </span>
                {verdicts[i].status !== "ready" && (
                  <span
                    className={cn("block text-[10px]", STATUS_TONE[verdicts[i].status])}
                  >
                    {STATUS_LABEL[verdicts[i].status]}
                  </span>
                )}
              </span>
            </button>
          ))}
        </aside>

        {/* ── The editor ───────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border/70 p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Question {index + 1} of {questions.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={index >= questions.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={remove}
                title="Remove this question"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {verdict.reasons.length > 0 && (
            <ul className="space-y-1">
              {verdict.reasons.map((r, i) => (
                <li
                  key={i}
                  className={cn("text-[11px] flex items-start gap-1.5", STATUS_TONE[verdict.status])}
                >
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          )}

          <div>
            <Label className="text-xs">Question</Label>
            <Textarea
              rows={3}
              value={current.questionText}
              onChange={(e) => patch({ questionText: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <select
                value={current.questionType}
                onChange={(e) =>
                  patch({ questionType: e.target.value as McqQuestionType })
                }
                className="mt-1.5 w-full bg-background border border-border rounded-md px-2 py-2 text-sm"
              >
                {MCQ_QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Marks</Label>
              <Input
                inputMode="decimal"
                value={String(current.marks ?? "")}
                onChange={(e) => patch({ marks: Number(e.target.value) || 0 })}
                className="mt-1.5"
              />
            </div>
          </div>

          {current.options.length > 0 && (
            <div>
              <Label className="text-xs">
                Options — click the circle to mark the correct one
              </Label>
              <div className="mt-1.5 space-y-2">
                {current.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrect(i)}
                      aria-label={`Mark option ${String.fromCharCode(65 + i)} correct`}
                      aria-pressed={o.isCorrect}
                      className={cn(
                        "w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition",
                        o.isCorrect
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border hover:border-accent",
                      )}
                    >
                      {o.isCorrect ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {String.fromCharCode(65 + i)}
                        </span>
                      )}
                    </button>
                    <Input
                      value={o.text}
                      onChange={(e) => setOption(i, e.target.value)}
                      className="h-9"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isAutoEvaluable(current.questionType) && (
            <p className="text-[11px] text-muted-foreground">
              A teacher marks this one after the test. It has no answer key, and
              the student&rsquo;s score stays provisional until it is marked.
            </p>
          )}
        </div>

        {/* ── The student's view ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-border/70 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs text-muted-foreground">
              What the student sees
            </span>
            <div className="flex gap-0.5">
              {(
                [
                  ["desktop", Monitor],
                  ["tablet", Tablet],
                  ["mobile", Smartphone],
                ] as [Device, typeof Monitor][]
              ).map(([id, Icon]) => (
                <Button
                  key={id}
                  variant={device === id ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setDevice(id)}
                  aria-label={`${id} preview`}
                  aria-pressed={device === id}
                >
                  <Icon className="w-3.5 h-3.5" />
                </Button>
              ))}
            </div>
          </div>

          <div
            className={cn(
              "mx-auto rounded-lg border border-border/60 bg-background p-4 transition-all",
              DEVICE_WIDTH[device],
            )}
          >
            {testTitle && (
              <p className="text-[11px] text-muted-foreground border-b border-border/60 pb-2 mb-3">
                {testTitle}
              </p>
            )}
            <p className="text-xs text-muted-foreground mb-1.5">
              Question {index + 1} of {questions.length}
              {current.marks > 0 && <> · {current.marks} marks</>}
            </p>
            <p className="text-sm text-foreground">
              {current.questionText || (
                <span className="text-destructive italic">
                  This question has no text — the student would see an empty box.
                </span>
              )}
            </p>

            {/* No tick, no key, no explanation. The student has none of that
                yet, and a preview showing more is not a preview. */}
            {current.options.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {current.options.map((o, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2"
                  >
                    <span className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[10px] text-muted-foreground shrink-0">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-sm text-foreground">
                      {o.text || (
                        <span className="text-destructive italic text-xs">
                          empty option
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-border/60 px-3 py-6 text-center">
                <p className="text-xs text-muted-foreground">
                  {isAutoEvaluable(current.questionType)
                    ? "The student types their answer here."
                    : "The student writes a long answer here."}
                </p>
              </div>
            )}
          </div>

          {verdict.status === "answer_unknown" && (
            <p className="text-[11px] text-destructive mt-3 flex items-start gap-1.5">
              <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
              This one cannot be published until an answer is set — nothing would
              ever mark it correct.
            </p>
          )}
        </div>
      </div>
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
  tone?: string;
}) => (
  <div>
    <p className={cn("text-lg font-semibold tabular-nums", tone ?? "text-foreground")}>
      {value}
    </p>
    <p className="text-[11px] text-muted-foreground">{label}</p>
  </div>
);
