import React from "react";
import { Check, ClipboardList, Loader2, Lock, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMinuteClock, useScheduleOps } from "../hooks";
import { attendanceDueIn } from "../services/classReminder.service";
import type { ClassSchedule } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// The three class actions a teacher performs, as ONE component.
//
// Start and End used to swap places — Start disappeared the moment it was
// pressed and End took its slot — so a teacher never saw the two steps they are
// accountable for, only whichever one was next. Both are always rendered now;
// the one that no longer applies becomes its own receipt ("Started 09:04"),
// exactly the way the Attendance button already reads "Attendance ✓" once the
// sheet is in.
//
// Spent buttons are LOCKED, not dead. A disabled button swallows the click and
// explains nothing, which is why a teacher who wasn't sure whether their press
// registered simply pressed again (the live audit trail has one who pressed
// Start five times in ninety seconds). Locked buttons still answer: "Class
// already started at 16:12."
//
// Shared by My Classes and the teacher dashboard so the lifecycle exists once:
// the mutations, the toasts and the enable/lock rules all live here.
// ─────────────────────────────────────────────────────────────────────────────

const hhmm = (iso?: string): string => (iso ? iso.slice(11, 16) : "");

interface Props {
  schedule: ClassSchedule;
  /** Opens the shared ClassAttendanceDialog for this class. */
  onAttendance: (c: ClassSchedule) => void;
  /** Denser sizing for the teacher dashboard's card list. */
  compact?: boolean;
}

export const ClassLifecycleActions: React.FC<Props> = ({
  schedule: c,
  onAttendance,
  compact,
}) => {
  const ops = useScheduleOps();
  const nowMinutes = useMinuteClock();

  const started = !!c.startedAt || c.status === "in_progress";
  const ended = c.status === "completed";
  const cancelled = c.status === "cancelled";
  const canStart = c.status === "scheduled" && !cancelled;
  const canEnd = c.status === "in_progress";
  // Minutes left to get the sheet in before the class ends — the same rule that
  // decides whether the reminder sweep messages this teacher.
  const dueIn = attendanceDueIn(c, nowMinutes);

  const handleStart = async () => {
    if (ended) {
      toast.info(`This class already ended at ${hhmm(c.completedAt) || "—"}.`);
      return;
    }
    if (started) {
      toast.info(
        `Class already started${c.startedAt ? ` at ${hhmm(c.startedAt)}` : ""} — press End when you finish.`,
      );
      return;
    }
    if (cancelled) {
      toast.error("This class was cancelled by your coordinator.");
      return;
    }
    try {
      await ops.start.mutateAsync(c.id);
      // Late is recorded, never refused — the class still happened.
      toast.success("Class started — you're live");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start");
    }
  };

  const handleEnd = async () => {
    if (ended) {
      toast.info(`Class already ended at ${hhmm(c.completedAt) || "—"}.`);
      return;
    }
    if (!canEnd) {
      // The two steps, enforced with an explanation rather than a dead button.
      toast.info("Press Start first — End only closes a class that is running.");
      return;
    }
    try {
      await ops.complete.mutateAsync(c.id);
      toast.success(
        c.attendanceSubmitted
          ? "Class ended — teaching hours updated"
          : "Class ended — remember to submit attendance",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to end the class");
    }
  };

  const handleAttendance = () => {
    if (c.attendanceSubmitted) {
      // Re-opening it would re-run the parent WhatsApp pipeline.
      toast.info("Attendance is already submitted for this class.");
      return;
    }
    if (cancelled) {
      toast.error("This class was cancelled — there is no attendance to mark.");
      return;
    }
    onAttendance(c);
  };

  const size = compact ? "h-8 rounded-lg px-2.5 text-xs" : undefined;
  const done = "border-emerald-500/40 text-emerald-600";
  const dueSoon = "bg-amber-500 text-white hover:bg-amber-600 animate-pulse";
  const icon = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className={cn(size, started && done)}
        // Never `disabled`: a locked button that explains itself is what stops
        // the repeat-pressing this screen used to invite.
        aria-disabled={!canStart}
        onClick={handleStart}
        title={
          started
            ? `Class already started${c.startedAt ? ` at ${hhmm(c.startedAt)}` : ""}`
            : "Start this class"
        }
      >
        {ops.start.isPending ? (
          <Loader2 className={cn(icon, "mr-1 animate-spin")} />
        ) : started ? (
          <Check className={cn(icon, "mr-1")} />
        ) : (
          <Play className={cn(icon, "mr-1")} />
        )}
        {started ? `Started${c.startedAt ? ` ${hhmm(c.startedAt)}` : ""}` : "Start"}
        {started && <Lock className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5", "ml-1 opacity-60")} />}
      </Button>

      <Button
        size="sm"
        variant="outline"
        className={cn(size, ended && done, !canEnd && !ended && "opacity-60")}
        aria-disabled={!canEnd}
        onClick={handleEnd}
        title={
          ended
            ? `Ended at ${hhmm(c.completedAt)}`
            : canEnd
              ? "End this class and bank the teaching hours"
              : "Start the class before you can complete it"
        }
      >
        {ops.complete.isPending ? (
          <Loader2 className={cn(icon, "mr-1 animate-spin")} />
        ) : ended ? (
          <Check className={cn(icon, "mr-1")} />
        ) : (
          <Square className={cn(icon, "mr-1")} />
        )}
        {ended ? `Ended${c.completedAt ? ` ${hhmm(c.completedAt)}` : ""}` : "End"}
        {ended && <Lock className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5", "ml-1 opacity-60")} />}
      </Button>

      {/* Submitting attendance also completes the class. Inside the last ten
          minutes the button starts counting down, because that is the window in
          which the students are still in the room to correct a wrong mark. */}
      <Button
        size="sm"
        variant={c.attendanceSubmitted ? "outline" : "default"}
        className={cn(
          size,
          c.attendanceSubmitted && done,
          !c.attendanceSubmitted && dueIn !== null && dueSoon,
        )}
        aria-disabled={c.attendanceSubmitted || cancelled}
        onClick={handleAttendance}
        title={
          c.attendanceSubmitted
            ? "Attendance already submitted"
            : dueIn !== null
              ? `Attendance is due before this class ends — ${dueIn} min left`
              : "Mark attendance"
        }
      >
        {c.attendanceSubmitted ? (
          <Check className={cn(icon, "mr-1")} />
        ) : (
          <ClipboardList className={cn(icon, "mr-1")} />
        )}
        {c.attendanceSubmitted
          ? "Attendance ✓"
          : dueIn !== null
            ? `Attendance · ${dueIn}m left`
            : "Attendance"}
      </Button>
    </div>
  );
};

export default ClassLifecycleActions;
