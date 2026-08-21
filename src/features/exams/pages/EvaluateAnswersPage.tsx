import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/core/constants/queryKeys";
import { useCanDo } from "@/features/rbac";
import { onlineTestService } from "../services/onlineTest.service";
import type { MarkingItem } from "../services/onlineTest.service";

// ─────────────────────────────────────────────────────────────────────────────
// MARKING THE ANSWERS A MACHINE CANNOT
//
// ┌── THE DEAD END THIS CLOSES ────────────────────────────────────────────┐
// │ The grader has always refused to score an essay zero: it flags the     │
// │ answer `pending_review` and leaves the attempt's `is_pass` NULL,       │
// │ because a percentage missing six marks cannot decide a pass.           │
// │                                                                        │
// │ Nothing had ever read either flag. An attempt containing one essay     │
// │ stayed provisional forever and no screen offered a way to finish it.   │
// │ Refusing to invent a mark was right; providing nowhere to enter the    │
// │ real one was the half that was missing.                                │
// └────────────────────────────────────────────────────────────────────────┘
//
// Oldest first, deliberately. A student waiting three days should not be
// overtaken by one who submitted this morning — which is what newest-first or
// grouped-by-exam ordering quietly does.
// ─────────────────────────────────────────────────────────────────────────────

const MARKING_KEY = [...queryKeys.exams.all, "marking-queue"] as const;

const EvaluateAnswersPage = () => {
  const { canDo } = useCanDo();
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [mark, setMark] = useState("");
  const [comment, setComment] = useState("");

  const { data: queue = [], isLoading, error } = useQuery<MarkingItem[]>({
    queryKey: MARKING_KEY,
    queryFn: () => onlineTestService.markingQueue(),
    // A queue that quietly goes stale means two teachers mark the same answer
    // and one of them wastes the effort.
    staleTime: 0,
  });

  const current = queue[index];

  const evaluate = useMutation({
    mutationFn: (args: { answerId: string; awarded: number; comment: string }) =>
      onlineTestService.evaluate(args.answerId, args.awarded, args.comment),
    onSuccess: (res) => {
      setMark("");
      setComment("");
      // Advance rather than refetching immediately: pulling the list out from
      // under someone mid-queue loses their place. The refetch happens when
      // the queue is exhausted.
      if (index + 1 >= queue.length) {
        qc.invalidateQueries({ queryKey: MARKING_KEY });
        setIndex(0);
      } else {
        setIndex((i) => i + 1);
      }
      qc.invalidateQueries({ queryKey: queryKeys.exams.all });
      toast.success(
        res.awaitingEvaluation === false
          ? "Marked — that attempt is now complete."
          : "Marked.",
      );
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not save that mark."),
  });

  const parsedMark = Number(mark);
  const markValid =
    mark.trim().length > 0 &&
    Number.isFinite(parsedMark) &&
    parsedMark >= 0 &&
    !!current &&
    parsedMark <= current.maxMarks;

  const grouped = useMemo(() => {
    const byExam = new Map<string, number>();
    for (const item of queue) {
      byExam.set(item.examTitle, (byExam.get(item.examTitle) ?? 0) + 1);
    }
    return [...byExam.entries()].sort((a, b) => b[1] - a[1]);
  }, [queue]);

  if (!canDo("exam.marks_entry")) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        You do not have permission to mark answers.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Answers to mark</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Essays, long answers and anything else the grader cannot settle on its
          own. Until these are marked, the students&rsquo; scores stay
          provisional.
        </p>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 py-16 justify-center text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the queue…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          Could not load the marking queue.
        </div>
      )}

      {!isLoading && !error && queue.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/70 py-16 text-center">
          <CheckCircle2 className="w-9 h-9 text-accent/60 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Nothing waiting</p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Every submitted answer has been marked. Scores are final.
          </p>
        </div>
      )}

      {current && (
        <div className="grid lg:grid-cols-[1fr_280px] gap-5">
          {/* ── The answer ─────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <span className="text-xs text-muted-foreground">
                {index + 1} of {queue.length} waiting
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {current.questionType.replace(/_/g, " ")}
              </span>
            </div>

            <p className="text-sm font-medium text-foreground">
              {current.questionText}
            </p>

            <div className="mt-4">
              <Label className="text-xs">The student wrote</Label>
              <div className="mt-1.5 rounded-lg bg-muted/40 p-4 text-sm text-foreground whitespace-pre-wrap min-h-[8rem]">
                {current.answerText.trim() || (
                  // A blank answer still needs a mark recorded, or the attempt
                  // never settles — it is not the same as an unmarked one.
                  <span className="text-muted-foreground italic">
                    Left blank. Marking it 0 is what settles the attempt.
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5 grid sm:grid-cols-[140px_1fr] gap-4 items-start">
              <div>
                <Label htmlFor="mark" className="text-xs">
                  Marks (out of {current.maxMarks})
                </Label>
                <Input
                  id="mark"
                  inputMode="decimal"
                  value={mark}
                  onChange={(e) => setMark(e.target.value)}
                  className="mt-1.5"
                  autoFocus
                />
                {mark.trim().length > 0 && !markValid && (
                  <p className="text-[11px] text-destructive mt-1.5">
                    Enter a number between 0 and {current.maxMarks}.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="comment" className="text-xs">
                  Comment (optional)
                </Label>
                <Textarea
                  id="comment"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="mt-1.5"
                  placeholder="Why this mark — the student may see it."
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border/60">
              <Button
                disabled={!markValid || evaluate.isPending}
                onClick={() =>
                  evaluate.mutate({
                    answerId: current.answerId,
                    awarded: parsedMark,
                    comment: comment.trim(),
                  })
                }
              >
                {evaluate.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                )}
                Save and next
              </Button>
              <Button
                variant="ghost"
                disabled={index + 1 >= queue.length}
                onClick={() => {
                  // Skipping keeps it in the queue. A "skip" that removed it
                  // would lose the answer entirely.
                  setMark("");
                  setComment("");
                  setIndex((i) => i + 1);
                }}
              >
                Skip for now
              </Button>
            </div>
          </div>

          {/* ── Context ────────────────────────────────────────────────────── */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-border/70 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Whose answer
              </p>
              <p className="text-sm font-medium text-foreground mt-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                {current.studentName}
              </p>
              {current.batchName && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {current.batchName}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                {current.examTitle}
              </p>
              {current.submittedAt && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Submitted{" "}
                  {new Date(current.submittedAt).toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>

            {grouped.length > 0 && (
              <div className="rounded-xl border border-border/70 p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                  Waiting by test
                </p>
                <ul className="space-y-1.5">
                  {grouped.map(([title, n]) => (
                    <li
                      key={title}
                      className={cn(
                        "text-xs flex items-center justify-between gap-2",
                        title === current.examTitle
                          ? "text-foreground font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <span className="truncate">{title || "Untitled"}</span>
                      <span className="tabular-nums shrink-0">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default EvaluateAnswersPage;
