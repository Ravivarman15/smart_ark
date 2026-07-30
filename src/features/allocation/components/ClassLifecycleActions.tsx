import React from "react";
import { Check, ClipboardList, Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useScheduleOps } from "../hooks";
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
// Shared by My Classes and the teacher dashboard so the lifecycle exists once:
// the mutations, the toasts and the enable/disable rules all live here.
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

  const started = !!c.startedAt || c.status === "in_progress";
  const ended = c.status === "completed";
  const canStart = c.status === "scheduled";
  const canEnd = c.status === "in_progress";

  const handleStart = async () => {
    try {
      await ops.start.mutateAsync(c.id);
      toast.success("Class started — you're live");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start");
    }
  };

  const handleEnd = async () => {
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

  const size = compact ? "h-8 rounded-lg px-2.5 text-xs" : undefined;
  const done = "border-emerald-500/40 text-emerald-600 disabled:opacity-100";
  const icon = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className={cn(size, started && done)}
        disabled={!canStart || ops.start.isPending}
        onClick={handleStart}
        title={started ? `Started at ${hhmm(c.startedAt)}` : "Start this class"}
      >
        {ops.start.isPending && canStart ? (
          <Loader2 className={cn(icon, "mr-1 animate-spin")} />
        ) : started ? (
          <Check className={cn(icon, "mr-1")} />
        ) : (
          <Play className={cn(icon, "mr-1")} />
        )}
        {started ? `Started${c.startedAt ? ` ${hhmm(c.startedAt)}` : ""}` : "Start"}
      </Button>

      <Button
        size="sm"
        variant="outline"
        className={cn(size, ended && done)}
        disabled={!canEnd || ops.complete.isPending}
        onClick={handleEnd}
        title={
          ended
            ? `Ended at ${hhmm(c.completedAt)}`
            : canEnd
              ? "End this class and bank the teaching hours"
              : "Start the class before you can complete it"
        }
      >
        {ops.complete.isPending && canEnd ? (
          <Loader2 className={cn(icon, "mr-1 animate-spin")} />
        ) : ended ? (
          <Check className={cn(icon, "mr-1")} />
        ) : (
          <Square className={cn(icon, "mr-1")} />
        )}
        {ended ? `Ended${c.completedAt ? ` ${hhmm(c.completedAt)}` : ""}` : "End"}
      </Button>

      {/* Submitting attendance also completes the class, so once it is in there
          is nothing left to press — and re-opening it would re-notify parents. */}
      <Button
        size="sm"
        variant={c.attendanceSubmitted ? "outline" : "default"}
        className={cn(size, c.attendanceSubmitted && done)}
        disabled={c.attendanceSubmitted || c.status === "cancelled"}
        onClick={() => onAttendance(c)}
        title={c.attendanceSubmitted ? "Attendance already submitted" : "Mark attendance"}
      >
        {c.attendanceSubmitted ? (
          <Check className={cn(icon, "mr-1")} />
        ) : (
          <ClipboardList className={cn(icon, "mr-1")} />
        )}
        {c.attendanceSubmitted ? "Attendance ✓" : "Attendance"}
      </Button>
    </div>
  );
};

export default ClassLifecycleActions;
