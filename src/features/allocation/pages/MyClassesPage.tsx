import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  useMinuteClock,
  useMySchedule,
  useMyTeachingHours,
  useMyWorkload,
} from "../hooks";
import { ClassAttendanceDialog } from "../components/ClassAttendanceDialog";
import { ClassLifecycleActions } from "../components/ClassLifecycleActions";
import { ScheduleRangeBar } from "../components/ScheduleRangeBar";
import { ScheduleDayList } from "../components/ScheduleDayList";
import { attendanceDueIn } from "../services/classReminder.service";
import { resolveRange, todayIso, type RangePreset } from "../utils/scheduleView";
import type { ClassSchedule } from "../types/allocation.types";

/**
 * Current month, in LOCAL time.
 *
 * The previous version routed local midnight through `toISOString()`, which is
 * UTC — in IST, 1 Aug 00:00 local is 31 Jul 18:30Z, so every "this month"
 * window was off by a day at both ends and the stat cards silently counted the
 * wrong classes. See utils/scheduleView.ts for the full note.
 */
const monthRange = () => {
  const r = resolveRange("month");
  return { from: r.from!, to: r.to! };
};

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
  const nowMinutes = useMinuteClock();
  // The stat cards are monthly by definition and stay that way; only the
  // timetable list below follows the range filter.
  const { from, to } = useMemo(monthRange, []);
  const { data: hours } = useMyTeachingHours(from, to);
  const { data: workload } = useMyWorkload(from, to);

  const [preset, setPreset] = useState<RangePreset>("today");
  const [pickedDate, setPickedDate] = useState(today);
  const [extraOnly, setExtraOnly] = useState(false);
  const range = useMemo(() => resolveRange(preset, pickedDate), [preset, pickedDate]);

  const { data: all = [], isLoading } = useMySchedule({ from: range.from, to: range.to });
  const visible = useMemo(
    () => (extraOnly ? all.filter((c) => c.isExtra) : all),
    [all, extraOnly],
  );

  // Today's classes drive the banners, which must keep reporting on TODAY
  // regardless of which range the teacher is browsing — a reminder that
  // disappears because you clicked "This week" is a reminder that failed.
  const { data: todaySchedules = [] } = useMySchedule({ from: today, to: today });
  const todays = todaySchedules.filter((c) => c.status !== "cancelled");

  const fmtHrs = (mins = 0) => `${(mins / 60).toFixed(1)}h`;

  const [attClass, setAttClass] = useState<ClassSchedule | null>(null);
  const attendancePending = todays.filter(
    (c) => (c.status === "scheduled" || c.status === "in_progress") && !c.attendanceSubmitted,
  );
  // Started and not yet ended. Teaching hours only accrue on End, so this is
  // the teacher's own copy of the flag the coordinator's board raises.
  const running = todays.filter((c) => c.status === "in_progress");
  // The last ten minutes of a class whose sheet is still blank. Same rule the
  // reminder sweep uses, so the banner and the WhatsApp alert never disagree.
  const dueNow = todays
    .map((c) => ({ c, left: attendanceDueIn(c, nowMinutes) }))
    .filter((x): x is { c: ClassSchedule; left: number } => x.left !== null)
    .sort((a, b) => a.left - b.left);

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

      {dueNow.length > 0 && (
        <Card className="border-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-600">
              <AlertTriangle className="h-4 w-4" /> Attendance due now ({dueNow.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            {dueNow.map(({ c, left }) => (
              <p key={c.id}>
                <strong>
                  {[c.standardName, c.subjectName].filter(Boolean).join(" / ") || "Class"}
                </strong>{" "}
                ({c.startTime}–{c.endTime}) — <strong>{left} min left</strong> to submit
                attendance before the class ends.
              </p>
            ))}
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

      {/* ── Timetable ────────────────────────────────────────────────────────
          One list with a range filter, rather than four tabs. The tabs split
          the same day across "Today" and "Extra", so a teacher with an extra
          class had to check two places to know what their morning looked
          like. Grouped by day, ordered by start time, defaulting to today. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {range.label} · {visible.length} class{visible.length === 1 ? "" : "es"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScheduleRangeBar
            preset={preset}
            date={pickedDate}
            onPreset={setPreset}
            onDate={(d) => { setPickedDate(d); setPreset("date"); }}
          >
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={extraOnly}
                onCheckedChange={(v) => setExtraOnly(Boolean(v))}
              />
              Extra classes only
            </label>
          </ScheduleRangeBar>

          <ScheduleDayList
            schedules={visible}
            isLoading={isLoading}
            emptyTitle={`No classes ${range.label.toLowerCase()}`}
            emptyHint="Switch to This week or All to see the rest of your timetable."
            renderMeta={(c) => (
              <>
                {c.mode}
                {c.room ? ` · ${c.room}` : ""}
                {c.meetingLink ? " · online" : ""}
                {c.scheduleDate ? ` · ${c.scheduleDate}` : ""}
                {/* The lifecycle, on history rows too — "completed" alone never
                    said whether the class was actually run or just marked off. */}
                {c.startedAt ? ` · started ${c.startedAt.slice(11, 16)}` : ""}
                {c.completedAt ? ` · ended ${c.completedAt.slice(11, 16)}` : ""}
                {c.actualMinutes != null
                  ? ` · actual ${(c.actualMinutes / 60).toFixed(1)}h`
                  : ""}
              </>
            )}
            renderActions={(c) => (
              <ClassLifecycleActions schedule={c} onAttendance={setAttClass} />
            )}
          />
        </CardContent>
      </Card>

      <ClassAttendanceDialog
        schedule={attClass}
        open={!!attClass}
        onOpenChange={(v) => !v && setAttClass(null)}
      />
    </div>
  );
};

export default MyClassesPage;
