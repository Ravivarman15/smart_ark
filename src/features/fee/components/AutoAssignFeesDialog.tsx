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
import { useAutoAssignByBatch, useBatchAssignmentPlan } from "../hooks";
import { formatINR } from "../utils";
import type { BatchAssignmentChoice } from "../services";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Auto-assign fees by batch — matches every fee-less student to a fee structure
 * for their batch and creates all the `student_fees` rows in one action. The
 * candidate structures for a batch come from its class (standard): batches whose
 * class has several structures let the operator pick which one; batches whose
 * class has no structure (or students with no batch) are reported and skipped.
 * Existing fee records are never touched.
 */
export const AutoAssignFeesDialog = ({ open, onOpenChange }: Props) => {
  const { data: plan, isLoading } = useBatchAssignmentPlan(open);
  const autoAssign = useAutoAssignByBatch();

  // batchId → chosen structureId (defaults to the first structure per batch).
  const [picked, setPicked] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!plan) return;
    setPicked((prev) => {
      const next = { ...prev };
      for (const row of plan.rows) {
        if (row.structures.length > 0 && !next[row.batchId]) {
          next[row.batchId] = row.structures[0].id;
        }
      }
      return next;
    });
  }, [plan]);

  const { choices, totalStudents } = useMemo(() => {
    const out: BatchAssignmentChoice[] = [];
    let total = 0;
    for (const row of plan?.rows ?? []) {
      const structure = row.structures.find((s) => s.id === picked[row.batchId]);
      if (structure) {
        out.push({ batchId: row.batchId, structure });
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
            <Wand2 className="w-4 h-4" /> Auto-Assign Fees by Batch
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Every student without a fee record is matched to a fee structure for their batch — the
          candidate structures come from the batch's class. Students who already have a fee record
          are skipped.
        </p>

        <div className="flex-1 overflow-y-auto rounded-lg border border-border/50 min-h-[10rem]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Building plan…
            </div>
          ) : !plan || plan.rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No students are waiting for a fee record by batch.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Batch</th>
                  <th className="px-4 py-2.5 text-left font-medium">Students</th>
                  <th className="px-4 py-2.5 text-left font-medium">Fee structure to apply</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {plan.rows.map((row) => {
                  return (
                    <tr key={row.batchId} className="hover:bg-muted/10">
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {row.batchName}
                        {row.standardName && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            ({row.standardName})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.studentCount}</td>
                      <td className="px-4 py-2.5">
                        {row.structures.length === 0 ? (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="w-3 h-3" /> No structure for this batch's class
                            — skipped
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
                            value={picked[row.batchId] ?? ""}
                            onChange={(e) =>
                              setPicked((p) => ({ ...p, [row.batchId]: e.target.value }))
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

        {!!plan?.studentsWithoutBatch && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5" />
            {plan.studentsWithoutBatch} student{plan.studentsWithoutBatch === 1 ? "" : "s"} have no
            batch set — assign them manually from a fee structure's “Assign” button.
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
