import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  GraduationCap,
  Loader2,
  Lock,
  Play,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { examLookupsService } from "../services";
import {
  ExamRunner,
  LiveStatusChip,
  StudentResultView,
} from "../components";
import { useStartAttempt, useStudentMcqExams } from "../hooks";
import type { McqExam } from "../types/mcqExam.types";
import type { OnlineTestSession } from "../services/onlineTest.service";
import type { BatchOption, StudentOption } from "../services/examLookups.service";

type Stage =
  | { kind: "pick-batch" }
  | { kind: "pick-student"; batch: BatchOption }
  | {
      kind: "pick-exam";
      batch: BatchOption;
      student: StudentOption;
    }
  | {
      kind: "instructions";
      batch: BatchOption;
      student: StudentOption;
      exam: McqExam;
    }
  | { kind: "running"; session: OnlineTestSession }
  | {
      kind: "finished";
      attemptId: string;
      batch: BatchOption;
      student: StudentOption;
    };

// ─────────────────────────────────────────────────────────────────────────────
// StudentExamPage — the proctored `/exam` kiosk.
//
// ┌── THIS ROUTE USED TO BE UNAUTHENTICATED ───────────────────────────────┐
// │ It listed every batch, then every student in the chosen batch, and let │
// │ the visitor click one and sit the test AS THAT PERSON. No password, no │
// │ session, no proof of anything. Identity was a dropdown.                │
// │                                                                        │
// │ It was inert only by accident: current_org_id() is NULL for anon since │
// │ the second organization was created, so every roster query returned    │
// │ zero rows and the first screen was permanently empty. A deployment     │
// │ with a single tenant would have served the whole roster — and, through │
// │ the anon policies on mcq_questions, the answer keys with it.           │
// │                                                                        │
// │ It is now behind a STAFF SESSION: the invigilator signs in on the lab  │
// │ device and hands it to each student in turn, which is what "proctored" │
// │ meant all along. The server checks that the caller is staff of the     │
// │ student's own organization on every single call.                       │
// └────────────────────────────────────────────────────────────────────────┘
//
// Flow: pick batch → pick student → list the student's assigned exams →
// instructions → ExamRunner (full-screen) → StudentResultView. Every guard
// (eligibility, window, live status, attempt limit, paper attached) is decided
// by the `online-test` edge function, never here.
// ─────────────────────────────────────────────────────────────────────────────
const StudentExamPage = () => {
  const [params, setParams] = useSearchParams();
  const examIdParam = params.get("exam");

  const [stage, setStage] = useState<Stage>({ kind: "pick-batch" });
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);

  // ── Load batch list on mount ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    examLookupsService
      .batches()
      .then((rows) => {
        if (alive) setBatches(rows);
      })
      .finally(() => {
        if (alive) setLoadingBatches(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const startAttempt = useStartAttempt();

  const onLaunch = async (
    exam: McqExam,
    batch: BatchOption,
    student: StudentOption,
  ) => {
    try {
      // Only the two ids travel. Name, batch and organization are resolved
      // server-side from the student row — a client that could send its own
      // batch_name could also send its own organization_id.
      const session = await startAttempt.mutateAsync({
        examId: exam.id,
        studentId: student.id,
      });
      setStage({ kind: "running", session });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start exam");
    }
  };

  // Optional deep-link: /exam?exam=<id> — still needs batch + student selection,
  // but pre-selects the target exam after the student is picked.
  const focusedExamId = examIdParam;

  if (stage.kind === "running") {
    return (
      <ExamRunner
        session={stage.session}
        onFinished={(attemptId) => {
          // Pull batch + student off the session for the result screen.
          setStage({
            kind: "finished",
            attemptId,
            batch: {
              id: "",
              name: stage.session.attempt.batchName ?? "",
            },
            student: {
              id: stage.session.attempt.studentId,
              name: stage.session.attempt.studentName ?? "—",
            },
          });
        }}
      />
    );
  }

  if (stage.kind === "finished") {
    return (
      <KioskShell title="Exam submitted">
        <StudentResultView
          attemptId={stage.attemptId}
          onClose={() => {
            params.delete("exam");
            setParams(params);
            setStage({
              kind: "pick-exam",
              batch: stage.batch,
              student: stage.student,
            });
          }}
        />
      </KioskShell>
    );
  }

  if (stage.kind === "instructions") {
    return (
      <KioskShell title="Before you begin">
        <InstructionsCard
          exam={stage.exam}
          student={stage.student}
          onBack={() =>
            setStage({
              kind: "pick-exam",
              batch: stage.batch,
              student: stage.student,
            })
          }
          onStart={() => onLaunch(stage.exam, stage.batch, stage.student)}
          starting={startAttempt.isPending}
        />
      </KioskShell>
    );
  }

  if (stage.kind === "pick-exam") {
    return (
      <KioskShell
        title={`Hi ${stage.student.name}`}
        subtitle={stage.batch.name}
        onBack={() => setStage({ kind: "pick-student", batch: stage.batch })}
      >
        <ExamPicker
          batch={stage.batch}
          focusedExamId={focusedExamId}
          onPick={(exam) =>
            setStage({
              kind: "instructions",
              batch: stage.batch,
              student: stage.student,
              exam,
            })
          }
        />
      </KioskShell>
    );
  }

  if (stage.kind === "pick-student") {
    return (
      <KioskShell
        title="Who is taking the exam?"
        subtitle={stage.batch.name}
        onBack={() => setStage({ kind: "pick-batch" })}
      >
        <StudentPicker
          batch={stage.batch}
          onPickNext={(student) =>
            setStage({ kind: "pick-exam", batch: stage.batch, student })
          }
        />
      </KioskShell>
    );
  }

  // pick-batch (default)
  return (
    <KioskShell
      title="Welcome to the exam lab"
      subtitle="Select your batch to continue"
    >
      <BatchPicker
        batches={batches}
        loading={loadingBatches}
        onPick={(batch) => setStage({ kind: "pick-student", batch })}
      />
    </KioskShell>
  );
};

// ── Kiosk shell — full-screen frame ───────────────────────────────────────────
const KioskShell = ({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
}) => (
  <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
    <header className="border-b border-border/60 bg-card/40 backdrop-blur">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
        <GraduationCap className="w-6 h-6 text-accent" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {title}
          </p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
        )}
      </div>
    </header>
    <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
  </div>
);

