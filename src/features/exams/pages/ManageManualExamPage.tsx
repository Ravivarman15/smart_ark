import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  MoreVertical,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  ExamAnalyticsDialog,
  ExamStatusChip,
  MarksEntryDialog,
  ResultsStatusChip,
} from "../components";
import {
  useDeleteExam,
  useExamOverview,
  useExams,
  useRescheduleExam,
  useSetResultsStatus,
} from "../hooks";
import { examAnalyticsService } from "../services";
import { EXAM_TYPES, type Exam, type ExamStatus } from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Manage Manual Exam — the hub: overview tiles, exam table, and every lifecycle
// action (edit, reschedule, marks entry, publish/lock, analytics, export,
// delete). All data + mutations go through the exam hooks; RBAC gates each
// action via ProtectedMenuItem.
// ─────────────────────────────────────────────────────────────────────────────

const examTypeLabel = (t: string) =>
  EXAM_TYPES.find((x) => x.value === t)?.label ?? t;

const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const ManageManualExamPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.startsWith("/management") ? "/management" : "/admin";

  const { data: exams = [], isLoading, error } = useExams({ mode: "manual" });
  const { data: overview } = useExamOverview();
  const deleteMut = useDeleteExam();
  const resultsMut = useSetResultsStatus();
  const rescheduleMut = useRescheduleExam();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExamStatus | "all">("all");

  const [marksExam, setMarksExam] = useState<Exam | null>(null);
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [rescheduleExam, setRescheduleExam] = useState<Exam | null>(null);
  const [reForm, setReForm] = useState({
    examDate: "",
    startTime: "",
    endTime: "",
    hall: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);

  const migrationNeeded =
    !!error &&
    /exams|schema cache|does not exist/i.test(
      error instanceof Error ? error.message : String(error),
    );

  const filtered = useMemo(
    () =>
      exams.filter((e) => {
        if (statusFilter !== "all" && e.status !== statusFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const hay = [e.title, e.subjectName, e.batchName, e.standardName]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [exams, search, statusFilter],
  );

  const openReschedule = (e: Exam) => {
    setRescheduleExam(e);
    setReForm({
      examDate: e.examDate ?? "",
      startTime: e.startTime ?? "",
      endTime: e.endTime ?? "",
      hall: e.hall ?? "",
    });
  };

  const saveReschedule = async () => {
    if (!rescheduleExam || !reForm.examDate)
      return toast.error("Pick a new date");
    try {
      await rescheduleMut.mutateAsync({
        id: rescheduleExam.id,
        input: reForm,
      });
      toast.success("Exam rescheduled");
      setRescheduleExam(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reschedule");
    }
  };

  const setResults = async (
    e: Exam,
    status: "pending" | "published" | "locked",
    label: string,
  ) => {
    try {
      await resultsMut.mutateAsync({ id: e.id, status });
      toast.success(label);
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

  const handleExport = async (e: Exam) => {
    try {
      const a = await examAnalyticsService.forExam(e.id);
      if (a.scored.length === 0) return toast.info("No marks to export yet");
      const header = "Rank,Student,Marks,Percentage,Grade,Result";
      const lines = a.scored
        .slice()
        .sort((x, y) => (x.rank ?? 9999) - (y.rank ?? 9999))
        .map(
          (r) =>
            `${r.rank ?? ""},"${(r.studentName ?? "").replace(/"/g, "''")}",` +
            `${r.isAbsent ? "AB" : r.marks ?? ""},` +
            `${r.isAbsent ? "" : r.percentage},${r.grade ?? ""},` +
            `${r.isAbsent ? "Absent" : r.passed ? "Pass" : "Fail"}`,
        );
      downloadCsv(`${e.title}-results.csv`, [header, ...lines].join("\n"));
      toast.success("Results exported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            Manage Manual Exam
          </h1>
          <p className="text-sm text-muted-foreground">
            Schedule exams, enter marks, publish results and review analytics.
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => navigate(`${base}/exams/manual/create`)}
        >
          <Plus className="w-4 h-4" /> Create Exam
        </Button>
      </header>

      {migrationNeeded && (
        <div className="rounded-lg border border-yellow-300/60 bg-yellow-50/40 text-yellow-800 p-4 text-sm">
          <p className="font-semibold">Database migration required</p>
          <p className="mt-0.5">
            Run <code>20260522_exam_module.sql</code> in the Supabase SQL editor,
            then refresh.
          </p>
        </div>
      )}

      {/* Overview tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Total Exams" value={overview?.total ?? 0} />
        <Tile label="Upcoming" value={overview?.upcoming ?? 0} tone="blue" />
        <Tile
          label="Results Pending"
          value={overview?.resultsPending ?? 0}
          tone="amber"
        />
        <Tile
          label="Published"
          value={overview?.resultsPublished ?? 0}
          tone="green"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, subject, batch…"
            className="pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ExamStatus | "all")}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm sm:w-44"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2.5 font-medium">Exam</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Batch / Standard</th>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Results</th>
              <th className="px-3 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Loading exams…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No exams found. Create one to get started.
                </td>
              </tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2.5">
                  <p className="font-medium text-foreground">{e.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {e.subjectName ?? "—"} · {e.totalMarks} marks
                  </p>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {examTypeLabel(e.examType)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {e.batchName ?? e.standardName ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                  {e.examDate ?? "—"}
                  {e.startTime ? ` · ${e.startTime}` : ""}
                </td>
                <td className="px-3 py-2.5">
                  <ExamStatusChip status={e.status} />
                </td>
                <td className="px-3 py-2.5">
                  <ResultsStatusChip status={e.resultsStatus} />
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
                        Exam
                      </DropdownMenuLabel>
                      <ProtectedMenuItem
                        action="exam.edit"
                        onClick={() =>
                          navigate(`${base}/exams/manual/${e.id}/edit`)
                        }
                      >
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit exam
                      </ProtectedMenuItem>
                      <ProtectedMenuItem
                        action="exam.edit"
                        onClick={() => openReschedule(e)}
                      >
                        <CalendarClock className="w-3.5 h-3.5 mr-2" /> Reschedule
                      </ProtectedMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
                        Results
                      </DropdownMenuLabel>
                      <ProtectedMenuItem
                        action="exam.marks_entry"
                        onClick={() => setMarksExam(e)}
                      >
                        <ClipboardList className="w-3.5 h-3.5 mr-2" /> Marks entry
                      </ProtectedMenuItem>
                      <DropdownMenuItem onClick={() => setAnalyticsId(e.id)}>
                        <BarChart3 className="w-3.5 h-3.5 mr-2" /> Analytics
                      </DropdownMenuItem>
                      <ProtectedMenuItem
                        action="exam.export"
                        onClick={() => handleExport(e)}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 mr-2" /> Export CSV
                      </ProtectedMenuItem>
                      {e.resultsStatus === "pending" && (
                        <ProtectedMenuItem
                          action="exam.marks_publish"
                          className="text-emerald-600"
                          onClick={() =>
                            setResults(e, "published", "Results published")
                          }
                        >
                          Publish results
                        </ProtectedMenuItem>
                      )}
                      {e.resultsStatus === "published" && (
                        <>
                          <ProtectedMenuItem
                            action="exam.marks_publish"
                            onClick={() =>
                              setResults(e, "pending", "Results unpublished")
                            }
                          >
                            Unpublish results
                          </ProtectedMenuItem>
                          <ProtectedMenuItem
                            action="exam.results_lock"
                            className="text-indigo-600"
                            onClick={() =>
                              setResults(e, "locked", "Results locked")
                            }
                          >
                            Lock results
                          </ProtectedMenuItem>
                        </>
                      )}
                      {e.resultsStatus === "locked" && (
                        <ProtectedMenuItem
                          action="exam.results_lock"
                          onClick={() =>
                            setResults(e, "published", "Results unlocked")
                          }
                        >
                          Unlock results
                        </ProtectedMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <ProtectedMenuItem
                        action="exam.delete"
                        className="text-rose-600"
                        onClick={() => setDeleteTarget(e)}
                      >
                        Delete exam
                      </ProtectedMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialogs */}
      <MarksEntryDialog
        exam={marksExam}
        onOpenChange={(o) => !o && setMarksExam(null)}
      />
      <ExamAnalyticsDialog
        examId={analyticsId}
        onOpenChange={(o) => !o && setAnalyticsId(null)}
      />

      {/* Reschedule */}
      <Dialog
        open={!!rescheduleExam}
        onOpenChange={(o) => !o && setRescheduleExam(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule — {rescheduleExam?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs font-medium space-y-1 block">
                <span>Date</span>
                <Input
                  type="date"
                  value={reForm.examDate}
                  onChange={(e) =>
                    setReForm({ ...reForm, examDate: e.target.value })
                  }
                />
              </label>
              <label className="text-xs font-medium space-y-1 block">
                <span>Start</span>
                <Input
                  type="time"
                  value={reForm.startTime}
                  onChange={(e) =>
                    setReForm({ ...reForm, startTime: e.target.value })
                  }
                />
              </label>
              <label className="text-xs font-medium space-y-1 block">
                <span>End</span>
                <Input
                  type="time"
                  value={reForm.endTime}
                  onChange={(e) =>
                    setReForm({ ...reForm, endTime: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="text-xs font-medium space-y-1 block">
              <span>Hall / Room</span>
              <Input
                value={reForm.hall}
                onChange={(e) => setReForm({ ...reForm, hall: e.target.value })}
              />
            </label>
            <Button
              className="w-full"
              onClick={saveReschedule}
              disabled={rescheduleMut.isPending}
            >
              {rescheduleMut.isPending ? "Saving…" : "Save Schedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this exam?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" and all its recorded marks will be
              permanently removed. This cannot be undone.
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

export default ManageManualExamPage;
