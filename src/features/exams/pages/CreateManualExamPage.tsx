import { forwardRef, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Paperclip, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCanDo } from "@/features/rbac";
import { examFormSchema, type ExamFormValues } from "../schemas/exam.schema";
import { useCreateExam, useExam, useExamLookups, useUpdateExam } from "../hooks";
import { DEFAULT_GRADE_SCHEME } from "../utils";
import { EXAM_TYPES, type ExamAttachment, type ExamInput } from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Create / Edit Manual Exam. One page serves both — an :id param switches it
// into edit mode (prefilled from the exam). Data + persistence go through the
// exam hooks; the page owns only form state.
// ─────────────────────────────────────────────────────────────────────────────
const CreateManualExamPage = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { canDo } = useCanDo();

  const isEdit = !!id;
  const base = `/${pathname.split("/")[1]}`;  // e.g. "/admin", "/management", "/coordinator"
  const managePath = `${base}/exams/manual`;

  const { data: lookups } = useExamLookups();
  const { data: existing } = useExam(id ?? null);
  const createMut = useCreateExam();
  const updateMut = useUpdateExam();

  const standards = lookups?.standards ?? [];
  const subjects = lookups?.subjects ?? [];
  const batches = lookups?.batches ?? [];

  const [attachments, setAttachments] = useState<ExamAttachment[]>([]);
  const [attName, setAttName] = useState("");
  const [attUrl, setAttUrl] = useState("");

  const form = useForm<ExamFormValues>({
    resolver: zodResolver(examFormSchema),
    defaultValues: {
      title: "",
      examType: "unit_test",
      totalMarks: 100,
      passMarks: 35,
      durationMinutes: 60,
      instructions: "",
      examDate: "",
      startTime: "",
      endTime: "",
      hall: "",
    },
  });

  // Prefill in edit mode once the exam loads.
  useEffect(() => {
    if (!existing) return;
    form.reset({
      title: existing.title,
      examType: existing.examType,
      standardId: existing.standardId,
      batchId: existing.batchId,
      subjectId: existing.subjectId,
      totalMarks: existing.totalMarks,
      passMarks: existing.passMarks,
      durationMinutes: existing.durationMinutes,
      instructions: existing.instructions ?? "",
      examDate: existing.examDate ?? "",
      startTime: existing.startTime ?? "",
      endTime: existing.endTime ?? "",
      hall: existing.hall ?? "",
    });
    setAttachments(existing.attachments ?? []);
  }, [existing, form]);

  const permitted = isEdit ? canDo("exam.edit") : canDo("exam.create");

  const addAttachment = () => {
    if (!attName.trim() || !attUrl.trim()) return;
    setAttachments((a) => [...a, { name: attName.trim(), url: attUrl.trim() }]);
    setAttName("");
    setAttUrl("");
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const input: ExamInput = {
      title: values.title,
      examType: values.examType,
      mode: "manual",
      standardId: values.standardId ?? null,
      standardName: standards.find((s) => s.id === values.standardId)?.name ?? null,
      batchId: values.batchId ?? null,
      batchName: batches.find((b) => b.id === values.batchId)?.name ?? null,
      subjectId: values.subjectId ?? null,
      subjectName: subjects.find((s) => s.id === values.subjectId)?.name ?? null,
      totalMarks: values.totalMarks,
      passMarks: values.passMarks,
      durationMinutes: values.durationMinutes,
      instructions: values.instructions || null,
      examDate: values.examDate || null,
      startTime: values.startTime || null,
      endTime: values.endTime || null,
      hall: values.hall || null,
      attachments,
      gradingScheme: [], // empty → institute default scheme
    };
    try {
      if (isEdit && id) {
        await updateMut.mutateAsync({ id, input });
        toast.success("Exam updated");
      } else {
        await createMut.mutateAsync(input);
        toast.success("Manual exam created");
      }
      navigate(managePath);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save exam");
    }
  });

  const saving = createMut.isPending || updateMut.isPending;

  if (!permitted) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        You do not have permission to {isEdit ? "edit" : "create"} exams.
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            {isEdit ? "Edit Manual Exam" : "Create Manual Exam"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Define the exam, schedule and grading. Marks are entered after.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(managePath)}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back
        </Button>
      </header>

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Basics */}
        <section className="rounded-lg border border-border/60 bg-card/60 p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Exam Details
          </p>
          <Field label="Exam Title *" error={form.formState.errors.title?.message}>
            <Input placeholder="e.g. Unit Test 1 — Mathematics" {...form.register("title")} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Exam Type">
              <Select {...form.register("examType")}>
                {EXAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subject">
              <Select {...form.register("subjectId")}>
                <option value="">— Select subject —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Standard">
              <Select {...form.register("standardId")}>
                <option value="">— Select standard —</option>
                {standards.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Batch">
              <Select {...form.register("batchId")}>
                <option value="">— Select batch —</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </section>

        {/* Marks + schedule */}
        <section className="rounded-lg border border-border/60 bg-card/60 p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Marks & Schedule
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Total Marks *" error={form.formState.errors.totalMarks?.message}>
              <Input type="number" {...form.register("totalMarks")} />
            </Field>
            <Field label="Pass Marks *" error={form.formState.errors.passMarks?.message}>
              <Input type="number" {...form.register("passMarks")} />
            </Field>
            <Field label="Duration (min)">
              <Input type="number" {...form.register("durationMinutes")} />
            </Field>
            <Field label="Exam Date">
              <Input type="date" {...form.register("examDate")} />
            </Field>
            <Field label="Start Time">
              <Input type="time" {...form.register("startTime")} />
            </Field>
            <Field label="End Time">
              <Input type="time" {...form.register("endTime")} />
            </Field>
          </div>
          <Field label="Hall / Room Allocation">
            <Input placeholder="e.g. Hall A / Room 204" {...form.register("hall")} />
          </Field>
        </section>

        {/* Instructions + grading */}
        <section className="rounded-lg border border-border/60 bg-card/60 p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Instructions & Grading
          </p>
          <Field label="Instructions">
            <textarea
              rows={3}
              placeholder="Exam-day instructions for students…"
              {...form.register("instructions")}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
            />
          </Field>
          <div className="rounded-md bg-muted/30 border border-border/50 p-3">
            <p className="text-xs font-medium text-foreground mb-1.5">
              Grading scheme — institute default
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_GRADE_SCHEME.map((b) => (
                <span
                  key={b.grade}
                  className="text-[11px] px-1.5 py-0.5 rounded border border-border/60 bg-background"
                >
                  {b.grade}: {b.minPct}–{b.maxPct}%
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Attachments */}
        <section className="rounded-lg border border-border/60 bg-card/60 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Attachments
          </p>
          {attachments.length > 0 && (
            <ul className="space-y-1">
              {attachments.map((a, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-sm bg-muted/30 rounded px-2 py-1"
                >
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline truncate"
                  >
                    {a.name}
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((arr) => arr.filter((_, j) => j !== i))
                    }
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Label"
              value={attName}
              onChange={(e) => setAttName(e.target.value)}
              className="w-40"
            />
            <Input
              placeholder="https://…"
              value={attUrl}
              onChange={(e) => setAttUrl(e.target.value)}
              className="flex-1"
            />
            <Button type="button" variant="outline" onClick={addAttachment}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </section>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Exam"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(managePath)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
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

// forwardRef so react-hook-form's `register` can attach to the native select.
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

export default CreateManualExamPage;
