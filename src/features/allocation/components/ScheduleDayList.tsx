// ──────────────────────────────────────────────────────────────────────────────
// SCHEDULE DAY LIST
//
// ┌── WHY THIS REPLACED THE FLAT LIST ─────────────────────────────────────┐
// │ The classes were never out of order — the schedule service has always  │
// │ ordered by `schedule_date, start_time`. They READ as scattered because │
// │ the list was flat and undifferentiated: forty rows with no day breaks, │
// │ and the date buried mid-sentence in a small muted line that also       │
// │ carried mode, room, student count and timestamps.                      │
// │                                                                        │
// │   Ravi Kumar  [scheduled]                                              │
// │   2026-08-12 · 09:00–10:00 (1.0h) · Std 4 / A / Maths · offline …      │
// │   Ravi Kumar  [scheduled]                                              │
// │   2026-08-12 · 10:00–11:00 (1.0h) · Std 2 / B / English · offline …    │
// │                                                                        │
// │ Nothing there tells the eye where one day ends. So: day headings, and  │
// │ the TIME promoted to its own fixed column, because on a timetable the  │
// │ time is what you scan down.                                            │
// └────────────────────────────────────────────────────────────────────────┘
//
// RESPONSIVE: the time column sits left on `sm` and above; below that it moves
// above the class details so nothing is squeezed into ~90px on a phone.
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import { CalendarX2, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  classTitle, durationLabel, formatDay, groupByDay, timeRangeLabel, todayIso,
} from "../utils/scheduleView";
import type { ClassSchedule, ScheduleStatus } from "../types/allocation.types";

const STATUS_TONE: Record<ScheduleStatus, string> = {
  scheduled: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  in_progress: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400",
  missed: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rescheduled: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

interface Props {
  schedules: ClassSchedule[];
  isLoading?: boolean;
  /** Shown when there is nothing in the selected range. */
  emptyTitle?: string;
  emptyHint?: string;
  /** Row actions, rendered at the end of each row. */
  renderActions?: (c: ClassSchedule) => React.ReactNode;
  /** Extra detail under the title — student counts, teacher name, timings. */
  renderMeta?: (c: ClassSchedule) => React.ReactNode;
  onRowClick?: (c: ClassSchedule) => void;
}

export const ScheduleDayList: React.FC<Props> = ({
  schedules, isLoading, emptyTitle = "No classes in this range",
  emptyHint, renderActions, renderMeta, onRowClick,
}) => {
  const today = todayIso();
  const groups = React.useMemo(() => groupByDay(schedules, today), [schedules, today]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <CalendarX2 className="mx-auto h-6 w-6 text-muted-foreground/60" />
        <p className="mt-2 text-sm font-medium">{emptyTitle}</p>
        {emptyHint && <p className="mt-1 text-sm text-muted-foreground">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.date}>
          {/* Sticky so the day stays visible while scrolling a long list —
              the whole point of grouping is lost if the heading scrolls away
              and you are back to guessing which day you are looking at. */}
          <header
            className={cn(
              "sticky top-0 z-10 -mx-1 mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md bg-background/95 px-1 py-1.5 backdrop-blur",
              g.isPast && "opacity-70",
            )}
          >
            <h3
              className={cn(
                "text-sm font-semibold",
                g.isToday && "text-primary",
              )}
            >
              {g.heading}
            </h3>
            <span className="text-xs text-muted-foreground">{g.subheading}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {g.items.length} class{g.items.length === 1 ? "" : "es"}
              {g.totalMinutes > 0 && ` · ${durationLabel(g.totalMinutes)}`}
            </span>
          </header>

          <div className="space-y-1.5">
            {g.items.map((c) => (
              <div
                key={c.id}
                onClick={onRowClick ? () => onRowClick(c) : undefined}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5 transition-colors sm:flex-row sm:items-center sm:gap-3",
                  c.status === "cancelled" && "opacity-60",
                  c.status === "in_progress" && "border-emerald-500/50 bg-emerald-500/5",
                  onRowClick && "cursor-pointer hover:bg-accent/40",
                )}
              >
                {/* Time first and fixed-width, so the column aligns down the
                    day and can be scanned without reading the rows. */}
                <div className="flex shrink-0 items-baseline gap-2 sm:w-[140px] sm:flex-col sm:items-start sm:gap-0.5">
                  <span className="text-sm font-medium tabular-nums">
                    {timeRangeLabel(c.startTime, c.endTime)}
                  </span>
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <span>{durationLabel(c.durationMinutes)}</span>
                    {c.scheduleDate && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-foreground/75">{formatDay(c.scheduleDate)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{classTitle(c)}</span>
                    {c.isExtra && (
                      <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                        Extra
                      </Badge>
                    )}
                    {c.status === "in_progress" ? (
                      <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <Radio className="h-3 w-3" /> Live
                      </Badge>
                    ) : (
                      <Badge className={STATUS_TONE[c.status] ?? "bg-muted"}>{c.status}</Badge>
                    )}
                    {c.lateMinutes > 0 && (
                      <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                        {c.lateMinutes}m late
                      </Badge>
                    )}
                    {c.attendanceSubmitted && (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        Attendance ✓
                      </Badge>
                    )}
                  </div>
                  {renderMeta && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{renderMeta(c)}</div>
                  )}
                </div>

                {renderActions && (
                  <div
                    className="flex shrink-0 flex-wrap items-center gap-0.5"
                    // Row actions must not also trigger the row's own click.
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderActions(c)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
