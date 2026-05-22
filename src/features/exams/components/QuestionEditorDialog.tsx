import { forwardRef, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, Loader2, Plus, Save, Sigma, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { questionFormSchema, type QuestionFormValues } from "../schemas/mcq.schema";
import { answerKeyError } from "../utils";
import { mcqQuestionService } from "../services";
import { useCreateQuestion, useUpdateQuestion } from "../hooks";
import {
  MCQ_DIFFICULTIES,
  MCQ_QUESTION_TYPES,
  type McqOption,
  type McqQuestion,
  type McqQuestionInput,
  type McqQuestionType,
} from "../types/mcq.types";
import type { LookupOption } from "../services";

interface Props {
  open: boolean;
  /** Question being edited — null/undefined = create mode. */
  question?: McqQuestion | null;
  subjects: LookupOption[];
  onOpenChange: (open: boolean) => void;
  /** Called after a NEW question is created — lets the paper builder auto-add it. */
  onCreated?: (question: McqQuestion) => void;
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `o${Math.random().toString(36).slice(2, 10)}`;

const blankOption = (): McqOption => ({ id: uid(), text: "", isCorrect: false });
const letter = (i: number) => String.fromCharCode(65 + i);

// ─────────────────────────────────────────────────────────────────────────────
// Question editor — create / edit a bank question of any of the five types.
// Scalar fields run through react-hook-form + zod; the dynamic answer key
// (options / numerical) is local state validated by the centralised scoring
// layer (`answerKeyError`). Duplicate detection runs as you type the stem.
// ─────────────────────────────────────────────────────────────────────────────
export const QuestionEditorDialog = ({
  open,
  question,
  subjects,
  onOpenChange,
  onCreated,
}: Props) => {
  const isEdit = !!question;
  const createMut = useCreateQuestion();
  const updateMut = useUpdateQuestion();

  const [options, setOptions] = useState<McqOption[]>([
    blankOption(),
    blankOption(),
  ]);
  const [numValue, setNumValue] = useState("");
  const [numTolerance, setNumTolerance] = useState("0");
  const [dupCount, setDupCount] = useState(0);

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionFormSchema),
    defaultValues: {
      questionText: "",
      questionType: "single",
      difficulty: "medium",
      marks: 1,
      negativeMarks: 0,
      hasFormula: false,
      chapter: "",
      topic: "",
      explanation: "",
      imageUrl: "",
    },
  });

  const questionType = form.watch("questionType");
  const isNumerical = questionType === "numerical";
  const isMultiple = questionType === "multiple";

  // Seed the form + answer key when the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (question) {
      form.reset({
        questionText: question.questionText,
        questionType: question.questionType,
        subjectId: question.subjectId,
        difficulty: question.difficulty,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        hasFormula: question.hasFormula,
        chapter: question.chapter ?? "",
        topic: question.topic ?? "",
        explanation: question.explanation ?? "",
        imageUrl: question.imageUrl ?? "",
      });
      setOptions(
        question.options.length > 0
          ? question.options.map((o) => ({ ...o }))
          : [blankOption(), blankOption()],
      );
      setNumValue(
        question.numericalAnswer ? String(question.numericalAnswer.value) : "",
      );
      setNumTolerance(
        question.numericalAnswer
          ? String(question.numericalAnswer.tolerance)
          : "0",
      );
    } else {
      form.reset();
      setOptions([blankOption(), blankOption()]);
      setNumValue("");
      setNumTolerance("0");
    }
    setDupCount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question]);

  // Switch the answer-key shape when the question type changes.
  const changeType = (t: McqQuestionType) => {
    form.setValue("questionType", t);
    if (t === "true_false") {
      setOptions([
        { id: uid(), text: "True", isCorrect: true },
        { id: uid(), text: "False", isCorrect: false },
      ]);
    } else if (t === "assertion_reason") {
      setOptions([
        { id: uid(), text: "Both Assertion and Reason are true, Reason explains Assertion", isCorrect: true },
        { id: uid(), text: "Both are true, but Reason does not explain Assertion", isCorrect: false },
        { id: uid(), text: "Assertion is true, Reason is false", isCorrect: false },
        { id: uid(), text: "Assertion is false, Reason is true", isCorrect: false },
      ]);
    } else if (t !== "numerical" && options.length < 2) {
      setOptions([blankOption(), blankOption()]);
    }
  };

  // Duplicate detection — runs when the stem loses focus.
  const checkDuplicates = async (text: string) => {
    if (text.trim().length < 10) return setDupCount(0);
    try {
      const dups = await mcqQuestionService.findDuplicates(text, {
        excludeId: question?.id,
        subjectId: form.getValues("subjectId"),
      });
      setDupCount(dups.length);
    } catch {
      setDupCount(0);
    }
  };

  const setCorrect = (id: string) => {
    setOptions((prev) =>
      prev.map((o) =>
        isMultiple
          ? o.id === id
            ? { ...o, isCorrect: !o.isCorrect }
            : o
          : { ...o, isCorrect: o.id === id },
      ),
    );
  };

  const patchOption = (id: string, p: Partial<McqOption>) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...p } : o)));

  const submit = form.handleSubmit(async (values) => {
    const numericalAnswer = isNumerical
      ? { value: Number(numValue), tolerance: Math.abs(Number(numTolerance) || 0) }
      : null;
    const cleanOptions = isNumerical
      ? []
      : options.filter((o) => o.text.trim().length > 0);

    const keyError = answerKeyError({
      questionType: values.questionType,
      options: cleanOptions,
      numericalAnswer,
    });
    if (keyError) {
      toast.error(keyError);
      return;
    }

    const input: McqQuestionInput = {
      questionText: values.questionText,
      questionType: values.questionType,
      subjectId: values.subjectId ?? null,
      subjectName:
        subjects.find((s) => s.id === values.subjectId)?.name ?? null,
      chapter: values.chapter?.trim() || null,
      topic: values.topic?.trim() || null,
      difficulty: values.difficulty,
      marks: values.marks,
      negativeMarks: values.negativeMarks,
      options: cleanOptions,
      numericalAnswer,
      explanation: values.explanation?.trim() || null,
      imageUrl: values.imageUrl?.trim() || null,
      hasFormula: values.hasFormula,
    };

    try {
      if (isEdit && question) {
        await updateMut.mutateAsync({ id: question.id, input });
        toast.success("Question updated");
      } else {
        const created = await createMut.mutateAsync(input);
        toast.success("Question added to the bank");
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save question");
    }
  });

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Question" : "New Bank Question"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Type + difficulty */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Question Type">
              <select
                value={questionType}
                onChange={(e) => changeType(e.target.value as McqQuestionType)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                {MCQ_QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Difficulty">
              <Select {...form.register("difficulty")}>
                {MCQ_DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Stem */}
          <Field
            label="Question Text *"
            error={form.formState.errors.questionText?.message}
          >
            <textarea
              rows={3}
              placeholder="Type the question stem…"
              {...form.register("questionText")}
              onBlur={(e) => checkDuplicates(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
            />
            {dupCount > 0 && (
              <p className="text-[11px] text-amber-600">
                ⚠ {dupCount} similar question{dupCount > 1 ? "s" : ""} already in
                the bank — possible duplicate.
              </p>
            )}
          </Field>

          {/* Subject / chapter / topic */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Subject">
              <Select {...form.register("subjectId")}>
                <option value="">— Select —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Chapter">
              <Input placeholder="e.g. Thermodynamics" {...form.register("chapter")} />
            </Field>
            <Field label="Topic">
              <Input placeholder="e.g. First Law" {...form.register("topic")} />
            </Field>
          </div>

          {/* Marks */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Marks *" error={form.formState.errors.marks?.message}>
              <Input type="number" step="0.5" {...form.register("marks")} />
            </Field>
            <Field label="Negative Marks">
              <Input type="number" step="0.25" {...form.register("negativeMarks")} />
            </Field>
            <Field label="Formula content">
              <label className="flex items-center gap-2 h-9 text-xs text-foreground">
                <input type="checkbox" {...form.register("hasFormula")} />
                <Sigma className="w-3.5 h-3.5" /> Has formulae
              </label>
            </Field>
          </div>

          {/* Question image */}
          <Field label="Question Image URL (optional)">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
              <Input placeholder="https://…" {...form.register("imageUrl")} />
            </div>
          </Field>

          {/* Answer key */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Answer Key
            </p>

            {isNumerical ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Correct Value *">
                  <Input
                    type="number"
                    step="any"
                    value={numValue}
                    onChange={(e) => setNumValue(e.target.value)}
                    placeholder="e.g. 9.8"
                  />
                </Field>
                <Field label="Tolerance (±)">
                  <Input
                    type="number"
                    step="any"
                    value={numTolerance}
                    onChange={(e) => setNumTolerance(e.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <input
                      type={isMultiple ? "checkbox" : "radio"}
                      checked={opt.isCorrect}
                      onChange={() => setCorrect(opt.id)}
                      title="Mark correct"
                    />
                    <span className="text-xs font-medium text-muted-foreground w-4">
                      {letter(i)}
                    </span>
                    <Input
                      value={opt.text}
                      onChange={(e) => patchOption(opt.id, { text: e.target.value })}
                      placeholder={`Option ${letter(i)}`}
                      disabled={questionType === "true_false"}
                      className="flex-1 h-8"
                    />
                    <Input
                      value={opt.imageUrl ?? ""}
                      onChange={(e) =>
                        patchOption(opt.id, { imageUrl: e.target.value })
                      }
                      placeholder="Image URL"
                      className="w-28 h-8 text-xs"
                    />
                    {questionType !== "true_false" && options.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setOptions((o) => o.filter((x) => x.id !== opt.id))
                        }
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {questionType !== "true_false" && options.length < 6 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setOptions((o) => [...o, blankOption()])}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add option
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {isMultiple
                    ? "Tick every correct option."
                    : "Select the single correct option."}
                </p>
              </div>
            )}
          </div>

          {/* Explanation */}
          <Field label="Explanation (shown after the exam)">
            <textarea
              rows={2}
              placeholder="Why is the answer correct…"
              {...form.register("explanation")}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {isEdit ? "Save Question" : "Add to Bank"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ── Small form primitives ────────────────────────────────────────────────────
const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1">
    <label className="text-xs font-medium text-foreground">{label}</label>
    {children}
    {error && <p className="text-[11px] text-destructive">{error}</p>}
  </div>
);

const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ children, ...props }, ref) => (
  <select
    ref={ref}
    {...props}
    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
  >
    {children}
  </select>
));
Select.displayName = "Select";
