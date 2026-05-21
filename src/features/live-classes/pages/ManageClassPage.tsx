import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  MoreVertical,
  PlaySquare,
  RadioTower,
  Search,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  LiveClassPageShell,
  LiveClassStatusBadge,
  StatTile,
  type Column,
} from "../components";
import { computeStats, formatClassDate, formatTimeRange, liveStatusFor } from "../utils/helpers";
import { useLiveClasses } from "../hooks/useLiveClasses";
import {
  useCancelClass,
  useCompleteClass,
  useDeleteLiveClass,
  useRescheduleClass,
  useSetClassStatus,
} from "../hooks/useLiveClassMutations";
import {
  useLiveClassAttendance,
  useSaveLiveAttendance,
} from "../hooks/useLiveClassAttendance";
import { useLiveClassMessages, useRetryMessage } from "../hooks/useLiveClassMessages";
import type { LiveClass, LiveClassStatus } from "../types/liveClass.types";

type DialogMode = "reschedule" | "complete" | "cancel" | null;

const ManageClassPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const addPath = `${location.pathname.replace(/\/$/, "")}/add`;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LiveClassStatus | "all">("all");

  const { data: classes = [], isLoading } = useLiveClasses({
    status: statusFilter,
    search: search || undefined,
  });
  const stats = useMemo(() => computeStats(classes), [classes]);

  const deleteMut = useDeleteLiveClass();
  const rescheduleMut = useRescheduleClass();
  const completeMut = useCompleteClass();
  const cancelMut = useCancelClass();
  const setStatusMut = useSetClassStatus();

  // ── Dialog state ───────────────────────────────────────────────────────────
  const [target, setTarget] = useState<LiveClass | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<LiveClass | null>(null);
  const [consoleClass, setConsoleClass] = useState<LiveClass | null>(null);

  const [rDate, setRDate] = useState("");
  const [rStart, setRStart] = useState("");
  const [rEnd, setREnd] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [classNotes, setClassNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const openDialog = (cls: LiveClass, mode: DialogMode) => {
    setTarget(cls);
    setDialogMode(mode);
    setRDate(cls.startDate);
    setRStart(cls.startTime);
    setREnd(cls.endTime);
    setRecordingUrl(cls.recordingUrl ?? "");
    setClassNotes(cls.classNotes ?? "");
    setCancelReason("");
  };

  const closeDialog = () => {
    setDialogMode(null);
    setTarget(null);
  };

  const confirmDialog = () => {
    if (!target) return;
    if (dialogMode === "reschedule") {
      rescheduleMut.mutate(
        { id: target.id, startDate: rDate, startTime: rStart, endTime: rEnd },
        {
          onSuccess: () => {
            toast.success("Class rescheduled — students will be re-notified");
            closeDialog();
          },
          onError: (e) => toast.error(e.message),
        }
      );
    } else if (dialogMode === "complete") {
      completeMut.mutate(
        { id: target.id, recordingUrl: recordingUrl || undefined, classNotes: classNotes || undefined },
        {
          onSuccess: () => {
            toast.success("Class marked completed");
            closeDialog();
          },
          onError: (e) => toast.error(e.message),
        }
      );
    } else if (dialogMode === "cancel") {
      if (cancelReason.trim().length < 3) {
        toast.error("Please give a short cancellation reason");
        return;
      }
      cancelMut.mutate(
        { id: target.id, reason: cancelReason.trim() },
        {
          onSuccess: () => {
            toast.success("Class cancelled — pending alerts withdrawn");
            closeDialog();
          },
          onError: (e) => toast.error(e.message),
        }
      );
    }
  };

  const dialogBusy =
    rescheduleMut.isPending || completeMut.isPending || cancelMut.isPending;

  const columns: Column<LiveClass>[] = [
    {
      key: "title",
      header: "Class",
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{c.title}</p>
          <p className="text-xs text-muted-foreground">
            {c.subjectName || "—"} · {c.teacherName || "Unassigned"}
          </p>
        </div>
      ),
    },
    {
      key: "audience",
      header: "Audience",
      cell: (c) => (
        <div className="text-xs">
          <p className="text-foreground">{c.standardName || "—"}</p>
          <p className="text-muted-foreground truncate max-w-[180px]">
            {c.assignType === "standard"
              ? "Entire standard"
              : c.batchNames.join(", ") || "No batches"}
          </p>
        </div>
      ),
    },
    {
      key: "when",
      header: "Date & Time",
      cell: (c) => (
        <div className="text-xs">
          <p className="text-foreground">{formatClassDate(c.startDate)}</p>
          <p className="text-muted-foreground">{formatTimeRange(c.startTime, c.endTime)}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => <LiveClassStatusBadge status={liveStatusFor(c)} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`${addPath}?id=${c.id}`)}>
              Edit class
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConsoleClass(c)}>
              Attendance &amp; alerts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openDialog(c, "reschedule")}>
              Reschedule
            </DropdownMenuItem>
            {liveStatusFor(c) !== "ongoing" && c.status !== "cancelled" && (
              <DropdownMenuItem onClick={() => setStatusMut.mutate({ id: c.id, status: "ongoing" })}>
                Mark ongoing
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => openDialog(c, "complete")}>
              Mark completed
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-amber-600"
              onClick={() => openDialog(c, "cancel")}
            >
              Cancel class
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setDeleteTarget(c)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <LiveClassPageShell
      title="Manage Live Classes"
      description="Schedule, reschedule, track attendance and monitor WhatsApp delivery."
      icon={<RadioTower className="w-5 h-5" />}
      primaryAction={{ label: "Add Class", onClick: () => navigate(addPath) }}
      toolbar={
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search classes…"
              className="h-9 w-56 pl-8"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as LiveClassStatus | "all")}
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="ongoing">Ongoing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label="Total" value={stats.total} icon={<RadioTower className="w-4 h-4" />} />
        <StatTile label="Upcoming" value={stats.upcoming} tone="accent" icon={<CalendarClock className="w-4 h-4" />} />
        <StatTile label="Ongoing" value={stats.ongoing} tone="warning" icon={<PlaySquare className="w-4 h-4" />} />
        <StatTile label="Completed" value={stats.completed} tone="positive" icon={<CheckCircle2 className="w-4 h-4" />} />
      </div>

      <DataTable
        columns={columns}
        rows={classes}
        rowKey={(c) => c.id}
        loading={isLoading}
        empty={
          <EmptyState
            icon={<RadioTower className="w-5 h-5" />}
            title="No live classes yet"
            description="Schedule your first online class to get started."
            action={{ label: "Add Class", onClick: () => navigate(addPath) }}
          />
        }
      />

      {/* Reschedule / Complete / Cancel dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "reschedule" && "Reschedule Class"}
              {dialogMode === "complete" && "Complete Class"}
              {dialogMode === "cancel" && "Cancel Class"}
            </DialogTitle>
            <DialogDescription>{target?.title}</DialogDescription>
          </DialogHeader>

          {dialogMode === "reschedule" && (
            <div className="space-y-3">
              <Input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="time" value={rStart} onChange={(e) => setRStart(e.target.value)} />
                <Input type="time" value={rEnd} onChange={(e) => setREnd(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Assigned students get a fresh WhatsApp alert with the new time.
              </p>
            </div>
          )}
          {dialogMode === "complete" && (
            <div className="space-y-3">
              <Input
                value={recordingUrl}
                onChange={(e) => setRecordingUrl(e.target.value)}
                placeholder="Recording URL (optional)"
              />
              <Textarea
                value={classNotes}
                onChange={(e) => setClassNotes(e.target.value)}
                placeholder="Class notes (optional)"
                rows={4}
              />
            </div>
          )}
          {dialogMode === "cancel" && (
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation"
              rows={3}
            />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Close
            </Button>
            <Button onClick={confirmDialog} disabled={dialogBusy}>
              {dialogBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete this live class?"
        description="The class, its batch assignment and attendance records will be removed."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget)
            deleteMut.mutate(deleteTarget.id, {
              onSuccess: () => toast.success("Live class deleted"),
              onError: (e) => toast.error(e.message),
            });
          setDeleteTarget(null);
        }}
      />

      {consoleClass && (
        <ClassConsoleSheet
          liveClass={consoleClass}
          onClose={() => setConsoleClass(null)}
        />
      )}
    </LiveClassPageShell>
  );
};

// ── Attendance + notification console ─────────────────────────────────────────
const ATT_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "joined", label: "Joined" },
  { value: "absent", label: "Absent" },
  { value: "not_joined", label: "Not joined" },
];

const ClassConsoleSheet = ({
  liveClass,
  onClose,
}: {
  liveClass: LiveClass;
  onClose: () => void;
}) => {
  const { data: roster = [], isLoading } = useLiveClassAttendance(liveClass);
  const { data: messages = [] } = useLiveClassMessages(liveClass.id);
  const saveMut = useSaveLiveAttendance();
  const retryMut = useRetryMessage(liveClass.id);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const statusOf = (studentId: string, fallback: string) =>
    draft[studentId] ?? fallback;

  const save = () => {
    const rows = roster.map((r) => ({
      studentId: r.studentId,
      status: statusOf(r.studentId, r.status),
    }));
    saveMut.mutate(
      { liveClassId: liveClass.id, rows },
      {
        onSuccess: () => toast.success("Attendance saved"),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-display">{liveClass.title}</SheetTitle>
          <SheetDescription>
            {formatClassDate(liveClass.startDate)} ·{" "}
            {formatTimeRange(liveClass.startTime, liveClass.endTime)}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="attendance" className="flex-1 flex flex-col mt-3 overflow-hidden">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="attendance">
              <Users className="w-4 h-4 mr-1.5" /> Attendance
            </TabsTrigger>
            <TabsTrigger value="alerts">
              <Send className="w-4 h-4 mr-1.5" /> WhatsApp ({messages.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="flex-1 overflow-y-auto space-y-2 mt-3">
            {isLoading && (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading roster…</p>
            )}
            {!isLoading && roster.length === 0 && (
              <EmptyState title="No students assigned" />
            )}
            {roster.map((r) => (
              <div
                key={r.studentId}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
              >
                <span className="text-sm truncate">{r.studentName}</span>
                <Select
                  value={statusOf(r.studentId, r.status)}
                  onValueChange={(v) => setDraft((d) => ({ ...d, [r.studentId]: v }))}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ATT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {roster.length > 0 && (
              <Button className="w-full mt-2" onClick={save} disabled={saveMut.isPending}>
                {saveMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Attendance
              </Button>
            )}
          </TabsContent>

          <TabsContent value="alerts" className="flex-1 overflow-y-auto space-y-2 mt-3">
            {messages.length === 0 && (
              <EmptyState
                icon={<Send className="w-5 h-5" />}
                title="No messages queued"
                description="WhatsApp alerts are queued automatically when a class is created. Apply the 20260521 migration to enable the outbox."
              />
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm truncate">{m.recipientName || m.recipientPhone}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {m.status}
                    {m.lastError ? ` · ${m.lastError}` : ""}
                  </p>
                </div>
                {m.status === "failed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retryMut.mutate(m.id)}
                  >
                    Retry
                  </Button>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

export default ManageClassPage;
