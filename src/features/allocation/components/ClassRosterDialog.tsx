import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ClassRosterPicker } from "./ClassRosterPicker";
import { classLabel } from "../utils/scheduleView";
import { batchByStandard, effectivePlan } from "../utils/standardPlan";
import { useAssignedStudents, useSetClassRoster } from "../hooks/useClassStudents";
import type { ClassSchedule } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Edit an existing class's roster.
//
// A roster that can only be set at creation is a roster nobody can fix — a
// student joins, a student leaves, and the teacher's sheet is wrong for the
// rest of the term. Same picker as the scheduling dialog, seeded with who is
// already assigned rather than re-selecting everyone.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  schedule: ClassSchedule | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export const ClassRosterDialog: React.FC<Props> = ({ schedule, open, onOpenChange }) => {
  const { data: assigned = [], isLoading } = useAssignedStudents(open ? schedule?.id : undefined);
  const setRoster = useSetClassRoster();
  const [selected, setSelected] = useState<string[]>([]);
  const [seed, setSeed] = useState<string[] | undefined>();

  // Re-seed per class. Without resetting, reopening on a different class would
  // hand the picker the previous class's selection.
  useEffect(() => {
    if (!open) return;
    setSeed(undefined);
    setSelected([]);
  }, [open, schedule?.id]);

  useEffect(() => {
    if (open && !isLoading) setSeed(assigned.map((a) => a.studentId));
  }, [open, isLoading, assigned]);

  const save = async () => {
    if (!schedule) return;
    try {
      await setRoster.mutateAsync({ classScheduleIds: [schedule.id], studentIds: selected });
      toast.success(
        selected.length > 0
          ? `${selected.length} student(s) assigned to this class`
          : "Roster cleared — the class falls back to its batch",
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the roster");
    }
  };

  const standardIds = schedule?.standardIds?.length
    ? schedule.standardIds
    : schedule?.standardId
      ? [schedule.standardId]
      : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Students — {schedule ? classLabel(schedule, " / ") : "Class"}
          </DialogTitle>
        </DialogHeader>

        {isLoading || seed === undefined ? (
          <p className="py-6 text-sm text-muted-foreground">Loading the roster…</p>
        ) : (
          <ClassRosterPicker
            standardIds={standardIds}
            batchId={schedule?.batchId}
            // A stored split class narrows each standard by its own batch.
            // Without this the class-wide `batchId` — which is only the
            // PRIMARY standard's batch — would empty out every other standard.
            batchByStandard={
              schedule ? batchByStandard(effectivePlan(schedule)) : undefined
            }
            value={selected}
            onChange={setSelected}
            initialSelection={seed}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={setRoster.isPending || seed === undefined}>
            Save roster
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClassRosterDialog;
