import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac";
import { TestWizardStepper, type WizardStep } from "../components/TestWizardStepper";
import { QuestionSourcePicker } from "../components/QuestionSourcePicker";
import { QuestionReviewWorkspace } from "../components/QuestionReviewWorkspace";
import { AssignmentSelector } from "../components/AssignmentSelector";
import { mcqImportService } from "../services/mcqImport.service";
import {
  blockingReason,
  reviewQuestion,
  summariseReview,
} from "../utils/reviewStatus";
import { describeTargeting, summarise } from "../utils/assignmentTargeting";
import { useStudentRoster } from "../hooks/useStudentRoster";
import type { ParsedQuestion } from "../utils/paperParser";
import type { AssignmentDraft } from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// CREATE ONLINE TEST — the wizard
//
// ┌── WHAT THIS IS AND IS NOT ─────────────────────────────────────────────┐
// │ It sequences work that already exists: the question sources (Phase F), │
// │ the review workspace and live preview (Phase G), and the assignment    │
// │ selector (Phase D). It builds nothing new of its own, and it must not  │
// │ — a wizard that reimplements a step is a second place for that step to │
// │ be wrong.                                                              │
// │                                                                        │
// │ Its one real job is ORDER: you cannot assign a test that has no        │
// │ questions, and you cannot publish one whose answers are missing. The   │
// │ stepper makes that visible instead of discovering it at Publish.       │
// └────────────────────────────────────────────────────────────────────────┘
//
// SCOPE, said plainly: this screen carries questions to the point of review and
// assignment. Persisting the paper and creating the exam row still happen in
// Create MCQ Paper / Create MCQ Exam, which already do it correctly; wiring the
// final write is the remaining piece and is marked as such at the last step
// rather than faked with a button that appears to work.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  { id: "source", label: "Add questions", hint: "Upload, paste, or write them" },
  { id: "review", label: "Review", hint: "Check what we read" },
  { id: "assign", label: "Who gets it", hint: "Classes, batches or students" },
  { id: "publish", label: "Publish" },
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

  const goTo = (i: number) => {
    setStep(i);
    setFurthest((f) => Math.max(f, i));
  };

  const acceptQuestions = (parsed: ParsedQuestion[]) => {
    setQuestions((prev) => [...prev, ...parsed]);
    toast.success(
      `${parsed.length} question${parsed.length === 1 ? "" : "s"} read. Check them before publishing.`,
    );
    goTo(1);
  };

  /**
   * A mapped spreadsheet goes through the EXISTING bulk importer, which does
   * duplicate detection against the live bank and per-row validation. Only the
   * rows it accepted become questions; the ones it rejected are reported with
   * their reasons rather than silently dropped.
   */
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

      setQuestions((prev) => [
        ...prev,
        ...usable.map((r) => {
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
            // A spreadsheet states its answer rather than being read out of
            // prose, so there is nothing for the parser to be unsure ABOUT.
            // reviewStatus still checks the key is usable.
            confidence: 100,
            sourceText: "",
          } as ParsedQuestion;
        }),
      ]);
      goTo(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setImporting(false);
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
            testTitle="Online test"
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
              Review and publish
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── 4. Publish ───────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/70 p-5 space-y-3">
            <Row label="Questions" value={`${review.total}`} />
            <Row
              label="Ready to mark automatically"
              value={`${review.ready + review.needsReview}`}
            />
            {review.needsReview > 0 && (
              <Row
                label="Flagged for a look"
                value={`${review.needsReview}`}
                tone="text-amber-600 dark:text-amber-400"
              />
            )}
            <Row label="Audience" value={describeTargeting(targeting)} />
          </div>

          {blocked && (
            <p className="text-sm text-destructive">{blocked}</p>
          )}

          {/* Said plainly rather than shipped as a button that appears to work.
              The paper and exam rows are still created by Create MCQ Paper /
              Create MCQ Exam, which already do it correctly. */}
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-sm font-medium text-foreground">
              Saving from this screen is not wired up yet
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              These {review.total} question{review.total === 1 ? "" : "s"} and the
              audience above are held in this page only. Creating the paper and
              the exam still happens in Create MCQ Paper and Create MCQ Exam,
              which are unchanged and work. Leaving now loses this draft.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`${base}/exams/mcq-papers/create`)}
              >
                Open Create MCQ Paper
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate(`${base}/exams/online-tests`)}
              >
                Back to Online Tests
              </Button>
            </div>
          </div>

          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <Button size="sm" disabled title="Not wired up yet">
              <Rocket className="w-4 h-4 mr-1.5" /> Publish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const Row = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className={tone ?? "text-foreground font-medium"}>{value}</span>
  </div>
);

export default CreateOnlineTestPage;
