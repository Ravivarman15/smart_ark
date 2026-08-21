import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  FileQuestion,
  Link2,
  Plus,
  Radio,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac";
import { useMcqExams } from "../hooks";
import { ShareTestLinkPanel } from "../components/ShareTestLinkPanel";
import { LiveStatusChip } from "../components/McqExamBadges";
import type { McqExam } from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// ONLINE TESTS — the front door.
//
// ┌── WHY A NEW SUBMODULE AND NOT A RENAME ────────────────────────────────┐
// │ "Online Tests" is what people call this; "MCQ Exam" is what the tables │
// │ are called. Renaming the four existing submodules would have been      │
// │ tidier to look at and worse to live with: submodule ids are what a     │
// │ tenant's role grants are STORED against, so renaming them revokes      │
// │ every grant an administrator has already made, silently, on deploy.    │
// │                                                                        │
// │ So this is an additional front door onto the same engine. The existing │
// │ Create/Manage MCQ Paper and Exam entries keep working and keep their   │
// │ grants; this page is where the whole flow now starts.                  │
// └────────────────────────────────────────────────────────────────────────┘
//
// Registered in all four places a module has to appear — catalog.ts,
// actionCatalog.ts, menu.config.ts and sharedRoutes.tsx — because a page in
// fewer than four of them is invisible in Manage Staff Role, or 404s on direct
// navigation, or both.
// ─────────────────────────────────────────────────────────────────────────────

type Filter = "all" | "live" | "scheduled" | "closed";

const OnlineTestsDashboardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canDo } = useCanDo();
  const { data: exams = [], isLoading } = useMcqExams();

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [shareTarget, setShareTarget] = useState<McqExam | null>(null);

  const base = `/${user?.role ?? "teacher"}`;

  const counts = useMemo(
    () => ({
      all: exams.length,
      live: exams.filter((e) => e.liveStatus === "live").length,
      scheduled: exams.filter(
        (e) => e.status !== "draft" && e.liveStatus === "not_started",
      ).length,
      closed: exams.filter((e) => e.liveStatus === "ended").length,
    }),
    [exams],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter((e) => {
      if (q && !e.title.toLowerCase().includes(q)) return false;
      if (filter === "live") return e.liveStatus === "live";
      if (filter === "scheduled")
        return e.status !== "draft" && e.liveStatus === "not_started";
      if (filter === "closed") return e.liveStatus === "ended";
      return true;
    });
  }, [exams, filter, search]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Online Tests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tests students take on a device — assigned to a class, or shared as a
            link anyone can open.
          </p>
        </div>
        {canDo("exam.mcq.create") && (
          <Button onClick={() => navigate(`${base}/exams/online-tests/create`)}>
            <Plus className="w-4 h-4 mr-2" /> Create test
          </Button>
        )}
      </header>

      {/* ── Counters double as the filter ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {(
          [
            ["all", "All tests", counts.all, FileQuestion],
            ["live", "Live now", counts.live, Radio],
            ["scheduled", "Scheduled", counts.scheduled, Clock],
            ["closed", "Closed", counts.closed, CheckCircle2],
          ] as [Filter, string, number, typeof Radio][]
        ).map(([id, label, count, Icon]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-xl border p-3.5 text-left transition",
              filter === id
                ? "border-accent bg-accent/5"
                : "border-border/70 hover:border-border",
            )}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[11px] uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums mt-1">{count}</p>
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tests…"
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && visible.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/70 py-16 text-center">
          <FileQuestion className="w-9 h-9 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">
            {exams.length === 0 ? "No online tests yet" : "Nothing matches that"}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
            {exams.length === 0
              ? "Build a question paper, then create a test from it. Students take it on their own device and it marks itself."
              : "Try a different search, or clear the filter."}
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {visible.map((exam) => (
          <div
            key={exam.id}
            className="rounded-xl border border-border/70 p-4 hover:border-border transition"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{exam.title}</p>
                  <LiveStatusChip status={exam.liveStatus} />
                  {exam.status === "draft" && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Draft
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                  {exam.subjectName && <span>{exam.subjectName}</span>}
                  <span className="inline-flex items-center gap-1">
                    <FileQuestion className="w-3.5 h-3.5" /> {exam.totalQuestions} questions
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {exam.durationMinutes} min
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {exam.assignments.length === 0
                      ? "Everyone"
                      : `${exam.assignments.length} target${exam.assignments.length === 1 ? "" : "s"}`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {canDo("exam.mcq.exam_publish") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShareTarget(exam)}
                  >
                    <Link2 className="w-3.5 h-3.5 mr-1.5" /> Share
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(`${base}/exams/mcq-exams/${exam.id}/monitor`)
                  }
                >
                  <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Results
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!shareTarget} onOpenChange={(o) => !o && setShareTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share “{shareTarget?.title}”</DialogTitle>
            <DialogDescription>
              Anyone with the link can take this test without an account. They
              will see your institution&rsquo;s name and logo.
            </DialogDescription>
          </DialogHeader>
          {shareTarget && (
            <ShareTestLinkPanel
              examId={shareTarget.id}
              examTitle={shareTarget.title}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OnlineTestsDashboardPage;
