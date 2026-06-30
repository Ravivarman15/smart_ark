import { useEffect, useMemo, useState } from "react";
import { Loader2, Wand2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAutoAssignByClass, useClassAssignmentPlan } from "../hooks";
import { formatINR } from "../utils";
import type { ClassAssignmentChoice } from "../services";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Auto-assign fees by class — matches every fee-less student to the fee
 * structure defined for their standard and creates all the `student_fees` rows
 * in one action. Classes with several structures let the operator pick which
 * one; classes with no structure (or students with no class) are reported and
 * skipped. Existing fee records are never touched.
 */
export const AutoAssignFeesDialog = ({ open, onOpenChange }: Props) => {
  const { data: plan, isLoading } = useClassAssignmentPlan(open);
  const autoAssign = useAutoAssignByClass();

  // standardId → chosen structureId (defaults to the first structure per class).
  const [picked, setPicked] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!plan) return;
    setPicked((prev) => {
      const next = { ...prev };
      for (const row of plan.rows) {
        if (row.structures.length > 0 && !next[row.standardId]) {
          next[row.standardId] = row.structures[0].id;
        }
      }
      return next;
    });
  }, [plan]);

  const { choices, totalStudents } = useMemo(() => {
    const out: ClassAssignmentChoice[] = [];
    let total = 0;
    for (const row of plan?.rows ?? []) {
      const structure = row.structures.find((s) => s.id === picked[row.standardId]);
      if (structure) {
        out.push({ standardId: row.standardId, structure });
        total += row.studentCount;
      }
    }
    return { choices: out, totalStudents: total };
  }, [plan, picked]);

  const confirm = async () => {
    if (choices.length === 0) return;
    await autoAssign.mutateAsync(choices);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4" /> Auto-Assign Fees by Class
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Every student without a fee record is matched to the fee structure for their class —
          e.g. a 9th-std student gets the 9th-std fee. Students who already have a fee record are
          skipped.
        </p>

        <div className="flex-1 overflow-y-auto rounded-lg border border-border/50 min-h-[10rem]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Building plan…
            </div>
          ) : !plan || plan.rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No students are waiting for a fee record by class.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Class</th>
                  <th className="px-4 py-2.5 text-left font-medium">Students</th>
                  <th className="px-4 py-2.5 text-left font-medium">Fee structure to apply</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {plan.rows.map((row) => {
                  return (
                    <tr key={row.standardId} className="hover:bg-muted/10">
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {row.standardName}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.studentCount}</td>
                      <td className="px-4 py-2.5">
                        {row.structures.length === 0 ? (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="w-3 h-3" /> No structure for this class —
                            skipped
                          </span>
                        ) : row.structures.length === 1 ? (
                          <span className="text-foreground">
                            {row.structures[0].name}{" "}
                            <span className="text-muted-foreground">
                              ({formatINR(row.structures[0].totalAmount)})
                            </span>
                          </span>
                        ) : (
                          <select
                            value={picked[row.standardId] ?? ""}
                            onChange={(e) =>
                              setPicked((p) => ({ ...p, [row.standardId]: e.target.value }))
                            }
                            className="bg-background border border-border rounded-md px-2 py-1.5 text-sm w-full"
                          >
                            {row.structures.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({formatINR(s.totalAmount)})
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!!plan?.studentsWithoutClass && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5" />
            {plan.studentsWithoutClass} student{plan.studentsWithoutClass === 1 ? "" : "s"} have no
            class set — assign them manually from a fee structure's “Assign” button.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={totalStudents === 0 || autoAssign.isPending}>
            {autoAssign.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Assigning…
              </>
            ) : (
              `Assign fees to ${totalStudents} student${totalStudents === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
