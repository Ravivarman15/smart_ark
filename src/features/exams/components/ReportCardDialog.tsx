import { useEffect, useState } from "react";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { openReportWindow, closeReportWindow } from "@/lib/reportWindow";
import { reportCardService, resultSheetService } from "../services";
import type { ResultSheetRow } from "../services";
import { monthLabel, type ExamMonth } from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Report Card dialog (Phase 6). Lists the students of a class/month (from the
// same result-sheet aggregation) and generates a per-student report card as
// PDF/print or Excel. Reuses reportCardService — no duplicate logic.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportCardDialogParams {
  standardId: string;
  standardName?: string;
  month: ExamMonth;
  academicYearId?: string;
  academicYearName?: string;
  batchId?: string;
}

interface Props {
  params: ReportCardDialogParams | null;
  onOpenChange: (open: boolean) => void;
}

export const ReportCardDialog = ({ params, onOpenChange }: Props) => {
  const [rows, setRows] = useState<ResultSheetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!params) return;
    setLoading(true);
    resultSheetService
      .build(params)
      .then((sheet) => setRows(sheet.rows))
      .catch(() => toast.error("Failed to load students"))
      .finally(() => setLoading(false));
  }, [params]);

  const generate = async (studentId: string, format: "print" | "xlsx") => {
    if (!params) return;
    // Print opens a window — open it now, synchronously, so the popup blocker
    // trusts it after the async build. Excel just downloads a file.
    const win = format === "print" ? openReportWindow() : null;
    if (format === "print" && !win) return; // popup blocked — toast already shown
    setBusyId(studentId + format);
    try {
      await reportCardService.generate({ ...params, studentId }, format, win);
    } catch (err) {
      closeReportWindow(win);
      toast.error(err instanceof Error ? err.message : "Failed to generate report card");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={!!params} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Report Cards — {params?.standardName ?? "Class"} ·{" "}
            {params ? monthLabel(params.month) : ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Loading students…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            No results recorded for this class in this month.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium w-12">Rank</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium w-20">%</th>
                  <th className="px-3 py-2 font-medium w-40">Report Card</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((r) => (
                  <tr key={r.studentId} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5 text-muted-foreground">{r.rank || "—"}</td>
                    <td className="px-3 py-1.5 font-medium text-foreground">{r.studentName}</td>
                    <td className="px-3 py-1.5">{r.percentage}%</td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => generate(r.studentId, "print")}
                          disabled={busyId === r.studentId + "print"}
                        >
                          {busyId === r.studentId + "print" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Printer className="w-3 h-3" />
                          )}
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => generate(r.studentId, "xlsx")}
                          disabled={busyId === r.studentId + "xlsx"}
                        >
                          {busyId === r.studentId + "xlsx" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-3 h-3" />
                          )}
                          Excel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
