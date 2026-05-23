import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Loader2,
  Maximize,
  Send,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExamTimer } from "./ExamTimer";
import { ExamQuestionView } from "./ExamQuestionView";
import { ExamPalette } from "./ExamPalette";
import { useAntiCheat, useAutosaveAttempt, useSubmitAttempt } from "../hooks";
import { mcqAttemptService } from "../services";
import { seededShuffle } from "../utils";
import type { AnswerDraft, AttemptSession } from "../types/mcqExam.types";

interface Props {
  session: AttemptSession;
  onFinished: (attemptId: string) => void;
}

const isAnswered = (d?: AnswerDraft): boolean =>
  !!d &&
  ((d.selectedOptionIds?.length ?? 0) > 0 ||
    (d.numericValue != null && Number.isFinite(d.numericValue)));

// ─────────────────────────────────────────────────────────────────────────────
// ExamRunner — the full-screen student exam engine.
//
// Owns the live attempt: timer + auto-submit, periodic autosave (answer
// persistence + heartbeat), question navigation, mark-for-review, keyboard
// shortcuts, anti-cheat surveillance and the pre-submit review. Scoring is NOT
// done here — submit hands off to the centralised scoring layer via the
// attempt service. Resilient to reload: the timer is anchored to the attempt's
// started_at, so a refresh resumes with the correct remaining time.
// ─────────────────────────────────────────────────────────────────────────────
export const ExamRunner = ({ session, onFinished }: Props) => {
  const { exam, attempt, questions } = session;

  // Freeze the (optionally option-shuffled) question set for this attempt.
  const displayQuestions = useMemo(() => {
    if (!exam.shuffleOptions) return questions;
    return questions.map((q, i) => ({
      ...q,
      options: seededShuffle(q.options, attempt.shuffleSeed + i + 1),
    }));
  }, [questions, exam.shuffleOptions, attempt.shuffleSeed]);

  // Answer drafts keyed by question id, seeded from any saved answers.
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>(() => {
    const seed: Record<string, AnswerDraft> = {};
    for (const a of session.answers) {
      seed[a.questionId] = {
        questionId: a.questionId,
        selectedOptionIds: a.selectedOptionIds ?? [],
        numericValue: a.numericValue ?? null,
        markedForReview: a.markedForReview,
        timeSpentSeconds: a.timeSpentSeconds ?? 0,
      };
    }
    return seed;
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const autosave = useAutosaveAttempt();
  const submitMut = useSubmitAttempt();

  const startedMs = useMemo(
    () => new Date(attempt.startedAt).getTime(),
    [attempt.startedAt],
  );
  const deadlineMs = startedMs + exam.durationMinutes * 60_000;
  const enteredAt = useRef(Date.now());
  const submittedRef = useRef(false);

  const elapsedSeconds = () =>
    Math.max(0, Math.floor((Date.now() - startedMs) / 1000));

  // ── Per-question time accounting ────────────────────────────────────────────
  const flushQuestionTime = useCallback(() => {
    const q = displayQuestions[currentIndex];
    if (!q) return;
    const delta = Math.floor((Date.now() - enteredAt.current) / 1000);
    enteredAt.current = Date.now();
    if (delta <= 0) return;
    setAnswers((prev) => {
      const d = prev[q.id] ?? {
        questionId: q.id,
        selectedOptionIds: [],
        numericValue: null,
        markedForReview: false,
        timeSpentSeconds: 0,
      };
      return {
        ...prev,
        [q.id]: { ...d, timeSpentSeconds: d.timeSpentSeconds + delta },
      };
    });
  }, [currentIndex, displayQuestions]);

  // ── Answer + navigation ─────────────────────────────────────────────────────
  const patchAnswer = (questionId: string, patch: Partial<AnswerDraft>) => {
    setAnswers((prev) => {
      const d = prev[questionId] ?? {
        questionId,
        selectedOptionIds: [],
        numericValue: null,
        markedForReview: false,
        timeSpentSeconds: 0,
      };
      return { ...prev, [questionId]: { ...d, ...patch } };
    });
  };

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= displayQuestions.length) return;
      flushQuestionTime();
      setCurrentIndex(index);
      setPaletteOpen(false);
    },
    [displayQuestions.length, flushQuestionTime],
  );

  // ── Autosave (answer persistence) ──────────────────────────────────────────
  const persist = useCallback(async () => {
    if (submittedRef.current) return;
    flushQuestionTime();
    const drafts = Object.values(answers);
    try {
      await autosave.mutateAsync({
        attemptId: attempt.id,
        drafts,
        timeSpentSeconds: elapsedSeconds(),
      });
    } catch {
      /* offline — the next tick retries */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, attempt.id, flushQuestionTime]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const doSubmit = useCallback(
    async (kind: "submit" | "auto_submit") => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      flushQuestionTime();
      try {
        await autosave.mutateAsync({
          attemptId: attempt.id,
          drafts: Object.values(answers),
          timeSpentSeconds: elapsedSeconds(),
        });
        const result = await submitMut.mutateAsync({
          attemptId: attempt.id,
          kind,
          timeSpentSeconds: elapsedSeconds(),
        });
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => undefined);
        }
        onFinished(result.id);
      } catch (err) {
        submittedRef.current = false;
        toast.error(
          err instanceof Error ? err.message : "Submission failed — retry",
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answers, attempt.id, flushQuestionTime],
  );

  // ── Timer + auto-submit ─────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const left = Math.round((deadlineMs - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0 && !submittedRef.current) {
        toast.warning("Time is up — submitting your exam");
        doSubmit("auto_submit");
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadlineMs, doSubmit]);

  // ── Periodic autosave ───────────────────────────────────────────────────────
  useEffect(() => {
    const id = window.setInterval(persist, 20_000);
    return () => window.clearInterval(id);
  }, [persist]);

  // ── Anti-cheat surveillance ─────────────────────────────────────────────────
  useAntiCheat({
    active: !submittedRef.current,
    onEvent: (type, detail, severity) => {
      mcqAttemptService.logEvent(attempt.id, type, detail, severity);
      if (severity === "critical") {
        toast.error("Suspicious activity logged — stay on the exam tab.");
      }
    },
  });

  // ── Fullscreen on entry + unload guard ──────────────────────────────────────
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!submittedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const q = displayQuestions[currentIndex];
      if (!q) return;
      if (e.key === "ArrowRight") goTo(currentIndex + 1);
      else if (e.key === "ArrowLeft") goTo(currentIndex - 1);
      else if (e.key.toLowerCase() === "r") {
        patchAnswer(q.id, { markedForReview: !answers[q.id]?.markedForReview });
      } else if (/^[1-9]$/.test(e.key) && q.questionType !== "numerical") {
        const opt = q.options[Number(e.key) - 1];
        if (opt) {
          if (q.questionType === "multiple") {
            const sel = answers[q.id]?.selectedOptionIds ?? [];
            patchAnswer(q.id, {
              selectedOptionIds: sel.includes(opt.id)
                ? sel.filter((x) => x !== opt.id)
                : [...sel, opt.id],
            });
          } else {
            patchAnswer(q.id, { selectedOptionIds: [opt.id] });
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, displayQuestions, answers, goTo]);

  const current = displayQuestions[currentIndex];
  const draft: AnswerDraft = answers[current?.id ?? ""] ?? {
    questionId: current?.id ?? "",
    selectedOptionIds: [],
    numericValue: null,
    markedForReview: false,
    timeSpentSeconds: 0,
  };
  const attemptedCount = displayQuestions.filter((q) =>
    isAnswered(answers[q.id]),
  ).length;
  const submitting = submitMut.isPending;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {exam.title}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {attempt.studentName} · {attemptedCount}/{displayQuestions.length}{" "}
            answered
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExamTimer remainingSeconds={remaining} />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 hidden sm:flex"
            title="Fullscreen"
            onClick={() =>
              document.documentElement.requestFullscreen?.().catch(() => undefined)
            }
          >
            <Maximize className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 lg:hidden"
            title="Question palette"
            onClick={() => setPaletteOpen(true)}
          >
            <Grid3x3 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={() => {
              flushQuestionTime();
              setShowSummary(true);
            }}
          >
            <Send className="w-3.5 h-3.5 mr-1.5" /> Submit
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          <div className="max-w-2xl mx-auto">
            {current && (
              <ExamQuestionView
                question={current}
                index={currentIndex}
                total={displayQuestions.length}
                draft={draft}
                onChange={(patch) => patchAnswer(current.id, patch)}
              />
            )}
          </div>
        </main>

        {/* Palette — sidebar on lg, overlay on mobile */}
        <aside className="hidden lg:block w-64 border-l border-border/60 p-4 overflow-y-auto">
          <ExamPalette
            questions={displayQuestions}
            answers={answers}
            currentIndex={currentIndex}
            onJump={goTo}
          />
        </aside>
      </div>

      {/* Footer nav */}
      <footer className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5">
        <Button
          variant="outline"
          size="sm"
          disabled={currentIndex === 0}
          onClick={() => goTo(currentIndex - 1)}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Previous
        </Button>
        <span className="text-xs text-muted-foreground hidden sm:block">
          Keys: 1-9 answer · ←/→ navigate · R review
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={currentIndex === displayQuestions.length - 1}
          onClick={() => goTo(currentIndex + 1)}
        >
          Next <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </footer>

      {/* Mobile palette overlay */}
      {paletteOpen && (
        <div className="fixed inset-0 z-[60] bg-black/40 lg:hidden">
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-background border-l border-border/60 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Questions</p>
              <button onClick={() => setPaletteOpen(false)}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <ExamPalette
              questions={displayQuestions}
              answers={answers}
              currentIndex={currentIndex}
              onJump={goTo}
            />
          </div>
        </div>
      )}

      {/* Pre-submit review */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your exam?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <SummaryStat
                label="Answered"
                value={attemptedCount}
                tone="green"
              />
              <SummaryStat
                label="Unanswered"
                value={displayQuestions.length - attemptedCount}
                tone="rose"
              />
              <SummaryStat
                label="For review"
                value={
                  displayQuestions.filter((q) => answers[q.id]?.markedForReview)
                    .length
                }
                tone="amber"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Once submitted you cannot change your answers. Unanswered
              questions score zero.
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={submitting}
                onClick={() => doSubmit("submit")}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Submit Exam
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowSummary(false)}
                disabled={submitting}
              >
                Keep Going
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SummaryStat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "rose" | "amber";
}) => {
  const cls = {
    green: "text-emerald-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
  }[tone];
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-2">
      <p className={`text-xl font-display font-semibold ${cls}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
};
