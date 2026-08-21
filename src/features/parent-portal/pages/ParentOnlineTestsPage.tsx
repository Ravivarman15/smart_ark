import { useMemo, useState } from "react";
import { CheckCircle2, Clock, FileText, PlayCircle, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useActiveChild } from "../providers/ActiveChildProvider";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  SectionTitle,
} from "../components/primitives";
import { Button } from "@/components/ui/button";
import { useStudentMcqExams } from "@/features/exams/hooks";
import { useStartAttempt } from "@/features/exams/hooks";
import { ExamRunner } from "@/features/exams/components/ExamRunner";
import { onlineTestService } from "@/features/exams/services/onlineTest.service";
import type { OnlineTestResult, OnlineTestSession } from "@/features/exams/services/onlineTest.service";
import type { McqExam } from "@/features/exams/types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// PARENT PORTAL — Online Tests
//
// ┌── WHY THIS IS NOT PART OF "EXAMS & RESULTS" ───────────────────────────┐
// │ That page is a RECORD: what has happened, and what marks came of it.   │
// │ This one is a thing to DO, with a deadline. Burying a test that closes │
// │ at 6pm inside a results archive is how it gets missed.                 │
// └────────────────────────────────────────────────────────────────────────┘
//
// ── WHOSE TESTS ─────────────────────────────────────────────────────────────
// The active child's, and only theirs. `useActiveChild` is scoped by
// `is_parent_of()` in RLS, and the list is filtered per STUDENT rather than per
// batch — a test can now be assigned to a named child, so two siblings in the
// same batch do not necessarily see the same thing.
//
// That filtering is still only PRESENTATION. The decision that admits this
// child to this test is `isEligible()` in _shared/testEngine.ts, re-run on the
// server every time Start is pressed. Hiding a card is not access control.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "available" | "upcoming" | "completed";

type Stage =
  | { kind: "list" }
  | { kind: "running"; session: OnlineTestSession }
  | { kind: "done"; result: OnlineTestResult };

export const ParentOnlineTestsPage = () => {
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const [tab, setTab] = useState<Tab>("available");
  const [stage, setStage] = useState<Stage>({ kind: "list" });

  const { data: exams = [], isLoading, error } = useStudentMcqExams(
    student?.id ?? null,
    student?.batchId,
    student?.standardId,
  );
  const startAttempt = useStartAttempt();

  const buckets = useMemo(() => {
    const now = Date.now();
    const opensLater = (e: McqExam) =>
      !!e.windowStart && new Date(e.windowStart).getTime() > now;
    const closed = (e: McqExam) =>
      e.liveStatus === "ended" ||
      (!!e.windowEnd && new Date(e.windowEnd).getTime() < now);

    return {
      available: exams.filter((e) => !opensLater(e) && !closed(e)),
      upcoming: exams.filter(opensLater),
      completed: exams.filter(closed),
    };
  }, [exams]);

  if (!activeChild || !student) return null;

  if (stage.kind === "running") {
    return (
      <ExamRunner
        session={stage.session}
        onFinished={async (attemptId) => {
          try {
            const { result } = await onlineTestService.result(attemptId);
            setStage({ kind: "done", result });
          } catch {
            // The paper is submitted either way — the server settled it. Only
            // the result screen failed, so say that rather than implying the
            // attempt was lost.
            toast.error("Submitted, but the result could not be loaded.");
            setStage({ kind: "list" });
          }
        }}
      />
    );
  }

  if (stage.kind === "done") {
    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader title="Test submitted" subtitle={student.name} />
        <ResultCard result={stage.result} onClose={() => setStage({ kind: "list" })} />
      </div>
    );
  }

  const launch = async (exam: McqExam) => {
    try {
      const session = await startAttempt.mutateAsync({
        examId: exam.id,
        studentId: student.id,
      });
      setStage({ kind: "running", session });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start this test.");
    }
  };

  const list = buckets[tab];

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Online Tests" subtitle={student.name} />

      <div className="flex gap-1 mb-4 rounded-lg bg-muted/50 p-1 w-fit">
        {(
          [
            ["available", "Available", buckets.available.length],
            ["upcoming", "Upcoming", buckets.upcoming.length],
            ["completed", "Completed", buckets.completed.length],
          ] as [Tab, string, number][]
        ).map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm transition",
              tab === id
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {count > 0 && (
              <span className="ml-1.5 text-[11px] text-muted-foreground">{count}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading && <LoadingRows />}
      {error && <ErrorState error={error as Error} />}

      {!isLoading && !error && list.length === 0 && (
        <EmptyState
          title={
            tab === "available"
              ? "No tests to take right now"
              : tab === "upcoming"
                ? "Nothing scheduled yet"
                : "No completed tests yet"
          }
          hint={
            tab === "available"
              ? `When a teacher assigns a test to ${student.name}, it will appear here.`
              : undefined
          }
        />
      )}

      <div className="space-y-3">
        {list.map((exam) => (
          <TestCard
            key={exam.id}
            exam={exam}
            tab={tab}
            starting={startAttempt.isPending}
            onStart={() => launch(exam)}
          />
        ))}
      </div>
    </div>
  );
};

