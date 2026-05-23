import { Bookmark, Sigma } from "lucide-react";
import { DifficultyBadge, QuestionTypeBadge } from "./McqBadges";
import type { PaperQuestionView } from "../types/mcq.types";
import type { AnswerDraft } from "../types/mcqExam.types";

interface Props {
  question: PaperQuestionView;
  index: number;
  total: number;
  draft: AnswerDraft;
  onChange: (patch: Partial<AnswerDraft>) => void;
}

const letter = (i: number) => String.fromCharCode(65 + i);

// ─────────────────────────────────────────────────────────────────────────────
// Single-question view for the live exam — distraction-free. Renders the stem
// (image + formula-aware), the answer input matched to the question type, and
// the mark-for-review toggle. Option order is already frozen by the runner.
// ─────────────────────────────────────────────────────────────────────────────
export const ExamQuestionView = ({
  question,
  index,
  total,
  draft,
  onChange,
}: Props) => {
  const isMultiple = question.questionType === "multiple";
  const isNumerical = question.questionType === "numerical";
  const selected = draft.selectedOptionIds ?? [];

  const pick = (optionId: string) => {
    if (isMultiple) {
      onChange({
        selectedOptionIds: selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId],
      });
    } else {
      onChange({ selectedOptionIds: [optionId] });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Question {index + 1}
            <span className="text-muted-foreground font-normal"> / {total}</span>
          </span>
          <QuestionTypeBadge type={question.questionType} />
          <DifficultyBadge difficulty={question.difficulty} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            +{question.effectiveMarks}
            {question.negativeMarks > 0 ? ` / −${question.negativeMarks}` : ""}
          </span>
          <button
            type="button"
            onClick={() => onChange({ markedForReview: !draft.markedForReview })}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${
              draft.markedForReview
                ? "bg-amber-50 text-amber-700 border-amber-300"
                : "border-border/60 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Bookmark
              className={`w-3.5 h-3.5 ${
                draft.markedForReview ? "fill-amber-400" : ""
              }`}
            />
            Review
          </button>
        </div>
      </div>

      {/* Stem */}
      <div className="space-y-3">
        {question.hasFormula && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Sigma className="w-3 h-3" /> Contains formulae
          </span>
        )}
        <p
          className={`text-base text-foreground leading-relaxed whitespace-pre-wrap ${
            question.hasFormula ? "font-mono text-sm" : ""
          }`}
        >
          {question.questionText}
        </p>
        {question.imageUrl && (
          <img
            src={question.imageUrl}
            alt="Question"
            className="max-h-72 rounded-lg border border-border/60"
          />
        )}
      </div>

      {/* Answer input */}
      {isNumerical ? (
        <div className="max-w-xs">
          <label className="text-xs font-medium text-muted-foreground">
            Your numeric answer
          </label>
          <input
            type="number"
            step="any"
            value={draft.numericValue ?? ""}
            onChange={(e) =>
              onChange({
                numericValue:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="Enter a value"
            className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
          />
        </div>
      ) : (
        <div className="space-y-2">
          {question.options.map((opt, i) => {
            const active = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => pick(opt.id)}
                className={`w-full flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-border/60 hover:border-accent/40 hover:bg-muted/40"
                }`}
              >
                <span
                  className={`shrink-0 w-6 h-6 border flex items-center justify-center text-xs font-semibold ${
                    isMultiple ? "rounded-md" : "rounded-full"
                  } ${
                    active
                      ? "bg-accent text-accent-foreground border-accent"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {letter(i)}
                </span>
                <span className="flex-1 text-sm text-foreground">
                  {opt.text}
                  {opt.imageUrl && (
                    <img
                      src={opt.imageUrl}
                      alt={`Option ${letter(i)}`}
                      className="mt-2 max-h-32 rounded border border-border/60"
                    />
                  )}
                </span>
              </button>
            );
          })}
          {isMultiple && (
            <p className="text-[11px] text-muted-foreground">
              Multiple answers may be correct — select all that apply.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
