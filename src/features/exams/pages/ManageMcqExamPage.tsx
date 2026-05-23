import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Eye,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  Square,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ProtectedMenuItem } from "@/features/rbac";
import { LiveStatusChip } from "../components";
import {
  useDeleteMcqExam,
  useMcqExamOverview,
  useMcqExams,
  useReleaseExamResults,
  useSetExamLiveStatus,
  useSetExamPublished,
} from "../hooks";
import type { LiveStatus, McqExam } from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// ManageMcqExamPage — the hub for the MCQ exam vertical.
//
// Overview tiles, exam table and a single row dropdown covering every
// lifecycle action: edit, publish/unpublish, start/pause/resume/end the live
// exam, monitor + analytics + leaderboard navigation, release results, and
// delete. Every mutation is RBAC-gated via ProtectedMenuItem.
// ─────────────────────────────────────────────────────────────────────────────
const ManageMcqExamPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.startsWith("/management") ? "/management" : "/admin";

  const { data: exams = [], isLoading, error } = useMcqExams();
  const { data: overview } = useMcqExamOverview();

  const publishMut = useSetExamPublished();
  const liveMut = useSetExamLiveStatus();
  const releaseMut = useReleaseExamResults();
  const deleteMut = useDeleteMcqExam();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LiveStatus | "all">("all");
  const [deleteTarget, setDeleteTarget] = useState<McqExam | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<McqExam | null>(null);

  const migrationNeeded =
    !!error &&
    /mcq_exams|mcq_attempts|schema cache|does not exist/i.test(
      error instanceof Error ? error.message : String(error),
    );

  const filtered = useMemo(
    () =>
      exams.filter((e) => {
        if (statusFilter !== "all" && e.liveStatus !== statusFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const hay = [e.title, e.paperTitle, e.batchName, e.subjectName]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [exams, search, statusFilter],
  );

  const togglePublish = async (e: McqExam) => {
    const next = e.status === "draft";
    try {
      await publishMut.mutateAsync({ id: e.id, published: next });
      toast.success(next ? "Exam published" : "Exam moved to draft");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const setLive = async (e: McqExam, liveStatus: LiveStatus, label: string) => {
    try {
      await liveMut.mutateAsync({ id: e.id, liveStatus });
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const releaseResults = async () => {
    if (!releaseTarget) return;
    try {
      await releaseMut.mutateAsync(releaseTarget.id);
      toast.success("Results released");
      setReleaseTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success("Exam deleted");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            Manage MCQ Exam
          </h1>
          <p className="text-sm text-muted-foreground">
            Schedule, monitor, score and analyse live MCQ exams.
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => navigate(`${base}/exams/mcq-exams/create`)}
        >
          <Plus className="w-4 h-4" /> Create Exam
        </Button>
      </header>

      {migrationNeeded && (
        <div className="rounded-lg border border-yellow-300/60 bg-yellow-50/40 text-yellow-800 p-4 text-sm">
          <p className="font-semibold">Database migration required</p>
          <p className="mt-0.5">
            Run <code>20260524_mcq_exam_engine.sql</code> in the Supabase SQL
            editor, then refresh.
          </p>
        </div>
      )}

      {/* Overview tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="Total exams" value={overview?.total ?? 0} />
        <Tile label="Live now" value={overview?.live ?? 0} tone="green" />
        <Tile label="Scheduled" value={overview?.scheduled ?? 0} tone="blue" />
        <Tile label="Completed" value={overview?.completed ?? 0} tone="slate" />
        <Tile
          label="Attempts today"
          value={overview?.attemptsToday ?? 0}
          tone="amber"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, paper, batch…"
            className="pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as LiveStatus | "all")
          }
          className="bg-background border border-border rounded-md px-3 py-2 text-sm sm:w-44"
        >
          <option value="all">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="live">Live</option>
          <option value="paused">Paused</option>
          <option value="ended">Ended</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2.5 font-medium">Exam</th>
              <th className="px-3 py-2.5 font-medium">Paper</th>
              <th className="px-3 py-2.5 font-medium">Duration</th>
              <th className="px-3 py-2.5 font-medium">Window</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Published</th>
              <th className="px-3 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Loading MCQ exams…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No MCQ exams yet. Create one to get started.
                </td>
              </tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2.5">
                  <p className="font-medium text-foreground">{e.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[e.subjectName, e.standardName, e.batchName]
                      .filter(Boolean)
                      .join(" · ") || "Unassigned"}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-foreground">{e.paperTitle ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {e.totalQuestions} q · {e.totalMarks} marks
                  </p>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                  {e.durationMinutes} min
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {e.windowStart
                    ? new Date(e.windowStart).toLocaleString()
                    : "—"}
                  {e.windowEnd && (
                    <>
                      <br />→ {new Date(e.windowEnd).toLocaleString()}
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <LiveStatusChip status={e.liveStatus} />
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {e.status === "draft" ? (
                    <span className="text-slate-500">Draft</span>
                  ) : (
                    <span className="text-emerald-600 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Published
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <RowMenu
                    exam={e}
                    onEdit={() =>
                      navigate(`${base}/exams/mcq-exams/${e.id}/edit`)
                    }
                    onMonitor={() =>
                      navigate(`${base}/exams/mcq-exams/${e.id}/monitor`)
                    }
                    onPublishToggle={() => togglePublish(e)}
                    onLive={(s, l) => setLive(e, s, l)}
                    onRelease={() => setReleaseTarget(e)}
                    onDelete={() => setDeleteTarget(e)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmations */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this MCQ exam?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}", every attempt, answer and event log will
              be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!releaseTarget}
        onOpenChange={(o) => !o && setReleaseTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release results to students?</AlertDialogTitle>
            <AlertDialogDescription>
              "{releaseTarget?.title}" results will be visible to every student
              immediately. Scheduled-release exams will unlock now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={releaseResults}>
              Release
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const RowMenu = ({
  exam,
  onEdit,
  onMonitor,
  onPublishToggle,
  onLive,
  onRelease,
  onDelete,
}: {
  exam: McqExam;
  onEdit: () => void;
  onMonitor: () => void;
  onPublishToggle: () => void;
  onLive: (s: LiveStatus, label: string) => void;
  onRelease: () => void;
  onDelete: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-7 w-7">
        <MoreVertical className="w-4 h-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
        Exam
      </DropdownMenuLabel>
      <ProtectedMenuItem action="exam.mcq.edit" onClick={onEdit}>
        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit exam
      </ProtectedMenuItem>
      <DropdownMenuItem onClick={onMonitor}>
        <Eye className="w-3.5 h-3.5 mr-2" /> Monitor / Analytics
      </DropdownMenuItem>

      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
        Publish
      </DropdownMenuLabel>
      <ProtectedMenuItem
        action="exam.mcq.exam_publish"
        onClick={onPublishToggle}
      >
        {exam.status === "draft" ? (
          <>
            <Send className="w-3.5 h-3.5 mr-2" /> Publish
          </>
        ) : (
          <>
            <Square className="w-3.5 h-3.5 mr-2" /> Unpublish
          </>
        )}
      </ProtectedMenuItem>

      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
        Live control
      </DropdownMenuLabel>
      {exam.liveStatus === "not_started" && (
        <ProtectedMenuItem
          action="exam.mcq.exam_monitor"
          className="text-emerald-600"
          onClick={() => onLive("live", "Exam started")}
        >
          <Play className="w-3.5 h-3.5 mr-2" /> Start exam
        </ProtectedMenuItem>
      )}
      {exam.liveStatus === "live" && (
        <>
          <ProtectedMenuItem
            action="exam.mcq.exam_monitor"
            onClick={() => onLive("paused", "Exam paused")}
          >
            <Pause className="w-3.5 h-3.5 mr-2" /> Pause exam
          </ProtectedMenuItem>
          <ProtectedMenuItem
            action="exam.mcq.exam_monitor"
            className="text-rose-600"
            onClick={() => onLive("ended", "Exam ended")}
          >
            <Square className="w-3.5 h-3.5 mr-2" /> End exam
          </ProtectedMenuItem>
        </>
      )}
      {exam.liveStatus === "paused" && (
        <>
          <ProtectedMenuItem
            action="exam.mcq.exam_monitor"
            className="text-emerald-600"
            onClick={() => onLive("live", "Exam resumed")}
          >
            <Play className="w-3.5 h-3.5 mr-2" /> Resume
          </ProtectedMenuItem>
          <ProtectedMenuItem
            action="exam.mcq.exam_monitor"
            className="text-rose-600"
            onClick={() => onLive("ended", "Exam ended")}
          >
            <Square className="w-3.5 h-3.5 mr-2" /> End exam
          </ProtectedMenuItem>
        </>
      )}

      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
        Results
      </DropdownMenuLabel>
      <ProtectedMenuItem
        action="exam.mcq.exam_results"
        onClick={onRelease}
        disabled={exam.resultsPublished}
      >
        <Trophy className="w-3.5 h-3.5 mr-2" />
        {exam.resultsPublished ? "Results released" : "Release results"}
      </ProtectedMenuItem>

      <DropdownMenuSeparator />
      <ProtectedMenuItem
        action="exam.mcq.exam_delete"
        className="text-rose-600"
        onClick={onDelete}
      >
        Delete exam
      </ProtectedMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const Tile = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "blue" | "amber" | "green" | "slate";
}) => {
  const cls = {
    default: "text-foreground",
    blue: "text-blue-600",
    amber: "text-amber-600",
    green: "text-emerald-600",
    slate: "text-slate-600",
  }[tone];
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`text-2xl font-display font-semibold mt-1 ${cls}`}>
        {value}
      </p>
    </div>
  );
};

export default ManageMcqExamPage;