// ── One test ─────────────────────────────────────────────────────────────────
const TestCard = ({
  exam,
  tab,
  starting,
  onStart,
}: {
  exam: McqExam;
  tab: Tab;
  starting: boolean;
  onStart: () => void;
}) => {
  const closesAt = exam.windowEnd ? new Date(exam.windowEnd) : null;
  const opensAt = exam.windowStart ? new Date(exam.windowStart) : null;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <SectionTitle>{exam.title}</SectionTitle>
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
            {exam.subjectName && <span>{exam.subjectName}</span>}
            <span className="inline-flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> {exam.totalQuestions} questions
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {exam.durationMinutes} min
            </span>
          </div>

          {tab === "upcoming" && opensAt && (
            <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
              <Timer className="w-3.5 h-3.5" /> Opens{" "}
              {opensAt.toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
          {tab === "available" && closesAt && (
            <p className="text-xs text-amber-600 mt-2 inline-flex items-center gap-1">
              <Timer className="w-3.5 h-3.5" /> Closes{" "}
              {closesAt.toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        <div className="shrink-0">
          {tab === "available" ? (
            <Button size="sm" disabled={starting} onClick={onStart}>
              <PlayCircle className="w-4 h-4 mr-1.5" /> Start
            </Button>
          ) : (
            <Chip>
              {tab === "upcoming" ? "Not open yet" : "Closed"}
            </Chip>
          )}
        </div>
      </div>
    </Card>
  );
};

// ── Result ───────────────────────────────────────────────────────────────────
const ResultCard = ({
  result,
  onClose,
}: {
  result: OnlineTestResult;
  onClose: () => void;
}) => {
  // Narrowed with `in` rather than on `released`: this project compiles with
  // strict:false, where narrowing a union on a boolean literal is unreliable.
  if ("message" in result) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-accent mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{result.message}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onClose}>
          Back to tests
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 text-center">
      <CheckCircle2 className="w-10 h-10 text-accent mx-auto mb-3" />
      <p className="text-3xl font-bold tabular-nums">
        {result.totalScore}
        <span className="text-lg text-muted-foreground font-normal">
          {" "}/ {result.maxScore}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">{result.percentage}%</p>

      <div className="grid grid-cols-3 gap-3 mt-5 max-w-xs mx-auto">
        {[
          ["Correct", result.correctCount],
          ["Incorrect", result.wrongCount],
          ["Unanswered", result.unattemptedCount],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg bg-muted/40 py-2.5">
            <p className="text-base font-semibold tabular-nums">{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {result.awaitingEvaluation && (
        // Said plainly, because the number above is not final. A parent shown a
        // low score on a paper whose essays nobody has marked will draw the
        // wrong conclusion about their child.
        <p className="mt-5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          {result.pendingMarks} mark{result.pendingMarks === 1 ? "" : "s"} are still
          with a teacher for marking, so this is not the final score.
        </p>
      )}

      <Button variant="outline" size="sm" className="mt-5" onClick={onClose}>
        Back to tests
      </Button>
    </Card>
  );
};

export default ParentOnlineTestsPage;
