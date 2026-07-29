import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Radio,
  TimerOff,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type {
  ClassMonitorBoard,
  MonitorCard,
  StaffComplianceRow,
} from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// The realtime class board (Phase 4). Cards tick locally every second so the
// elapsed / remaining timers move smoothly between the one-minute data refetches
// — the query itself is what keeps the underlying statuses honest.
// ─────────────────────────────────────────────────────────────────────────────

const fmtDuration = (mins: number): string => {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
};

const label = (c: MonitorCard): string =>
  [c.schedule.standardName, c.schedule.sectionName].filter(Boolean).join(" ") || "Class";

/** One live card — green dot, running timer, remaining time, attendance state. */
const LiveCard: React.FC<{ card: MonitorCard; tick: number }> = ({ card, tick }) => {
  // `tick` re-renders the card each second; elapsed/remaining are re-derived
  // from the card's own baseline so they stay aligned with the server data.
  const elapsed = card.elapsedMinutes + tick / 60;
  const remaining = Math.max(0, card.remainingMinutes - tick / 60);
  const total = elapsed + remaining;
  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Badge className="bg-emerald-500/20 text-emerald-600 gap-1">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          LIVE
        </Badge>
        {card.delayMinutes > 0 && (
          <Badge variant="outline" className="text-amber-600">
            Late {card.delayMinutes}m
          </Badge>
        )}
      </div>
      <div>
        <p className="font-medium text-sm">{label(card)}</p>
        <p className="text-xs text-muted-foreground">
          {card.schedule.teacherName ?? "—"} · {card.schedule.subjectName ?? "—"}
        </p>
      </div>
      <Progress value={total > 0 ? (elapsed / total) * 100 : 0} className="h-1.5" />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <span className="text-muted-foreground">
          Started {card.schedule.startedAt?.slice(11, 16) ?? card.schedule.startTime}
        </span>
        <span className="text-right text-muted-foreground">Ends {card.expectedEnd}</span>
        <span className="font-medium">Elapsed {fmtDuration(elapsed)}</span>
        <span className="text-right font-medium">Left {fmtDuration(remaining)}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-3 w-3" /> {card.studentCount} students
        </span>
        <Badge
          variant="outline"
          className={card.attendancePending ? "text-amber-600" : "text-emerald-600"}
        >
          {card.attendancePending ? "Attendance pending" : "Attendance ✓"}
        </Badge>
      </div>
    </div>
  );
};

const SimpleRow: React.FC<{ card: MonitorCard; right?: React.ReactNode }> = ({ card, right }) => (
  <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{label(card)}</p>
      <p className="truncate text-xs text-muted-foreground">
        {card.schedule.startTime}–{card.schedule.endTime} · {card.schedule.teacherName ?? "—"} ·{" "}
        {card.schedule.subjectName ?? "—"}
      </p>
    </div>
    <div className="shrink-0">{right}</div>
  </div>
);

