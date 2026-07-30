import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Radio, Users2 } from "lucide-react";
import { useMySchedule, useClassStudentCounts } from "@/features/allocation/hooks";
import { ClassAttendanceDialog } from "@/features/allocation/components/ClassAttendanceDialog";
import { ClassLifecycleActions } from "@/features/allocation/components/ClassLifecycleActions";
import { hhmmToMinutes } from "@/features/allocation/services/classMonitor.service";
import type { ClassSchedule } from "@/features/allocation/types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Today's assigned classes, on the teacher's dashboard.
//
// The dashboard used to end at the batch roster, so a class a coordinator
// scheduled was only visible if the teacher went looking for it on My Classes.
// This is the same data and the same actions (Start / End / Attendance) — the
// allocation hooks and the shared ClassAttendanceDialog, not a second copy.
// ─────────────────────────────────────────────────────────────────────────────

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const labelOf = (c: ClassSchedule): string =>
  [
    c.standardNames.length > 0 ? c.standardNames.join(" + ") : c.standardName,
    c.sectionName,
    c.subjectName,
  ]
    .filter(Boolean)
    .join(" / ") || "Class";

/** Minutes a class is past its start time with nobody having pressed Start. */
const overdueStart = (c: ClassSchedule, nowMinutes: number): number =>
  c.status === "scheduled" ? Math.max(0, nowMinutes - hhmmToMinutes(c.startTime)) : 0;

/** Minutes a still-running class is past its scheduled end. */
const overrun = (c: ClassSchedule, nowMinutes: number): number =>
  c.status === "in_progress" ? Math.max(0, nowMinutes - hhmmToMinutes(c.endTime)) : 0;

const minutesNow = (): number => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export const ClassesSection: React.FC = () => {
  const today = todayIso();
  // The nudges below are time-relative, so the section has to notice the clock
  // moving even when nothing in the data changed.
  const [nowMinutes, setNowMinutes] = useState(minutesNow);
  useEffect(() => {
    const t = setInterval(() => setNowMinutes(minutesNow()), 60_000);
    return () => clearInterval(t);
  }, []);
  const { data: all = [], isLoading } = useMySchedule({ from: today, to: today });
  const [attClass, setAttClass] = useState<ClassSchedule | null>(null);

  const classes = useMemo(
    () =>
      all
        .filter((c) => c.status !== "cancelled" && c.status !== "rescheduled")
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [all],
  );
  const { data: counts = {} } = useClassStudentCounts(
    useMemo(() => classes.map((c) => c.id), [classes]),
  );

  // A teacher with nothing scheduled gets no empty shell — the dashboard's
  // rule throughout.
  if (!isLoading && classes.length === 0) return null;

  return (
    <section id="classes" className="rounded-2xl bg-card/50 border border-border/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" /> Today's classes
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">{classes.length}</span>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your timetable…
        </p>
      ) : (
        classes.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-background/40 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-semibold text-foreground truncate">{labelOf(c)}</p>
                  {c.isExtra && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-ark-warning">
                      Extra
                    </span>
                  )}
                  {c.status === "in_progress" && (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-ark-success">
                      <Radio className="w-3 h-3" /> Live
                    </span>
                  )}
                  {c.attendanceSubmitted && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-ark-success">
                      Attendance ✓
                    </span>
                  )}
                  {/* The same two things the coordinator's board flags, shown
                      to the person who can actually fix them. */}
                  {overdueStart(c, nowMinutes) > 0 && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-ark-warning">
                      Not started · {overdueStart(c, nowMinutes)}m late
                    </span>
                  )}
                  {overrun(c, nowMinutes) > 0 && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-ark-danger">
                      {overrun(c, nowMinutes)}m over — press End
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {c.startTime}–{c.endTime} · {(c.durationMinutes / 60).toFixed(1)}h · {c.mode}
                  {c.room ? ` · ${c.room}` : ""}
                </p>
                {counts[c.id] != null && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Users2 className="w-3 h-3" />
                    {counts[c.id]} student{counts[c.id] === 1 ? "" : "s"} assigned to you
                  </p>
                )}
              </div>

              <div className="flex-shrink-0">
                <ClassLifecycleActions schedule={c} onAttendance={setAttClass} compact />
              </div>
            </div>
          </div>
        ))
      )}

      <ClassAttendanceDialog
        schedule={attClass}
        open={!!attClass}
        onOpenChange={(v) => !v && setAttClass(null)}
      />
    </section>
  );
};

export default ClassesSection;
