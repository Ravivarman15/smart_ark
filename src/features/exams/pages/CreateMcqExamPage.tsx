import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useCanDo } from "@/features/rbac";
import {
  mcqExamFormSchema,
  type McqExamFormValues,
} from "../schemas/mcqExam.schema";
import {
  useCreateMcqExam,
  useExamLookups,
  useMcqExam,
  useMcqPapers,
  useUpdateMcqExam,
} from "../hooks";
import { AssignmentSelector } from "../components/AssignmentSelector";
import { RESULT_RELEASE_OPTIONS } from "../types/mcqExam.types";
import type {
  AssignmentDraft,
  AssignmentScope,
  McqExamInput,
} from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// CreateMcqExamPage — create / edit form for an MCQ exam.
//
// Three sections: paper picker (the source of questions + totals), scalar
// config (timing, attempt limits, behaviour, result release), and a dynamic
// assignment builder (standard / batch / subject scopes — the live roster).
// The form schema enforces the cross-field rules; the service composes
// `exams` (mode=mcq) + `mcq_exams` + `mcq_exam_assignments` on save.
// ─────────────────────────────────────────────────────────────────────────────
const CreateMcqExamPage = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { canDo } = useCanDo();
  const isEdit = !!id;

  const base = `/${pathname.split("/")[1]}`;  // e.g. "/admin", "/management", "/coordinator"
  const managePath = `${base}/exams/mcq-exams`;

  const { data: lookups } = useExamLookups();
  const subjects = lookups?.subjects ?? [];
  const standards = lookups?.standards ?? [];
  const batches = lookups?.batches ?? [];

  const { data: papers = [] } = useMcqPapers({ status: "published" });
  const { data: existing } = useMcqExam(id ?? null);

  const createMut = useCreateMcqExam();
  const updateMut = useUpdateMcqExam();

  const [assignments, setAssignments] = useState<AssignmentDraft[]>([]);

  const form = useForm<McqExamFormValues>({
    resolver: zodResolver(mcqExamFormSchema),
    defaultValues: {
      title: "",
      paperId: "",
      durationMinutes: 60,
      attemptLimit: 1,
      shuffleQuestions: false,
      shuffleOptions: false,
      negativeMarking: false,
      passPercentage: 35,
      resultRelease: "immediate",
      allowResume: true,
    },
  });

  // Prefill in edit mode once the exam loads.
  useEffect(() => {
    if (!existing) return;
    form.reset({
      title: existing.title,
      paperId: existing.paperId ?? "",
      standardId: existing.standardId,
      batchId: existing.batchId,
      subjectId: existing.subjectId,
      examDate: existing.examDate ?? "",
      instructions: existing.instructions ?? "",
      durationMinutes: existing.durationMinutes,
      attemptLimit: existing.attemptLimit,
      shuffleQuestions: existing.shuffleQuestions,
      shuffleOptions: existing.shuffleOptions,
      negativeMarking: existing.negativeMarking,
      passPercentage: existing.passPercentage,
      windowStart: existing.windowStart ?? "",
      windowEnd: existing.windowEnd ?? "",
      resultRelease: existing.resultRelease,
      resultReleaseAt: existing.resultReleaseAt ?? "",
      allowResume: existing.allowResume,
    });
    setAssignments(
      existing.assignments.map((a) => ({
        scopeType: a.scopeType,
        scopeId: a.scopeId ?? "",
        scopeName: a.scopeName ?? "",
      })),
    );
  }, [existing, form]);

  const watchedPaperId = form.watch("paperId");
  const watchedRelease = form.watch("resultRelease");
  const selectedPaper = useMemo(
    () => papers.find((p) => p.id === watchedPaperId),
    [papers, watchedPaperId],
  );

  const permitted = isEdit
    ? canDo("exam.mcq.edit")
    : canDo("exam.mcq.create");

  if (!permitted) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        You do not have permission to {isEdit ? "edit" : "create"} MCQ exams.
      </div>
    );
  }

  const buildInput = (values: McqExamFormValues): McqExamInput => {
    const standardName = standards.find((s) => s.id === values.standardId)?.name;
    const batchName = batches.find((b) => b.id === values.batchId)?.name;
    const subjectName = subjects.find((s) => s.id === values.subjectId)?.name;
    return {
      title: values.title,
      paperId: values.paperId,
      standardId: values.standardId ?? null,
      standardName: standardName ?? null,
      batchId: values.batchId ?? null,
      batchName: batchName ?? null,
      subjectId: values.subjectId ?? null,
      subjectName: subjectName ?? null,
      examDate: values.examDate || null,
      instructions: values.instructions || null,
      durationMinutes: values.durationMinutes,
      attemptLimit: values.attemptLimit,
      shuffleQuestions: values.shuffleQuestions,
      shuffleOptions: values.shuffleOptions,
      negativeMarking: values.negativeMarking,
      passPercentage: values.passPercentage,
      windowStart: values.windowStart || null,
      windowEnd: values.windowEnd || null,
      resultRelease: values.resultRelease,
      resultReleaseAt: values.resultReleaseAt || null,
      allowResume: values.allowResume,
      assignments: assignments.filter((a) => a.scopeType === "all" || !!a.scopeId),
    };
  };

  const save = form.handleSubmit(async (values) => {
    try {
      if (isEdit && id) {
        await updateMut.mutateAsync({ id, input: buildInput(values) });
        toast.success("MCQ exam updated");
      } else {
        await createMut.mutateAsync(buildInput(values));
        toast.success("MCQ exam created");
      }
      navigate(managePath);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save exam");
    }
  });

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            {isEdit ? "Edit MCQ Exam" : "Create MCQ Exam"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Schedule a paper, set the engine behaviour and assign student
            cohorts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(managePath)}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            {isEdit ? "Save Exam" : "Create Exam"}
          </Button>
        </div>
      </header>

      <form onSubmit={save} className="space-y-5">
        {/* ── Basics + Paper picker ───────────────────────────────────────── */}
        <Section
          title="Basics"
          subtitle="Title, paper and tagging."
          icon={<FileText className="w-4 h-4" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Exam title</Label>
              <Input
                {...form.register("title")}
                placeholder="e.g. Class 12 Physics — JEE Mock #3"
              />
              {form.formState.errors.title && (
                <p className="text-[11px] text-rose-600 mt-1">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">MCQ paper</Label>
              <select
                {...form.register("paperId")}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Select a published MCQ paper</option>
                {papers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} — {p.totalQuestions} q · {p.totalMarks} marks
                  </option>
                ))}
              </select>
              {form.formState.errors.paperId && (
                <p className="text-[11px] text-rose-600 mt-1">
                  {form.formState.errors.paperId.message}
                </p>
              )}
              {selectedPaper && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {selectedPaper.totalQuestions} questions ·{" "}
                  {selectedPaper.totalMarks} marks ·{" "}
                  {selectedPaper.durationMinutes} min recommended
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Standard</Label>
              <select
                {...form.register("standardId")}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {standards.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Subject</Label>
              <select
                {...form.register("subjectId")}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Primary batch (optional)</Label>
              <select
                {...form.register("batchId")}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Exam date</Label>
              <Input type="date" {...form.register("examDate")} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Instructions to students</Label>
              <Textarea
                {...form.register("instructions")}
                placeholder="e.g. Use a single device. No external help. Marks for unattempted = 0."
                rows={3}
              />
            </div>
          </div>
        </Section>

        {/* ── Engine config ───────────────────────────────────────────────── */}
        <Section
          title="Engine configuration"
          subtitle="Duration, attempts, shuffling and pass criteria."
          icon={<FileText className="w-4 h-4" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Duration (minutes)</Label>
              <Input
                type="number"
                min={1}
                {...form.register("durationMinutes", { valueAsNumber: true })}
              />
            </div>
            <div>
              <Label className="text-xs">Attempts allowed</Label>
              <Input
                type="number"
                min={1}
                max={10}
                {...form.register("attemptLimit", { valueAsNumber: true })}
              />
            </div>
            <div>
              <Label className="text-xs">Pass percentage</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="any"
                {...form.register("passPercentage", { valueAsNumber: true })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <ToggleRow
              label="Shuffle questions per attempt"
              hint="Each attempt gets a deterministic, frozen order."
              checked={form.watch("shuffleQuestions")}
              onCheckedChange={(v) =>
                form.setValue("shuffleQuestions", v, { shouldDirty: true })
              }
            />
            <ToggleRow
              label="Shuffle options per question"
              hint="Per-question option ordering varies between students."
              checked={form.watch("shuffleOptions")}
              onCheckedChange={(v) =>
                form.setValue("shuffleOptions", v, { shouldDirty: true })
              }
            />
            <ToggleRow
              label="Negative marking"
              hint="Wrong choice answers cost the question's negative marks."
              checked={form.watch("negativeMarking")}
              onCheckedChange={(v) =>
                form.setValue("negativeMarking", v, { shouldDirty: true })
              }
            />
            <ToggleRow
              label="Allow resume on reconnect"
              hint="Students can reload and continue if they disconnect."
              checked={form.watch("allowResume")}
              onCheckedChange={(v) =>
                form.setValue("allowResume", v, { shouldDirty: true })
              }
            />
          </div>
        </Section>

        {/* ── Window + Result release ─────────────────────────────────────── */}
        <Section
          title="Exam window & result release"
          subtitle="When students may attempt and when their results unlock."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Window start</Label>
              <Input type="datetime-local" {...form.register("windowStart")} />
            </div>
            <div>
              <Label className="text-xs">Window end</Label>
              <Input type="datetime-local" {...form.register("windowEnd")} />
              {form.formState.errors.windowEnd && (
                <p className="text-[11px] text-rose-600 mt-1">
                  {form.formState.errors.windowEnd.message}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Result release</Label>
              <select
                {...form.register("resultRelease")}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                {RESULT_RELEASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {watchedRelease === "scheduled" && (
              <div>
                <Label className="text-xs">Release at</Label>
                <Input
                  type="datetime-local"
                  {...form.register("resultReleaseAt")}
                />
                {form.formState.errors.resultReleaseAt && (
                  <p className="text-[11px] text-rose-600 mt-1">
                    {form.formState.errors.resultReleaseAt.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </Section>

        {/* ── Who gets this test ──────────────────────────────────────────── */}
        <Section
          title="Who gets this test"
          subtitle="Everyone, whole classes, batches, or named students — in any combination."
          icon={<Users className="w-4 h-4" />}
        >
          {/* Replaced a list of scope-type/scope-id dropdown pairs. That UI
              could express the same selection, but it could not answer the one
              question that matters before publishing — HOW MANY STUDENTS IS
              THIS? — so a test assigned to an empty class looked identical to
              one assigned to two hundred people. */}
          <AssignmentSelector value={assignments} onChange={setAssignments} />
        </Section>
      </form>
    </div>
  );
};

const Section = ({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="rounded-xl border border-border/60 bg-card/40 p-4">
    <header className="mb-3">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        {icon}
        {title}
      </h2>
      {subtitle && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
    </header>
    {children}
  </section>
);

const ToggleRow = ({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) => (
  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/60 px-3 py-2">
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

export default CreateMcqExamPage;