const Kpi: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: string;
}> = ({ icon, label: l, value, tone }) => (
  <Card>
    <CardContent className="flex items-center gap-3 py-3">
      <div className={`rounded-md p-2 ${tone ?? "bg-primary/10 text-primary"}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{l}</p>
      </div>
    </CardContent>
  </Card>
);

/**
 * Who ran their classes properly today.
 *
 * The board above answers "what is happening"; this answers "who did what they
 * were supposed to". Sorted worst-first — the whole value of the panel is that
 * the person who needs a nudge is the first name on it.
 */
const StaffCompliancePanel: React.FC<{ rows: StaffComplianceRow[] }> = ({ rows }) => {
  if (rows.length === 0) return null;
  const tone = (p: number) =>
    p >= 100 ? "text-emerald-600" : p >= 60 ? "text-amber-600" : "text-rose-600";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="h-4 w-4" /> Staff start / complete ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Counted against classes whose end time has already passed — an afternoon class
          isn't overdue in the morning.
        </p>
        {rows.map((r) => (
          <div
            key={r.teacherId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.teacherName ?? "—"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.total} class{r.total === 1 ? "" : "es"} · started {r.started} · ended{" "}
                {r.completed} · attendance {r.attendanceSubmitted}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {r.notStarted > 0 && (
                <Badge variant="outline" className="text-amber-600">
                  {r.notStarted} not started
                </Badge>
              )}
              {r.notEnded > 0 && (
                <Badge variant="outline" className="text-rose-600">
                  {r.notEnded} not ended
                </Badge>
              )}
              <Badge variant="outline" className={tone(r.compliancePct)}>
                {r.due === 0 ? "nothing due yet" : `${r.compliancePct}%`}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

interface Props {
  board?: ClassMonitorBoard;
  isLoading?: boolean;
}

export const LiveClassBoard: React.FC<Props> = ({ board, isLoading }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // Reset the local second-counter whenever fresh data lands.
  useEffect(() => setTick(0), [board]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading live board…</p>;
  if (!board) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={<Radio className="h-4 w-4" />} label="Live now" value={board.live.length}
          tone="bg-emerald-500/10 text-emerald-600" />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Upcoming" value={board.upcoming.length} />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={board.completed.length}
          tone="bg-sky-500/10 text-sky-600" />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Not started" value={board.notStarted.length}
          tone="bg-amber-500/10 text-amber-600" />
        <Kpi icon={<TimerOff className="h-4 w-4" />} label="Not ended" value={board.notEnded.length}
          tone="bg-rose-500/10 text-rose-600" />
        <Kpi icon={<ClipboardList className="h-4 w-4" />} label="Attendance pending"
          value={board.attendancePending.length} tone="bg-amber-500/10 text-amber-600" />
        <Kpi icon={<XCircle className="h-4 w-4" />} label="Cancelled" value={board.cancelled.length}
          tone="bg-rose-500/10 text-rose-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi icon={<Clock className="h-4 w-4" />} label="Average delay"
          value={`${board.averageDelayMinutes} min`} />
        <Kpi icon={<Users className="h-4 w-4" />} label="Faculty utilisation"
          value={`${board.facultyUtilisationPct}%`} />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Class utilisation"
          value={`${board.classUtilisationPct}%`} />
      </div>

      {board.live.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Live classes ({board.live.length})</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {board.live.map((c) => (
              <LiveCard key={c.schedule.id} card={c} tick={tick} />
            ))}
          </CardContent>
        </Card>
      )}

      {board.notStarted.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-600">
              <AlertTriangle className="h-4 w-4" /> Faculty not started ({board.notStarted.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {board.notStarted.map((c) => (
              <SimpleRow
                key={c.schedule.id}
                card={c}
                right={
                  <Badge variant="outline" className="text-amber-600">
                    {c.delayMinutes} min late
                  </Badge>
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

      {board.notEnded.length > 0 && (
        <Card className="border-rose-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-rose-600">
              <TimerOff className="h-4 w-4" /> Started but not ended ({board.notEnded.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              These classes are still running past their scheduled end. Teaching hours keep
              accruing until the staff member presses End or submits attendance.
            </p>
            {board.notEnded.map((c) => (
              <SimpleRow
                key={c.schedule.id}
                card={c}
                right={
                  <Badge variant="outline" className="text-rose-600">
                    {fmtDuration(c.overrunMinutes)} over
                  </Badge>
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

      <StaffCompliancePanel rows={board.staffCompliance} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Upcoming ({board.upcoming.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {board.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing left today.</p>
            ) : (
              board.upcoming.map((c) => (
                <SimpleRow
                  key={c.schedule.id}
                  card={c}
                  right={<Badge variant="secondary">{c.schedule.mode}</Badge>}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Completed ({board.completed.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {board.completed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes completed yet.</p>
            ) : (
              board.completed.map((c) => (
                <SimpleRow
                  key={c.schedule.id}
                  card={c}
                  right={
                    <Badge
                      variant="outline"
                      className={c.attendancePending ? "text-amber-600" : "text-emerald-600"}
                    >
                      {c.attendancePending ? "Attendance pending" : "Done"}
                    </Badge>
                  }
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LiveClassBoard;
