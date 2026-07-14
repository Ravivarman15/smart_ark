import { Bookmark, Sigma } from "lucide-react";
import { DifficultyBadge, QuestionTypeBadge } from "./McqBadges";
import { isAutoEvaluable } from "../types/mcq.types";
import type { McqQuestionType, PaperQuestionView } from "../types/mcq.types";
import type { AnswerDraft } from "../types/mcqExam.types";

interface Props {
  question: PaperQuestionView;
  index: number;
  total: number;
  draft: AnswerDraft;
  onChange: (patch: Partial<AnswerDraft>) => void;
}

const letter = (i: number) => String.fromCharCode(65 + i);

/** Types answered by typing prose into a textarea (all teacher-graded). */
const LONG_FORM: McqQuestionType[] = [
  "short_answer", "long_answer", "paragraph",
  "case_study", "essay", "programming", "diagram",
];

/** Rows for the textarea, tuned to how much the question actually expects. */
const ROWS: Partial<Record<McqQuestionType, number>> = {
  short_answer: 3,
  paragraph: 6,
  long_answer: 8,
  case_study: 8,
  essay: 10,
  programming: 10,
  diagram: 4,
};

const PLACEHOLDER: Partial<Record<McqQuestionType, string>> = {
  programming: "Write your program / algorithm here…",
  diagram: "Describe your diagram, or write the labels in order.",
  essay: "Write your essay here…",
};

// ─────────────────────────────────────────────────────────────────────────────
// Single-question view for the live exam — distraction-free. Renders the stem
// (image + formula-aware), the answer input matched to the question type, and
// the mark-for-review toggle. Option order is already frozen by the runner.
//
// EVERY question type the importer can produce is answerable here. That is not
// cosmetic: mcqScoring reads `textValue`, so a type with no input would be
// submitted empty and scored 0 no matter what the student knew.
//   • option types ....... single / multiple / true_false / assertion_reason
//   • numerical .......... number box (tolerance applied by the grader)
//   • fill_ups/one_word .. one-line text, matched against the key
//   • match_following .... a select per left item; stored as the right-hand
//                          column, "|"-joined in left order (scoreAnswer's shape)
//   • long-form .......... textarea; flagged for teacher evaluation, never
//                          auto-scored to 0
// ─────────────────────────────────────────────────────────────────────────────
export const ExamQuestionView = ({
  question,
  index,
  total,
  draft,
  onChange,
}: Props) => {
  const type = question.questionType;
  const isMultiple = type === "multiple";
  const isNumerical = type === "numerical";
  const isShortText = type === "fill_ups" || type === "one_word";
  const isMatch = type === "match_following";
  const isLongForm = LONG_FORM.includes(type);
  const hasOptions = question.options.length > 0;
  const teacherGraded = !isAutoEvaluable(type);

  const selected = draft.selectedOptionIds ?? [];
  const pairs = question.matchPairs ?? [];

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

  // Match-the-following: the student's answer is the right-hand column in the
  // order of the left-hand items. Kept as a "|"-joined string so it round-trips
  // through the same `textValue` column as every other typed answer.
  const matchAnswers = (draft.textValue ?? "").split("|");
  const setMatch = (rowIndex: number, value: string) => {
    const next = pairs.map((_, i) => matchAnswers[i] ?? "");
    next[rowIndex] = value;
    onChange({ textValue: next.join("|") });
  };

  // The right-hand column, shuffled deterministically by question id so every
  // student sees the same set but not in the answer order.
  const choices = [...pairs.map((p) => p.right)].sort((a, b) =>
    (a + question.id).localeCompare(b + question.id),
  );

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

      {/* ── Answer input, matched to the question type ── */}
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
      ) : isShortText ? (
        <div className="max-w-md">
          <label className="text-xs font-medium text-muted-foreground">
            {type === "fill_ups" ? "Fill in the blank" : "Your answer"}
          </label>
          <input
            type="text"
            value={draft.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value })}
            placeholder="Type your answer"
            className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Spelling and capitalisation are not marked strictly.
          </p>
        </div>
      ) : isMatch ? (
        <div className="space-y-2">
          {pairs.map((p, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="shrink-0 w-6 h-6 rounded-md border border-border flex items-center justify-center text-xs font-semibold text-muted-foreground">
                {letter(i)}
              </span>
              <span className="flex-1 text-sm text-foreground">{p.left}</span>
              <select
                value={matchAnswers[i] ?? ""}
                onChange={(e) => setMatch(i, e.target.value)}
                className="w-52 bg-background border border-border rounded-lg px-2 py-2 text-sm"
              >
                <option value="">— select —</option>
                {choices.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          ))}
          {pairs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This question has no match pairs configured — tell your invigilator.
            </p>
          )}
        </div>
      ) : isLongForm || (!hasOptions && teacherGraded) ? (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Your answer
          </label>
          <textarea
            rows={ROWS[type] ?? 6}
            value={draft.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value })}
            placeholder={PLACEHOLDER[type] ?? "Write your answer here…"}
            className={`mt-1 w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm leading-relaxed ${
              type === "programming" ? "font-mono" : ""
            }`}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            This answer is marked by your teacher — it is not scored automatically.
          </p>
        </div>
      ) : hasOptions ? (
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
      ) : (
        // An option type that reached the student with no options is a broken
        // question. Say so plainly rather than rendering an empty box that looks
        // like the exam is still loading.
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          This question has no answer options configured. Tell your invigilator —
          you will not be penalised for it.
        </p>
      )}
    </div>
  );
};
