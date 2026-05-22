import { Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DifficultyBadge, QuestionTypeBadge } from "./McqBadges";
import type { McqQuestion } from "../types/mcq.types";

interface Props {
  question: McqQuestion | null;
  onOpenChange: (open: boolean) => void;
}

const letter = (i: number) => String.fromCharCode(65 + i);

// ─────────────────────────────────────────────────────────────────────────────
// Question preview drawer — a right-hand panel showing one question exactly as
// it reads, with the answer key revealed. Used from the bank browser and the
// paper builder.
// ─────────────────────────────────────────────────────────────────────────────
export const QuestionPreviewDrawer = ({ question, onOpenChange }: Props) => (
  <Sheet open={!!question} onOpenChange={(o) => !o && onOpenChange(false)}>
    <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
      <SheetHeader>
        <SheetTitle>Question Preview</SheetTitle>
      </SheetHeader>

      {question && (
        <div className="mt-4 space-y-4">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-1.5">
            <QuestionTypeBadge type={question.questionType} />
            <DifficultyBadge difficulty={question.difficulty} />
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-border/60 bg-muted/40">
              {question.marks} mark{question.marks === 1 ? "" : "s"}
            </span>
            {question.negativeMarks > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-rose-200 bg-rose-50 text-rose-600">
                −{question.negativeMarks} negative
              </span>
            )}
          </div>

          {(question.subjectName || question.chapter || question.topic) && (
            <p className="text-xs text-muted-foreground">
              {[question.subjectName, question.chapter, question.topic]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {/* Stem */}
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {question.questionText}
          </p>
          {question.imageUrl && (
            <img
              src={question.imageUrl}
              alt="Question"
              className="max-h-48 rounded-md border border-border/60"
            />
          )}

          {/* Answer key */}
          {question.questionType === "numerical" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <span className="font-medium text-emerald-700">
                Answer: {question.numericalAnswer?.value ?? "—"}
              </span>
              {question.numericalAnswer && question.numericalAnswer.tolerance > 0 && (
                <span className="text-emerald-600">
                  {" "}
                  (± {question.numericalAnswer.tolerance})
                </span>
              )}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {question.options.map((opt, i) => (
                <li
                  key={opt.id}
                  className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                    opt.isCorrect
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-border/60"
                  }`}
                >
                  <span className="text-xs font-semibold text-muted-foreground w-4 pt-0.5">
                    {letter(i)}
                  </span>
                  <span className="flex-1">{opt.text}</span>
                  {opt.isCorrect && (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Explanation */}
          {question.explanation && (
            <div className="rounded-md bg-muted/40 border border-border/50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Explanation
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {question.explanation}
              </p>
            </div>
          )}
        </div>
      )}
    </SheetContent>
  </Sheet>
);
