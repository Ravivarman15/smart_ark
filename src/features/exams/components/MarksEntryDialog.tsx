import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBatchRoster, useExamResults, useSaveMarks } from "../hooks";
import { scoreResult } from "../utils";
import { GradeBadge } from "./GradeBadge";
import type { Exam, MarksEntryRow } from "../types/exam.types";

interface Props {
  exam: Exam | null;
  onOpenChange: (open: boolean) => void;
}

interface RowState {
  marks: string;
  isAbsent: boolean;
  remarks: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marks entry grid. Loads the batch roster + any existing results, lets the
// teacher type marks / mark absentees, shows the grade live (via the grading
// layer — never computed here), and supports bulk paste. One save writes the
// whole set through examResultsService, which grades + ranks centrally.
// ─────────────────────────────────────────────────────────────────────────────
export const MarksEntryDialog = ({ exam, onOpenChange }: Props) => {
  const { data: roster = [], isLoading: rosterLoading } = useBatchRoster(
    exam?.batchId ?? null,
  );
  const { data: results = [] } = useExamResults(exam?.id ?? null);
  const saveMarks = useSaveMarks();

  const [entries, setEntries] = useState<Record<string, RowState>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const locked = exam?.resultsStatus === "locked";

  // Seed the grid from the roster + existing results.
  useEffect(() => {
    if (!exam) return;
    const byStudent = new Map(results.map((r) => [r.studentId, r]));
    const next: Record<string, RowState> = {};
    for (const s of roster) {
      const r = byStudent.get(s.id);
      next[s.id] = {
        marks: r && r.marks != null ? String(r.marks) : "",
        isAbsent: r?.isAbsent ?? false,
        remarks: r?.remarks ?? "",
      };
    }
    setEntries(next);
  }, [exam, roster, results]);

  const patch = (id: string, p: Partial<RowState>) =>
    setEntries((e) => ({ ...e, [id]: { ...e[id], ...p } }));

  // Bulk paste — one value per line, applied in roster order. "ab"/"absent"
  // (any case) marks the student absent; blank lines are skipped.
  const applyBulk = () => {
    const lines = bulkText.split(/\r?\n/);
    setEntries((prev) => {
      const next = { ...prev };
      roster.forEach((s, i) => {
        const raw = (lines[i] ?? "").trim();
        if (raw === "") return;
        if (/^(ab|absent)$/i.test(raw)) {
          next[s.id] = { ...next[s.id], isAbsent: true, marks: "" };
        } else if (!Number.isNaN(Number(raw))) {
          next[s.id] = { ...next[s.id], isAbsent: false, marks: raw };
        }
      });
      return next;
    });
    setBulkOpen(false);
    toast.success("Bulk marks applied — review and save");
  };

  const live = (id: string) => {
    if (!exam) return null;
    const e = entries[id];
    if (!e) return null;
    const marks = e.marks === "" ? null : Number(e.marks);
    return scoreResult({
      marks,
      isAbsent: e.isAbsent,
      totalMarks: exam.totalMarks,
      passMarks: exam.passMarks,
      scheme: exam.gradingScheme,
    });
  };

  const overMax = useMemo(() => {
    if (!exam) return false;
    return Object.values(entries).some(
      (e) => !e.isAbsent && e.marks !== "" && Number(e.marks) > exam.totalMarks,
    );
  }, [entries, exam]);

  const save = async () => {
    if (!exam) return;
    if (overMax) {
      toast.error(`Some marks exceed the total of ${exam.totalMarks}`);
      return;
    }
    const rows: MarksEntryRow[] = roster.map((s) => {
      const e = entries[s.id] ?? { marks: "", isAbsent: false, remarks: "" };
      return {
        studentId: s.id,
        studentName: s.name,
        marks: e.isAbsent || e.marks === "" ? null : Number(e.marks),
        isAbsent: e.isAbsent,
        remarks: e.remarks || undefined,
      };
    });
    try {
      await saveMarks.mutateAsync({ examId: exam.id, rows });
      toast.success(`Marks saved for ${rows.length} students`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save marks");
    }
  };

  return (
    <Dialog open={!!exam} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Marks Entry — {exam?.title}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Total {exam?.totalMarks} · Pass {exam?.passMarks}
            </span>
          </DialogTitle>
        </DialogHeader>

        {locked && (
          <p className="text-sm text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            Results are locked — marks are read-only. Unlock the exam to edit.
          </p>
        )}

        {rosterLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Loading roster…
          </p>
        ) : roster.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No active students found for this exam's batch. Assign a batch with
            students to the exam first.
          </p>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                {roster.length} students
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => setBulkOpen((v) => !v)}
                disabled={locked}
              >
                <Upload className="w-3 h-3" /> Bulk paste
              </Button>
            </div>

            {bulkOpen && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  One value per line, in the order shown below. Use{" "}
                  <code>AB</code> for an absent student.
                </p>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={5}
                  className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                  placeholder={"85\n72\nAB\n90"}
                />
                <Button size="sm" className="h-7 text-xs" onClick={applyBulk}>
                  Apply
                </Button>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium w-8">#</th>
                    <th className="px-3 py-2 font-medium">Student</th>
                    <th className="px-3 py-2 font-medium w-24">Marks</th>
                    <th className="px-3 py-2 font-medium w-16">Absent</th>
                    <th className="px-3 py-2 font-medium w-16">Grade</th>
                    <th className="px-3 py-2 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {roster.map((s, i) => {
                    const e = entries[s.id] ?? {
                      marks: "",
                      isAbsent: false,
                      remarks: "",
                    };
                    const scored = live(s.id);
                    const bad =
                      !e.isAbsent &&
                      e.marks !== "" &&
                      Number(e.marks) > (exam?.totalMarks ?? Infinity);
                    return (
                      <tr key={s.id} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-3 py-1.5">
                          <p className="font-medium text-foreground">{s.name}</p>
                          {s.rollNumber && (
                            <p className="text-[11px] text-muted-foreground">
                              {s.rollNumber}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            value={e.marks}
                            disabled={e.isAbsent || locked}
                            onChange={(ev) =>
                              patch(s.id, { marks: ev.target.value })
                            }
                            className={`h-8 ${bad ? "border-destructive" : ""}`}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={e.isAbsent}
                            disabled={locked}
                            onChange={(ev) =>
                              patch(s.id, {
                                isAbsent: ev.target.checked,
                                marks: ev.target.checked ? "" : e.marks,
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <GradeBadge grade={scored?.grade} />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            value={e.remarks}
                            disabled={locked}
                            onChange={(ev) =>
                              patch(s.id, { remarks: ev.target.value })
                            }
                            className="h-8"
                            placeholder="Optional"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Button
              className="w-full"
              onClick={save}
              disabled={saveMarks.isPending || locked || overMax}
            >
              {saveMarks.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saveMarks.isPending ? "Saving…" : "Save Marks"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
