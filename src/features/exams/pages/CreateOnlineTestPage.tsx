import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, FileText, Loader2, Rocket, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac";
import { TestWizardStepper, type WizardStep } from "../components/TestWizardStepper";
import { QuestionSourcePicker } from "../components/QuestionSourcePicker";
import { QuestionReviewWorkspace } from "../components/QuestionReviewWorkspace";
import { AssignmentSelector } from "../components/AssignmentSelector";
import { mcqImportService } from "../services/mcqImport.service";
import { mcqQuestionService } from "../services/mcqQuestion.service";
import { mcqPaperService } from "../services/mcqPaper.service";
import { mcqExamService } from "../services/mcqExam.service";
import {
  blockingReason,
  reviewQuestion,
  summariseReview,
} from "../utils/reviewStatus";
import { describeTargeting, summarise } from "../utils/assignmentTargeting";
import { useStudentRoster } from "../hooks/useStudentRoster";
import type { ParsedQuestion } from "../utils/paperParser";
import type { AssignmentDraft } from "../types/mcqExam.types";
import type { McqQuestionInput, PaperQuestionDraft } from "../types/mcq.types";

const STEPS: WizardStep[] = [
  { id: "source", label: "Add questions", hint: "Upload, paste, or write them" },
  { id: "review", label: "Review", hint: "Check what we read" },
  { id: "assign", label: "Who gets it", hint: "Classes, batches or students" },
  { id: "publish", label: "Publish", hint: "Set timing & title" },
];

const CreateOnlineTestPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canDo } = useCanDo();
  const base = `/${user?.role ?? "teacher"}`;

  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([]);
  const [importing, setImporting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Test metadata & publishing config
  const [testTitle, setTestTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [instructions, setInstructions] = useState("");
  const [passPercentage, setPassPercentage] = useState(40);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [allowResume, setAllowResume] = useState(true);
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");

  const { data: roster = [] } = useStudentRoster();

  const review = useMemo(
    () =>
      summariseReview(
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
      ),
    [questions],
  );

  const targeting = useMemo(
    () => summarise(assignments, roster),
    [assignments, roster],
  );

  const totalMarks = useMemo(
    () => questions.reduce((sum, q) => sum + (q.marks && q.marks > 0 ? q.marks : 1), 0),
    [questions],
  );

  const goTo = (i: number) => {
    setStep(i);
    setFurthest((f) => Math.max(f, i));
  };

  const acceptQuestions = (parsed: ParsedQuestion[]) => {
    setQuestions((prev) => [...prev, ...parsed]);
    if (!testTitle) {
      setTestTitle(`Online Test - ${new Date().toLocaleDateString()}`);
    }
    setDurationMinutes(Math.max(15, Math.ceil(parsed.length * 1.5)));
    toast.success(
      `${parsed.length} question${parsed.length === 1 ? "" : "s"} read. Check them before publishing.`,
    );
    goTo(1);
  };

  const acceptSheet = async (csv: string) => {
    setImporting(true);
    try {
      const report = await mcqImportService.analyze(csv);
      const usable = report.rows.filter((r) => r.question && r.errors.length === 0);

      if (usable.length === 0) {
        toast.error(
          "None of those rows could be read as questions. Check the column mapping.",
        );
        return;
      }
      if (usable.length < report.total) {
        toast.warning(
          `${report.total - usable.length} of ${report.total} rows had problems and were left out.`,
        );
      }

      const imported = usable.map((r) => {
        const q = r.question!;
        return {
          questionNo: String(r.rowNumber),
          section: "",
          questionText: q.questionText,
          questionType: q.questionType,
          marks: q.marks,
          negativeMarks: q.negativeMarks,
          chapter: q.chapter ?? "",
          topic: q.topic ?? "",
          difficulty: q.difficulty,
          bloomLevel: "understand",
          tags: [],
          options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
          numericalAnswer: q.numericalAnswer?.value,
          numericalTolerance: q.numericalAnswer?.tolerance,
          answerText: q.answerText ?? "",
          matchPairs: q.matchPairs ?? [],
          subQuestions: [],
          explanation: q.explanation ?? "",
          hasFormula: !!q.hasFormula,
          confidence: 100,
          sourceText: "",
        } as ParsedQuestion;
      });

      setQuestions((prev) => [...prev, ...imported]);
      if (!testTitle) {
        setTestTitle(`Online Test - ${new Date().toLocaleDateString()}`);
      }
      setDurationMinutes(Math.max(15, Math.ceil(imported.length * 1.5)));
      goTo(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setImporting(false);
    }
  };

  const handlePublish = async () => {
    const finalTitle = testTitle.trim() || `Online Test - ${new Date().toLocaleDateString()}`;
    if (questions.length === 0) {
      toast.error("Add at least one question before publishing.");
      return;
    }
    if (blocked) {
      toast.error(blocked);
      return;
    }

    setPublishing(true);
    try {
      const owner = {
        ownerId: user?.profileId ?? undefined,
        ownerName: user?.name,
        campusId: user?.campusId,
      };

      // 1. Create questions in the bank
      const questionInputs: McqQuestionInput[] = questions.map((q) => ({
        questionText: q.questionText,
        questionType: q.questionType,
        marks: q.marks && q.marks > 0 ? q.marks : 1,
        negativeMarks: q.negativeMarks ?? 0,
        difficulty: q.difficulty ?? "medium",
        bloomLevel: q.bloomLevel ?? "understand",
        chapter: q.chapter || undefined,
        topic: q.topic || undefined,
        options: (q.options ?? []).map((o) => ({ text: o.text, isCorrect: !!o.isCorrect })),
        numericalAnswer:
          q.numericalAnswer != null
            ? { value: q.numericalAnswer, tolerance: q.numericalTolerance ?? 0 }
            : null,
        answerText: q.answerText ?? "",
        matchPairs: q.matchPairs ?? [],
        explanation: q.explanation ?? "",
        tags: q.tags ?? [],
        status: "published",
      }));

      const questionIds = await mcqQuestionService.createMany(questionInputs, owner);

      // 2. Create the MCQ paper
      const paper = await mcqPaperService.create(
        {
          title: finalTitle,
          instructions: instructions.trim() || null,
          durationMinutes: Number(durationMinutes) || 30,
          negativeMarking: questions.some((q) => (q.negativeMarks ?? 0) > 0),
          setCount: 1,
          randomize: shuffleQuestions,
          generationMode: "manual",
          status: "published",
        },
        owner,
      );

      // 3. Attach questions to the paper
      const drafts: PaperQuestionDraft[] = questionIds.map((questionId, i) => ({
        questionId,
        sortOrder: i,
        setLabel: "A",
      }));

      await mcqPaperService.saveQuestions(paper.id, drafts, {
        actorId: owner.ownerId,
        actorName: owner.ownerName,
      });

      // 4. Create the online exam
      await mcqExamService.create(
        {
          title: finalTitle,
          paperId: paper.id,
          durationMinutes: Number(durationMinutes) || 30,
          instructions: instructions.trim() || null,
          attemptLimit: 1,
          shuffleQuestions,
          shuffleOptions,
          negativeMarking: questions.some((q) => (q.negativeMarks ?? 0) > 0),
          passPercentage: Number(passPercentage) || 40,
          windowStart: windowStart || null,
          windowEnd: windowEnd || null,
          resultRelease: "immediate",
          allowResume,
          assignments,
        },
        user?.profileId ?? undefined,
      );

      toast.success(`Online test "${finalTitle}" published successfully!`);
      navigate(`${base}/exams/online-tests`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish online test.");
    } finally {
      setPublishing(false);
    }
  };

  if (!canDo("exam.mcq.create")) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        You do not have permission to create online tests.
      </div>
    );
  }

  const blocked = blockingReason(review);
  const canLeaveReview = questions.length > 0 && !blocked;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Create an online test</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bring the questions in, check them, choose who sits it.
        </p>
      </header>

      <div className="mb-6">
        <TestWizardStepper
          steps={STEPS}
          current={step}
          furthest={furthest}
          onJump={goTo}
        />
      </div>

      {/* ── 1. Where the questions come from ─────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4">
          {importing && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking the rows…
            </p>
          )}
          <QuestionSourcePicker
            onParsed={acceptQuestions}
            onSheetMapped={acceptSheet}
            onPickBank={() => navigate(`${base}/exams/mcq-papers/create`)}
            onWriteManually={() => navigate(`${base}/exams/mcq-papers/create`)}
          />
          {questions.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => goTo(1)}>
                Review {questions.length} question
                {questions.length === 1 ? "" : "s"}
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── 2. Review, with the student's view beside it ─────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <QuestionReviewWorkspace
            questions={questions}
            onChange={setQuestions}
            testTitle={testTitle || "Online test"}
          />
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Add more
            </Button>
            <Button size="sm" disabled={!canLeaveReview} onClick={() => goTo(2)}>
              Choose who gets it
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── 3. Who gets it ───────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <AssignmentSelector value={assignments} onChange={setAssignments} />
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to questions
            </Button>
            <Button size="sm" onClick={() => goTo(3)}>
              Configure and publish
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── 4. Publish ───────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Summary Overview Cards */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border/70 bg-card p-4 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Questions</p>
                <p className="text-lg font-semibold text-foreground mt-0.5">
                  {questions.length} ({totalMarks} marks)
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-4 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Audience</p>
                <p className="text-sm font-semibold text-foreground mt-0.5 truncate max-w-[200px]">
                  {describeTargeting(targeting)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-4 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-accent/10 text-accent">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Ready to publish
                </p>
              </div>
            </div>
          </div>

          {/* Test Details Form */}
          <div className="rounded-xl border border-border/70 bg-card p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Test Details</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set the name and timing for your test.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="testTitle" className="text-xs font-medium">
                  Test Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="testTitle"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  placeholder="e.g. Physics Chapter 3 Assessment"
                  className="mt-1.5"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="duration" className="text-xs font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Duration (minutes)
                  </Label>
                  <Input
                    id="duration"
                    type="number"
                    min="1"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value) || 1)}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="passPercent" className="text-xs font-medium">
                    Passing percentage (%)
                  </Label>
                  <Input
                    id="passPercent"
                    type="number"
                    min="0"
                    max="100"
                    value={passPercentage}
                    onChange={(e) => setPassPercentage(Number(e.target.value) || 0)}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="windowStart" className="text-xs font-medium">
                    Available from (Optional)
                  </Label>
                  <Input
                    id="windowStart"
                    type="datetime-local"
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="windowEnd" className="text-xs font-medium">
                    Available until (Optional)
                  </Label>
                  <Input
                    id="windowEnd"
                    type="datetime-local"
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="instructions" className="text-xs font-medium">
                  Student Instructions (Optional)
                </Label>
                <Textarea
                  id="instructions"
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Read each question carefully. No negative marking."
                  className="mt-1.5"
                />
              </div>
            </div>

            {/* Test Preferences */}
            <div className="border-t border-border pt-5 space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" /> Test Options
              </h3>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium cursor-pointer">Shuffle Questions</Label>
                    <p className="text-[11px] text-muted-foreground">Random order for each student</p>
                  </div>
                  <Switch
                    checked={shuffleQuestions}
                    onCheckedChange={setShuffleQuestions}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium cursor-pointer">Shuffle Options</Label>
                    <p className="text-[11px] text-muted-foreground">Randomize choice positions</p>
                  </div>
                  <Switch
                    checked={shuffleOptions}
                    onCheckedChange={setShuffleOptions}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium cursor-pointer">Allow Resume</Label>
                    <p className="text-[11px] text-muted-foreground">Resume if disconnected</p>
                  </div>
                  <Switch
                    checked={allowResume}
                    onCheckedChange={setAllowResume}
                  />
                </div>
              </div>
            </div>
          </div>

          {blocked && (
            <p className="text-sm text-destructive">{blocked}</p>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)} disabled={publishing}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <Button
              size="lg"
              className="gap-2 px-6"
              onClick={handlePublish}
              disabled={publishing || !testTitle.trim() || !!blocked}
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Publishing online test...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" /> Publish Online Test
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateOnlineTestPage;
