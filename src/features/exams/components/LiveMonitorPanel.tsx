import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Unlock,
  UserX,
  WifiOff,
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
import { AttemptStatusChip } from "./McqExamBadges";
import {
  useAttemptEvents,
  useForceSubmitAttempt,
  useMcqExamMonitor,
  useReopenAttempt,
} from "../hooks";
import type { AttemptEvent, MonitorRow } from "../types/mcqExam.types";

interface Props {
  examId: string;
}

const fmtAge = (s: number): string => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
};

// ─────────────────────────────────────────────────────────────────────────────
// LiveMonitorPanel — staff-side live view of a running MCQ exam.
//
// Polls the monitor snapshot (every 8 s via `useMcqExamMonitor`). For each
// attempt, surfaces status, heartbeat freshness (the "disconnected" badge),
// flag count + answered count, and the staff control surface: force-submit,
// reopen, and a per-attempt event drawer (anti-cheat trail). The actual poll
// cadence and the data shape come from the analytics service — this is the
// presentation layer.
// ─────────────────────────────────────────────────────────────────────────────
export const LiveMonitorPanel = ({ examId }: Props) => {
  const { data, isLoading, error, refetch, isFetching } =
    useMcqExamMonitor(examId);
  const forceSubmit = useForceSubmitAttempt();
  const reopen = useReopenAttempt();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "active" | "completed" | "disconnected" | "flagged"
  >("all");
  const [eventsFor, setEventsFor] = useState<MonitorRow | null>(null);
  const [forceTarget, setForceTarget] = useState<MonitorRow | null>(null);
  const [reopenTarget, setReopenTarget] = useState<MonitorRow | null>(null);

  const rows = useMemo<MonitorRow[]>(() => {
    const all = data?.rows ?? [];
    return all
      .filter((r) => {
        if (filter === "active") return r.status === "in_progress" && !r.isDisconnected;
        if (filter === "completed")
          return r.status === "submitted" || r.status === "auto_submitted";
        if (filter === "disconnected") return r.isDisconnected;
        if (filter === "flagged") return r.flagsCount > 0;
        return true;
      })
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          r.studentName.toLowerCase().includes(q) ||
          (r.batchName ?? "").toLowerCase().includes(q)
        );
      });
  }, [data?.rows, filter, search]);

  const onForce = async () => {
    if (!forceTarget) return;
    try {
      await forceSubmit.mutateAsync(forceTarget.attemptId);
      toast.success(`${forceTarget.studentName}'s attempt force-submitted`);
      setForceTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const onReopen = async () => {
    if (!reopenTarget) return;
    try {
      await reopen.mutateAsync(reopenTarget.attemptId);
      toast.success(`${reopenTarget.studentName}'s attempt reopened`);
      setReopenTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-rose-300/60 bg-rose-50/40 text-rose-700 p-4">
        Failed to load monitor data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <StatTile
          label="Active"
          value={data?.active ?? 0}
          tone="green"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <StatTile
          label="Completed"
          value={data?.completed ?? 0}
          tone="blue"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <StatTile
          label="Disconnected"
          value={data?.disconnected ?? 0}
          tone="amber"
          icon={<WifiOff className="w-4 h-4" />}
        />
        <StatTile
          label="Not started"
          value={data?.notStarted ?? 0}
          tone="slate"
          icon={<UserX className="w-4 h-4" />}
        />
        <StatTile
          label="Flagged"
          value={data?.flagged ?? 0}
          tone="rose"
          icon={<ShieldAlert className="w-4 h-4" />}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student or batch…"
          className="md:max-w-xs"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm md:w-44"
        >
          <option value="all">All attempts</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="disconnected">Disconnected</option>
          <option value="flagged">Flagged</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-1.5"
          disabled={isFetching}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2.5 font-medium">Student</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Answered</th>
              <th className="px-3 py-2.5 font-medium">Heartbeat</th>
              <th className="px-3 py-2.5 font-medium">Flags</th>
              <th className="px-3 py-2.5 font-medium">Score</th>
              <th className="px-3 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading monitor…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No attempts match the filter.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.attemptId}
                className="hover:bg-muted/20 transition-colors"
              >
                <td className="px-3 py-2.5">
                  <p className="font-medium text-foreground">{r.studentName}</p>
                  {r.batchName && (
                    <p className="text-[11px] text-muted-foreground">
                      {r.batchName}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col gap-1">
                    <AttemptStatusChip status={r.status} />
                    {r.isDisconnected && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-medium">
                        <WifiOff className="w-3 h-3" /> Offline
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                  {r.answeredCount}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {r.status === "in_progress"
                    ? `${fmtAge(Math.max(0, r.staleSeconds))} ago`
                    : "—"}
                </td>
                <td className="px-3 py-2.5">
                  {r.flagsCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertTriangle className="w-3 h-3" /> {r.flagsCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                  {r.percentage != null ? `${r.percentage.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEventsFor(r)}
                      className="h-7 px-2"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {r.status === "in_progress" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setForceTarget(r)}
                        className="h-7 px-2 text-xs"
                      >
                        Force submit
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReopenTarget(r)}
                        className="h-7 px-2 text-xs"
                      >
                        <Unlock className="w-3.5 h-3.5 mr-1" /> Reopen
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Event drawer */}
      <EventDrawer
        row={eventsFor}
        onClose={() => setEventsFor(null)}
      />

      {/* Force submit confirm */}
      <AlertDialog
        open={!!forceTarget}
        onOpenChange={(o) => !o && setForceTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force-submit attempt?</AlertDialogTitle>
            <AlertDialogDescription>
              {forceTarget?.studentName}'s attempt will be scored using whatever
              answers are already saved. This action is logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onForce}>
              Force submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen confirm */}
      <AlertDialog
        open={!!reopenTarget}
        onOpenChange={(o) => !o && setReopenTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen this attempt?</AlertDialogTitle>
            <AlertDialogDescription>
              {reopenTarget?.studentName}'s attempt will be moved back to
              in-progress. They can continue from where they left off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onReopen}>Reopen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const EventDrawer = ({
  row,
  onClose,
}: {
  row: MonitorRow | null;
  onClose: () => void;
}) => {
  const { data: events = [], isLoading } = useAttemptEvents(row?.attemptId ?? null);
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{row?.studentName} — activity log</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto space-y-1.5">
          {isLoading && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
              Loading events…
            </div>
          )}
          {!isLoading && events.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No events recorded yet.
            </p>
          )}
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const EventRow = ({ event }: { event: AttemptEvent }) => {
  const tone =
    event.severity === "critical"
      ? "border-rose-200 bg-rose-50/50 text-rose-800"
      : event.severity === "warning"
        ? "border-amber-200 bg-amber-50/50 text-amber-800"
        : "border-border/40 bg-card/40 text-foreground";
  return (
    <div className={`rounded-md border px-2.5 py-1.5 text-xs ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{event.eventType.replace(/_/g, " ")}</span>
        <span className="text-[10px] opacity-70 tabular-nums">
          {new Date(event.createdAt).toLocaleTimeString()}
        </span>
      </div>
      {event.detail && <p className="opacity-80 mt-0.5">{event.detail}</p>}
    </div>
  );
};

const StatTile = ({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "green" | "blue" | "amber" | "slate" | "rose";
  icon: React.ReactNode;
}) => {
  const cls = {
    green: "text-emerald-600 bg-emerald-50 border-emerald-200",
    blue: "text-blue-600 bg-blue-50 border-blue-200",
    amber: "text-amber-600 bg-amber-50 border-amber-200",
    slate: "text-slate-600 bg-slate-50 border-slate-200",
    rose: "text-rose-600 bg-rose-50 border-rose-200",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-display font-semibold mt-1">{value}</p>
    </div>
  );
};
