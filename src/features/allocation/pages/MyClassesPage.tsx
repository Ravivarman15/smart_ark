import React, { useMemo, useState } from "react";
import {
  CalendarClock,
  Clock,
  Zap,
  CheckCircle2,
  GraduationCap,
  ClipboardList,
  Wallet,
  TrendingUp,
  Radio,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMySchedule, useMyTeachingHours, useMyWorkload } from "../hooks";
import { ClassAttendanceDialog } from "../components/ClassAttendanceDialog";
import { ClassLifecycleActions } from "../components/ClassLifecycleActions";
import type { ClassSchedule } from "../types/allocation.types";

const todayIso = () => new Date().toISOString().slice(0, 10);

const monthRange = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
};

const Row: React.FC<{ c: ClassSchedule }> = ({ c }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">
          {[c.standardName, c.sectionName, c.subjectName].filter(Boolean).join(" / ") || "Class"}
        </span>
        {c.isExtra && <Badge variant="outline" className="text-amber-500">Extra</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">
        {c.scheduleDate} · {c.startTime}–{c.endTime} · {(c.durationMinutes / 60).toFixed(1)}h · {c.mode}
        {c.room ? ` · ${c.room}` : ""}
        {c.meetingLink ? " · online" : ""}
        {/* The lifecycle, on the history rows too — "completed" alone never
            said whether the class was actually run or just marked off. */}
        {c.startedAt ? ` · started ${c.startedAt.slice(11, 16)}` : ""}
        {c.completedAt ? ` · ended ${c.completedAt.slice(11, 16)}` : ""}
        {c.actualMinutes != null ? ` · actual ${(c.actualMinutes / 60).toFixed(1)}h` : ""}
      </p>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      {c.attendanceSubmitted && (
        <Badge className="bg-emerald-500/15 text-emerald-500">attendance ✓</Badge>
      )}
      {c.status === "in_progress" ? (
        <Badge className="bg-emerald-500/15 text-emerald-600 gap-1">
          <Radio className="h-3 w-3" /> LIVE
        </Badge>
      ) : (
        <Badge variant="secondary">{c.status}</Badge>
      )}
    </div>
  </div>
);

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}> = ({ icon, label, value, note }) => (
  <Card>
    <CardContent className="flex items-center gap-3 py-4">
      <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
      <div>
        <p className="text-lg font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {note && <p className="text-xs text-emerald-600">{note}</p>}
      </div>
    </CardContent>
  </Card>
);

const MyClassesPage: React.FC = () => {
  const today = todayIso();
  const { from, to } = useMemo(monthRange, []);
  const { data: all = [], isLoading } = useMySchedule({ from, to });
  const { data: hours } = useMyTeachingHours(from, to);
  const { data: workload } = useMyWorkload(from, to);

  const todays = all.filter((c) => c.scheduleDate === today && c.status !== "cancelled");
  const upcoming = all.filter((c) => c.scheduleDate > today && c.status === "scheduled");
  const completed = all.filter((c) => c.status === "completed");
  const extra = all.filter((c) => c.isExtra);

  const fmtHrs = (mins = 0) => `${(mins / 60).toFixed(1)}h`;

  const [attClass, setAttClass] = useState<ClassSchedule | null>(null);
  const attendancePending = todays.filter(
    (c) => (c.status === "scheduled" || c.status === "in_progress") && !c.attendanceSubmitted,
  );
  // Started and not yet ended. Teaching hours only accrue on End, so this is
  // the teacher's own copy of the flag the coordinator's board raises.
  const running = todays.filter((c) => c.status === "in_progress");

  const inr = (n = 0) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <CalendarClock className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">My Classes</h1>
          <p className="text-sm text-muted-foreground">Your timetable and teaching hours this month.</p>
        </div>
      </div>

      {/* Salary / teaching-hours summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Teaching hours" value={fmtHrs(hours?.totalMinutes)} />
        <StatCard icon={<Zap className="h-5 w-5" />} label="Extra hours" value={fmtHrs(hours?.extraMinutes)} />
        {/* A class you have started is neither taught nor upcoming until you
            press End — say so rather than letting the hours quietly vanish. */}
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Upcoming hours"
          value={fmtHrs(hours?.scheduledMinutes)}
          note={
            hours?.inProgressCount
              ? `${fmtHrs(hours.inProgressMinutes)} in class now`
              : undefined
          }
        />
        <StatCard icon={<GraduationCap className="h-5 w-5" />} label="Completed classes" value={String(hours?.completedCount ?? 0)} />
      </div>

      {/* Workload + earnings (Phase 6). Projected from the hourly rate configured
          in Payroll — the payroll run stays the source of truth for actual pay. */}
      {workload && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="Today"
            value={fmtHrs(workload.todayMinutes)}
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="This week"
            value={fmtHrs(workload.weekMinutes)}
          />
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="Earned this month"
            value={inr(workload.salaryEarned)}
          />
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="Expected (allocated)"
            value={inr(workload.expectedSalary)}
          />
        </div>
      )}

      {running.length > 0 && (
        <Card className="border-emerald-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-emerald-600">
              <Radio className="h-4 w-4" /> In class now ({running.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Press <strong>End</strong> when you finish — your teaching hours are banked at that
            moment, and your coordinator's board keeps showing the class as live until you do.
          </CardContent>
        </Card>
      )}

      {attendancePending.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-600">
              <ClipboardList className="h-4 w-4" /> Attendance Pending ({attendancePending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Submit attendance for today's classes below to complete them and update your hours.
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today ({todays.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
          <TabsTrigger value="extra">Extra ({extra.length})</TabsTrigger>
        </TabsList>

        {/* Today — with lifecycle actions */}
        <TabsContent value="today" className="space-y-2 pt-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : todays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes today.</p>
          ) : (
            todays.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {[c.standardName, c.sectionName, c.subjectName].filter(Boolean).join(" / ") || "Class"}
                    </span>
                    {c.isExtra && <Badge variant="outline" className="text-amber-500">Extra</Badge>}
                    {c.status === "in_progress" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 gap-1">
                        <Radio className="h-3 w-3" /> LIVE
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{c.status}</Badge>
                    )}
                    {c.lateMinutes > 0 && (
                      <Badge variant="outline" className="text-amber-600">
                        started {c.lateMinutes}m late
                      </Badge>
                    )}
                    {c.attendanceSubmitted && (
                      <Badge className="bg-emerald-500/15 text-emerald-500">attendance ✓</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.startTime}–{c.endTime} · {(c.durationMinutes / 60).toFixed(1)}h · {c.mode}
                    {c.room ? ` · ${c.room}` : ""}
                    {c.startedAt ? ` · started ${c.startedAt.slice(11, 16)}` : ""}
                    {c.completedAt ? ` · ended ${c.completedAt.slice(11, 16)}` : ""}
                    {c.actualMinutes != null
                      ? ` · actual ${(c.actualMinutes / 60).toFixed(1)}h`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0">
                  <ClassLifecycleActions schedule={c} onAttendance={setAttClass} />
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {(
          [
            ["upcoming", upcoming],
            ["completed", completed],
            ["extra", extra],
          ] as const
        ).map(([key, list]) => (
          <TabsContent key={key} value={key} className="space-y-2 pt-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here.</p>
            ) : (
              list.map((c) => <Row key={c.id} c={c} />)
            )}
          </TabsContent>
        ))}
      </Tabs>

      <ClassAttendanceDialog
        schedule={attClass}
        open={!!attClass}
        onOpenChange={(v) => !v && setAttClass(null)}
      />
    </div>
  );
};

export default MyClassesPage;
