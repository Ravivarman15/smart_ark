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
import { onlineTestService } from "../services/onlineTest.service";
import type { OnlineTestSession } from "../services/onlineTest.service";
import type { AnswerDraft } from "../types/mcqExam.types";

/**
 * How this runner talks to the server.
 *
 * There are two ways to sit the same test — signed in, or holding a public
 * link — and they differ ONLY in which endpoint carries the answers. Passing
 * that in as a transport is what lets the public page reuse this component
 * exactly, rather than growing a second exam screen that would drift in its
 * timer handling, its palette, its anti-cheat and its submit guard.
 */
export interface TestTransport {
  save(
    attemptId: string,
    drafts: AnswerDraft[],
  ): Promise<{ remainingSeconds: number; autoSubmitted?: boolean }>;
  submit(attemptId: string): Promise<unknown>;
  event(
    attemptId: string,
    eventType: string,
    detail?: string,
    severity?: "info" | "warning" | "critical",
  ): void;
}

interface Props {
  session: OnlineTestSession;
  onFinished: (attemptId: string) => void;
  /** Omitted for a signed-in taker, who uses the authenticated endpoint. */
  transport?: TestTransport;
}

// A typed answer counts. Without the textValue arm, every fill-in-the-blank,
// match and essay would show "Unanswered" in the palette and the pre-submit
// warning, even after the student wrote a full page.
const isAnswered = (d?: AnswerDraft): boolean =>
  !!d &&
  ((d.selectedOptionIds?.length ?? 0) > 0 ||
    (d.numericValue != null && Number.isFinite(d.numericValue)) ||
    !!d.textValue?.replace(/\|/g, "").trim());

// ─────────────────────────────────────────────────────────────────────────────
// ExamRunner — the full-screen student exam engine.
//
// Owns the live attempt: timer + auto-submit, periodic autosave (answer
// persistence + heartbeat), question navigation, mark-for-review, keyboard
// shortcuts, anti-cheat surveillance and the pre-submit review.
//
// NOTHING HERE KNOWS AN ANSWER. Questions arrive from the `online-test` edge
// function in a shape that cannot carry a key — no isCorrect, no explanation,
// no numeric answer — and submission returns a result the server computed. This
// component used to grade the paper itself and then write the mark.
//
// The clock is the same story. It ticks locally so it feels alive, but it
// starts from the server's remaining seconds and every autosave re-anchors it.
// A laptop that slept for an hour wakes with a countdown that is simply wrong,
// and the tab is the last thing that should be trusted to notice.
// ─────────────────────────────────────────────────────────────────────────────
export const ExamRunner = ({ session, onFinished, transport }: Props) => {
  const { exam, attempt, questions } = session;

  // The server has already applied both the question order and the option
  // shuffle, using the seed frozen on the attempt. Shuffling again here would
  // re-arrange what was already arranged, so a refresh mid-test would present
  // the same paper in a different order.
  const displayQuestions = questions;

  // Answer drafts keyed by question id, seeded from any saved answers.
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>(() => {
    const seed: Record<string, AnswerDraft> = {};
    for (const a of session.answers) {
      seed[a.questionId] = {
        questionId: a.questionId,
        selectedOptionIds: a.selectedOptionIds ?? [],
        numericValue: a.numericValue ?? null,
        textValue: a.textValue ?? null,
        markedForReview: a.markedForReview,
        timeSpentSeconds: 0,
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

  // The hooks are always created — they are plain mutations and calling them
  // conditionally would break the rules of hooks — but the transport decides
  // which one actually carries the request.
  const wire: TestTransport = useMemo(
    () =>
      transport ?? {
        save: (attemptId, drafts) => autosave.mutateAsync({ attemptId, drafts }),
        submit: (attemptId) => submitMut.mutateAsync({ attemptId }),
        event: (attemptId, eventType, detail, severity) =>
          onlineTestService.event(attemptId, eventType, detail, severity),
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transport],
  );

  // Anchored to the server's remaining seconds at the moment the session was
  // issued, NOT to started_at + duration computed on this device. A device
  // clock running a few minutes slow would otherwise award its owner a few
  // extra minutes of exam time.
  const deadlineRef = useRef(Date.now() + session.remainingSeconds * 1000);
  const enteredAt = useRef(Date.now());
  const submittedRef = useRef(false);

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
        textValue: null,
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
        textValue: null,
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
      const res = await wire.save(attempt.id, drafts);
      // Re-anchor to the server every time it answers.
      deadlineRef.current = Date.now() + res.remainingSeconds * 1000;
      if (res.autoSubmitted && !submittedRef.current) {
        submittedRef.current = true;
        toast.warning("Your time expired — the test was submitted");
        onFinished(attempt.id);
      }
    } catch {
      /* offline — the next tick retries */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, attempt.id, flushQuestionTime, wire]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const doSubmit = useCallback(
    async () => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      flushQuestionTime();
      try {
        // Save, THEN close. If the save fails the submit is abandoned and the
        // guard released: grading a paper whose last answers never arrived
        // would score work the student actually did as unattempted.
        await wire.save(attempt.id, Object.values(answers));
        await wire.submit(attempt.id);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => undefined);
        }
        onFinished(attempt.id);
      } catch (err) {
        submittedRef.current = false;
        toast.error(
          err instanceof Error ? err.message : "Submission failed — retry",
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answers, attempt.id, flushQuestionTime, wire],
  );

  // ── Timer + auto-submit ─────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const left = Math.round((deadlineRef.current - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0 && !submittedRef.current) {
        toast.warning("Time is up — submitting your exam");
        doSubmit();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [doSubmit]);

  // ── Periodic autosave ───────────────────────────────────────────────────────
  useEffect(() => {
    const id = window.setInterval(persist, 20_000);
    return () => window.clearInterval(id);
  }, [persist]);

  // ── Anti-cheat surveillance ─────────────────────────────────────────────────
  useAntiCheat({
    active: !submittedRef.current,
    onEvent: (type, detail, severity) => {
      wire.event(attempt.id, type, detail, severity);
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
    // No suppression needed any more: displayQuestions is a plain value now
    // that the server owns the shuffle, so this dependency list is complete.
  }, [currentIndex, displayQuestions, answers, goTo]);

  const current = displayQuestions[currentIndex];
  const draft: AnswerDraft = answers[current?.id ?? ""] ?? {
    questionId: current?.id ?? "",
    selectedOptionIds: [],
    numericValue: null,
    textValue: null,
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
                onClick={() => doSubmit()}
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
