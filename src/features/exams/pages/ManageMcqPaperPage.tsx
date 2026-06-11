import { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Copy,
  Eye,
  FileText,
  History,
  MoreVertical,
  Pencil,
  Plus,
  Search,
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
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedMenuItem } from "@/features/rbac";
import {
  PaperAnalyticsDialog,
  PaperPreviewDialog,
  PaperStatusChip,
  PaperVersionHistoryDialog,
} from "../components";
import {
  useClonePaper,
  useDeletePaper,
  useMcqPaperOverview,
  useMcqPapers,
  useSetPaperStatus,
} from "../hooks";
import { canManagePaper, complexityLabel } from "../utils";
import type { McqPaper, McqPaperStatus } from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// Manage MCQ Paper — the hub: overview tiles, paper table and every lifecycle
// action (edit, clone, publish, archive, preview, analytics, version history,
// delete). RBAC gates each action; ownership (canManagePaper) additionally
// restricts edit/delete so teachers only manage their own papers.
// ─────────────────────────────────────────────────────────────────────────────
const ManageMcqPaperPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const base = pathname.startsWith("/management") ? "/management" : "/admin";

  const { data: papers = [], isLoading, error: fetchError } = useMcqPapers();
  const { data: overview } = useMcqPaperOverview();
  const deleteMut = useDeletePaper();
  const cloneMut = useClonePaper();
  const statusMut = useSetPaperStatus();

  // Surface fetch errors so users see a toast instead of a misleading empty state.
  useEffect(() => {
    if (fetchError) {
      console.error("[ManageMcqPaperPage] fetch error:", fetchError);
      toast.error(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load MCQ papers"
      );
    }
  }, [fetchError]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<McqPaperStatus | "all">(
    "all",
  );
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [versionsId, setVersionsId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McqPaper | null>(null);

  const migrationNeeded =
    !!fetchError &&
    /mcq_papers|schema cache|does not exist/i.test(
      fetchError instanceof Error ? fetchError.message : String(fetchError),
    );

  const filtered = useMemo(
    () =>
      papers.filter((p) => {
        if (statusFilter !== "all" && p.status !== statusFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const hay = [p.title, p.subjectName, p.standardName]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [papers, search, statusFilter],
  );

  const setStatus = async (
    p: McqPaper,
    status: McqPaperStatus,
    label: string,
  ) => {
    try {
      await statusMut.mutateAsync({ id: p.id, status });
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleClone = async (p: McqPaper) => {
    try {
      await cloneMut.mutateAsync(p.id);
      toast.success(`"${p.title}" cloned`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success("Paper deleted");
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
            Manage MCQ Paper
          </h1>
          <p className="text-sm text-muted-foreground">
            Build, clone, version and analyse MCQ papers from the question bank.
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => navigate(`${base}/exams/mcq-papers/create`)}
        >
          <Plus className="w-4 h-4" /> Create Paper
        </Button>
      </header>

      {migrationNeeded && (
        <div className="rounded-lg border border-yellow-300/60 bg-yellow-50/40 text-yellow-800 p-4 text-sm">
          <p className="font-semibold">Database migration required</p>
          <p className="mt-0.5">
            Run <code>20260523_mcq_paper_module.sql</code> in the Supabase SQL
            editor, then refresh.
          </p>
        </div>
      )}

      {/* Overview tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Total Papers" value={overview?.totalPapers ?? 0} />
        <Tile
          label="Published"
          value={overview?.published ?? 0}
          tone="green"
        />
        <Tile label="Drafts" value={overview?.draft ?? 0} tone="amber" />
        <Tile
          label="Bank Questions"
          value={overview?.bankQuestions ?? 0}
          tone="blue"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, subject, standard…"
            className="pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as McqPaperStatus | "all")
          }
          className="bg-background border border-border rounded-md px-3 py-2 text-sm sm:w-44"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2.5 font-medium">Paper</th>
              <th className="px-3 py-2.5 font-medium">Subject / Standard</th>
              <th className="px-3 py-2.5 font-medium">Questions</th>
              <th className="px-3 py-2.5 font-medium">Marks</th>
              <th className="px-3 py-2.5 font-medium">Difficulty</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
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
                  Loading papers…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No papers found. Create one to get started.
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const mine = canManagePaper(p, user ?? {});
              return (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-foreground">{p.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.durationMinutes} min · v{p.version}
                      {p.generationMode === "auto" ? " · auto" : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {[p.subjectName, p.standardName].filter(Boolean).join(" · ") ||
                      "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {p.totalQuestions}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {p.totalMarks}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">
                    {p.difficultyScore > 0
                      ? `${p.difficultyScore} · ${complexityLabel(
                          p.difficultyScore,
                        )}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <PaperStatusChip status={p.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
                          Paper
                        </DropdownMenuLabel>
                        {mine && (
                          <ProtectedMenuItem
                            action="exam.mcq.paper_edit"
                            onClick={() =>
                              navigate(
                                `${base}/exams/mcq-papers/${p.id}/edit`,
                              )
                            }
                          >
                            <Pencil className="w-3.5 h-3.5 mr-2" /> Edit paper
                          </ProtectedMenuItem>
                        )}
                        <ProtectedMenuItem
                          action="exam.mcq.paper_create"
                          onClick={() => handleClone(p)}
                        >
                          <Copy className="w-3.5 h-3.5 mr-2" /> Clone paper
                        </ProtectedMenuItem>
                        <DropdownMenuItem onClick={() => setPreviewId(p.id)}>
                          <Eye className="w-3.5 h-3.5 mr-2" /> Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAnalyticsId(p.id)}>
                          <BarChart3 className="w-3.5 h-3.5 mr-2" /> Analytics
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setVersionsId(p.id)}>
                          <History className="w-3.5 h-3.5 mr-2" /> Version
                          history
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
                          Lifecycle
                        </DropdownMenuLabel>
                        {p.status === "draft" && (
                          <ProtectedMenuItem
                            action="exam.mcq.paper_edit"
                            className="text-emerald-600"
                            onClick={() =>
                              setStatus(p, "published", "Paper published")
                            }
                          >
                            Publish paper
                          </ProtectedMenuItem>
                        )}
                        {p.status === "published" && (
                          <ProtectedMenuItem
                            action="exam.mcq.paper_edit"
                            onClick={() =>
                              setStatus(p, "draft", "Paper moved to draft")
                            }
                          >
                            Unpublish
                          </ProtectedMenuItem>
                        )}
                        {p.status !== "archived" ? (
                          <ProtectedMenuItem
                            action="exam.mcq.paper_edit"
                            onClick={() =>
                              setStatus(p, "archived", "Paper archived")
                            }
                          >
                            <Archive className="w-3.5 h-3.5 mr-2" /> Archive
                          </ProtectedMenuItem>
                        ) : (
                          <ProtectedMenuItem
                            action="exam.mcq.paper_edit"
                            onClick={() =>
                              setStatus(p, "draft", "Paper restored")
                            }
                          >
                            <ArchiveRestore className="w-3.5 h-3.5 mr-2" />{" "}
                            Restore
                          </ProtectedMenuItem>
                        )}
                        {mine && (
                          <>
                            <DropdownMenuSeparator />
                            <ProtectedMenuItem
                              action="exam.mcq.paper_delete"
                              className="text-rose-600"
                              onClick={() => setDeleteTarget(p)}
                            >
                              Delete paper
                            </ProtectedMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Dialogs */}
      <PaperAnalyticsDialog
        paperId={analyticsId}
        onOpenChange={(o) => !o && setAnalyticsId(null)}
      />
      <PaperPreviewDialog
        paperId={previewId}
        onOpenChange={(o) => !o && setPreviewId(null)}
      />
      <PaperVersionHistoryDialog
        paperId={versionsId}
        onOpenChange={(o) => !o && setVersionsId(null)}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this paper?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" and its question layout will be
              permanently removed. The bank questions themselves are kept. This
              cannot be undone.
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
    </div>
  );
};

const Tile = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "blue" | "amber" | "green";
}) => {
  const cls = {
    default: "text-foreground",
    blue: "text-blue-600",
    amber: "text-amber-600",
    green: "text-emerald-600",
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

export default ManageMcqPaperPage;
