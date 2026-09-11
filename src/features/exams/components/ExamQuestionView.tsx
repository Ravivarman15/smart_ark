import { Bookmark, Languages, Loader2, Sigma } from "lucide-react";
import { DifficultyBadge, QuestionTypeBadge } from "./McqBadges";
import { isAutoEvaluable } from "../types/mcq.types";
import type { PublicQuestion } from "../services/onlineTest.service";
import type { McqQuestionType } from "../types/mcq.types";
import type { AnswerDraft } from "../types/mcqExam.types";
import { useTranslatedQuestion } from "../hooks/useTranslatedQuestion";
import { t, type ExamLanguage } from "../services/examTranslation.service";

interface Props {
  question: PublicQuestion;
  index: number;
  total: number;
  draft: AnswerDraft;
  onChange: (patch: Partial<AnswerDraft>) => void;
  lang?: ExamLanguage;
  allQuestions?: PublicQuestion[];
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

export const ExamQuestionView = ({
  question,
  index,
  total,
  draft,
  onChange,
  lang = "en",
  allQuestions,
}: Props) => {
  const { displayQuestion, isTranslating } = useTranslatedQuestion(
    question,
    lang,
    allQuestions,
    index,
  );
  const activeQ = displayQuestion ?? question;

  const type = activeQ.questionType;
  const isMultiple = type === "multiple";
  const isNumerical = type === "numerical";
  const isShortText = type === "fill_ups" || type === "one_word";
  const isMatch = type === "match_following";
  const isLongForm = LONG_FORM.includes(type);
  const hasOptions = activeQ.options.length > 0;
  const teacherGraded = !isAutoEvaluable(type);

  const selected = draft.selectedOptionIds ?? [];
  // Prompts and choices arrive as two INDEPENDENT arrays. They used to be one
  // array of {left, right} pairs — which is the answer key, and it was being
  // handed to the student to render the question with.
  const prompts = activeQ.matchPrompts ?? question.matchPrompts ?? [];
  const choices = activeQ.matchChoices ?? question.matchChoices ?? [];

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
    const next = prompts.map((_, i) => matchAnswers[i] ?? "");
    next[rowIndex] = value;
    onChange({ textValue: next.join("|") });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {t("question", lang)} {index + 1}
            <span className="text-muted-foreground font-normal"> / {total}</span>
          </span>
          <QuestionTypeBadge type={activeQ.questionType} />
          <DifficultyBadge difficulty={activeQ.difficulty} />
          {isTranslating && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> {t("translating", lang)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            +{activeQ.marks}
            {activeQ.negativeMarks > 0 ? ` / −${activeQ.negativeMarks}` : ""}
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
            {t("review", lang)}
          </button>
        </div>
      </div>

      {/* Stem */}
      <div className="space-y-3">
        {activeQ.hasFormula && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Sigma className="w-3 h-3" /> {t("containsFormulae", lang)}
          </span>
        )}
        <p
          className={`text-base text-foreground leading-relaxed whitespace-pre-wrap ${
            activeQ.hasFormula ? "font-mono text-sm" : ""
          }`}
        >
          {activeQ.questionText}
        </p>
        {activeQ.imageUrl && (
          <img
            src={activeQ.imageUrl}
            alt="Question"
            className="max-h-72 rounded-lg border border-border/60"
          />
        )}
      </div>

      {/* ── Answer input, matched to the question type ── */}
      {isNumerical ? (
        <div className="max-w-xs">
          <label className="text-xs font-medium text-muted-foreground">
            {t("yourNumericAnswer", lang)}
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
            placeholder={t("enterValue", lang)}
            className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
          />
        </div>
      ) : isShortText ? (
        <div className="max-w-md">
          <label className="text-xs font-medium text-muted-foreground">
            {type === "fill_ups" ? t("fillInTheBlank", lang) : t("yourAnswer", lang)}
          </label>
          <input
            type="text"
            value={draft.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value })}
            placeholder={t("typeYourAnswer", lang)}
            className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("spellingNote", lang)}
          </p>
        </div>
      ) : isMatch ? (
        <div className="space-y-2">
          {prompts.map((prompt, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="shrink-0 w-6 h-6 rounded-md border border-border flex items-center justify-center text-xs font-semibold text-muted-foreground">
                {letter(i)}
              </span>
              <span className="flex-1 text-sm text-foreground">{prompt}</span>
              <select
                value={matchAnswers[i] ?? ""}
                onChange={(e) => setMatch(i, e.target.value)}
                className="w-52 bg-background border border-border rounded-lg px-2 py-2 text-sm"
              >
                <option value="">{t("selectPrompt", lang)}</option>
                {choices.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          ))}
          {prompts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("noOptionsWarning", lang)}
            </p>
          )}
        </div>
      ) : isLongForm || (!hasOptions && teacherGraded) ? (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {t("yourAnswer", lang)}
          </label>
          <textarea
            rows={ROWS[type] ?? 6}
            value={draft.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value })}
            placeholder={PLACEHOLDER[type] ?? t("typeYourAnswer", lang)}
            className={`mt-1 w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm leading-relaxed ${
              type === "programming" ? "font-mono" : ""
            }`}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("teacherGradedNote", lang)}
          </p>
        </div>
      ) : hasOptions ? (
        <div className="space-y-2">
          {activeQ.options.map((opt, i) => {
            const optId = opt.id || `o${i + 1}`;
            const active = selected.includes(optId);
            return (
              <button
                key={optId}
                type="button"
                onClick={() => pick(optId)}
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
              {t("multipleChoiceHint", lang)}
            </p>
          )}
        </div>
      ) : (
        // An option type that reached the student with no options is a broken
        // question. Say so plainly rather than rendering an empty box that looks
        // like the exam is still loading.
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t("noOptionsWarning", lang)}
        </p>
      )}
    </div>
  );
};