// ── Batch picker ──────────────────────────────────────────────────────────────
const BatchPicker = ({
  batches,
  loading,
  onPick,
}: {
  batches: BatchOption[];
  loading: boolean;
  onPick: (b: BatchOption) => void;
}) => {
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () =>
      batches.filter((b) =>
        search ? b.name.toLowerCase().includes(search.toLowerCase()) : true,
      ),
    [batches, search],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading batches…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your batch…"
          className="pl-9 h-12 text-base"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No batches match.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onPick(b)}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-card/60 hover:bg-card hover:border-accent transition-colors px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-foreground">
                  {b.name}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Student picker ────────────────────────────────────────────────────────────
const StudentPicker = ({
  batch,
  onPickNext,
}: {
  batch: BatchOption;
  onPickNext: (s: StudentOption) => void;
}) => {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    examLookupsService
      .studentsByBatch(batch.id)
      .then((rows) => {
        if (alive) setStudents(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [batch.id]);

  const filtered = useMemo(
    () =>
      students.filter((s) =>
        search ? s.name.toLowerCase().includes(search.toLowerCase()) : true,
      ),
    [students, search],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading students…
      </div>
    );
  }
  if (students.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No active students in this batch.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your name or roll number…"
          className="pl-9 h-12 text-base"
        />
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPickNext(s)}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-card/60 hover:bg-card hover:border-accent transition-colors px-4 py-2.5 text-left"
          >
            <span>
              <span className="text-sm font-medium text-foreground">
                {s.name}
              </span>
              {s.rollNumber && (
                <span className="text-xs text-muted-foreground ml-2">
                  Roll {s.rollNumber}
                </span>
              )}
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Exam picker ───────────────────────────────────────────────────────────────
const ExamPicker = ({
  batch,
  focusedExamId,
  onPick,
}: {
  batch: BatchOption;
  focusedExamId: string | null;
  onPick: (exam: McqExam) => void;
}) => {
  const { data: exams = [], isLoading } = useStudentMcqExams(
    batch.id,
    batch.standardId,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading your exams…
      </div>
    );
  }

  const available = exams.filter(
    (e) => e.liveStatus === "live" || e.liveStatus === "not_started",
  );
  const closed = exams.filter(
    (e) => e.liveStatus === "ended" || e.liveStatus === "paused",
  );

  if (exams.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/50 p-6 text-center">
        <Clock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No MCQ exams have been assigned to your batch yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {available.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Available exams
          </h3>
          <div className="space-y-2">
            {available.map((e) => (
              <ExamCard
                key={e.id}
                exam={e}
                highlight={focusedExamId === e.id}
                onPick={() => onPick(e)}
              />
            ))}
          </div>
        </section>
      )}
      {closed.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Closed / paused
          </h3>
          <div className="space-y-2">
            {closed.map((e) => (
              <ExamCard key={e.id} exam={e} locked onPick={() => onPick(e)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const ExamCard = ({
  exam,
  onPick,
  highlight,
  locked,
}: {
  exam: McqExam;
  onPick: () => void;
  highlight?: boolean;
  locked?: boolean;
}) => (
  <button
    type="button"
    onClick={onPick}
    disabled={locked}
    className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
      locked
        ? "border-border/40 bg-muted/30 opacity-70 cursor-not-allowed"
        : highlight
          ? "border-accent bg-accent/5"
          : "border-border/60 bg-card/60 hover:border-accent hover:bg-card"
    }`}
  >
    <div className="min-w-0">
      <p className="text-sm font-semibold text-foreground truncate">
        {exam.title}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {exam.totalQuestions} questions · {exam.totalMarks} marks ·{" "}
        {exam.durationMinutes} min
      </p>
      <div className="mt-1.5">
        <LiveStatusChip status={exam.liveStatus} />
      </div>
    </div>
    {locked ? (
      <Lock className="w-4 h-4 text-muted-foreground" />
    ) : (
      <ArrowRight className="w-4 h-4 text-accent" />
    )}
  </button>
);

// ── Instructions screen ───────────────────────────────────────────────────────
const InstructionsCard = ({
  exam,
  student,
  onBack,
  onStart,
  starting,
}: {
  exam: McqExam;
  student: StudentOption;
  onBack: () => void;
  onStart: () => void;
  starting: boolean;
}) => (
  <div className="space-y-4">
    <div className="rounded-xl border border-border/60 bg-card/60 p-5">
      <div className="flex items-center gap-2 mb-1">
        <LiveStatusChip status={exam.liveStatus} />
      </div>
      <h2 className="text-lg font-display font-semibold text-foreground">
        {exam.title}
      </h2>
      <p className="text-xs text-muted-foreground">
        Student: {student.name}
        {student.rollNumber ? ` · Roll ${student.rollNumber}` : ""}
      </p>
      <div className="grid grid-cols-3 gap-3 mt-4 text-center text-xs">
        <Stat label="Duration" value={`${exam.durationMinutes} min`} />
        <Stat label="Questions" value={String(exam.totalQuestions)} />
        <Stat label="Total marks" value={String(exam.totalMarks)} />
      </div>
    </div>

    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">
        Instructions
      </h3>
      <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
        <li>The exam opens in full-screen. Stay on this tab — switches are logged.</li>
        <li>
          Autosave runs every 20 seconds; you can reconnect and resume if you
          disconnect.
        </li>
        <li>
          {exam.negativeMarking
            ? "Wrong choice answers cost the question's negative marks."
            : "There is no negative marking."}
        </li>
        <li>
          Pass mark: {exam.passPercentage}%. Attempts allowed:{" "}
          {exam.attemptLimit}.
        </li>
        {exam.instructions && (
          <li className="whitespace-pre-wrap">{exam.instructions}</li>
        )}
      </ul>
    </div>

    <div className="flex gap-2">
      <Button variant="ghost" onClick={onBack}>
        Back
      </Button>
      <Button
        className="flex-1 gap-1.5"
        onClick={onStart}
        disabled={starting || exam.liveStatus === "ended"}
      >
        {starting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        Start exam
      </Button>
    </div>
  </div>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2">
    <p className="text-base font-display font-semibold text-foreground">
      {value}
    </p>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
  </div>
);

export default StudentExamPage;
