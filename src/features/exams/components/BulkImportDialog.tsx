import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { mcqImportService } from "../services";
import { useCommitImport } from "../hooks";
import type { BulkImportReport } from "../types/mcq.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

const TEMPLATE_HEADER =
  "question_text,question_type,subject,chapter,topic,difficulty,marks,negative_marks,option_a,option_b,option_c,option_d,correct,tolerance,explanation";
const TEMPLATE_SAMPLE =
  'What is 2 + 2?,single,Mathematics,Arithmetic,Addition,easy,1,0,3,4,5,6,B,,Basic addition';

// ─────────────────────────────────────────────────────────────────────────────
// Bulk question import — paste or upload a CSV, review a row-by-row validation
// report (errors + duplicate detection), then commit the importable rows. Excel
// users save their sheet as .csv. Parsing + validation run in mcqImportService.
// ─────────────────────────────────────────────────────────────────────────────
export const BulkImportDialog = ({ open, onOpenChange, onImported }: Props) => {
  const [csvText, setCsvText] = useState("");
  const [report, setReport] = useState<BulkImportReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const commitMut = useCommitImport();

  const reset = () => {
    setCsvText("");
    setReport(null);
    setIncludeDuplicates(false);
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const analyze = async () => {
    if (!csvText.trim()) return toast.error("Paste or upload CSV data first");
    setAnalyzing(true);
    try {
      const result = await mcqImportService.analyze(csvText);
      setReport(result);
      if (result.total === 0) toast.error("No data rows found in the CSV");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse CSV");
    } finally {
      setAnalyzing(false);
    }
  };

  const commit = async () => {
    if (!report) return;
    try {
      const count = await commitMut.mutateAsync({ report, includeDuplicates });
      toast.success(`${count} question${count === 1 ? "" : "s"} imported`);
      onImported?.();
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const importable = report
    ? report.valid + (includeDuplicates ? report.duplicates : 0)
    : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-accent" /> Bulk Import Questions
          </DialogTitle>
        </DialogHeader>

        {!report ? (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/40 border border-border/50 p-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Expected CSV columns
              </p>
              <code className="text-[10px] block whitespace-pre-wrap break-all text-foreground">
                {TEMPLATE_HEADER}
              </code>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Example: <code className="break-all">{TEMPLATE_SAMPLE}</code>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                <code>correct</code> = option letter(s) like <code>B</code> or{" "}
                <code>A,C</code>; for numerical questions put the numeric answer.
              </p>
            </div>

            <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 py-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/30">
              <FileUp className="w-4 h-4" />
              Choose a .csv file
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFile(f);
                }}
              />
            </label>

            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={7}
              placeholder="…or paste CSV rows here (including the header row)"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs font-mono"
            />

            <Button onClick={analyze} disabled={analyzing} className="w-full">
              {analyzing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Validate
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label="Rows" value={report.total} />
              <Stat label="Valid" value={report.valid} tone="green" />
              <Stat label="Duplicates" value={report.duplicates} tone="amber" />
              <Stat label="Invalid" value={report.invalid} tone="red" />
            </div>

            {/* Row report */}
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 font-medium w-10">Row</th>
                    <th className="px-2 py-1.5 font-medium">Question</th>
                    <th className="px-2 py-1.5 font-medium w-44">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {report.rows.map((r) => {
                    const bad = r.errors.length > 0;
                    return (
                      <tr key={r.rowNumber}>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {r.rowNumber}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="line-clamp-1">
                            {r.raw.question_text || "—"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          {bad ? (
                            <span className="text-rose-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {r.errors[0]}
                            </span>
                          ) : r.isDuplicate ? (
                            <span className="text-amber-600">Duplicate</span>
                          ) : (
                            <span className="text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {report.duplicates > 0 && (
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={includeDuplicates}
                  onChange={(e) => setIncludeDuplicates(e.target.checked)}
                />
                Import the {report.duplicates} duplicate row
                {report.duplicates > 1 ? "s" : ""} anyway
              </label>
            )}

            <div className="flex gap-2">
              <Button
                onClick={commit}
                disabled={commitMut.isPending || importable === 0}
              >
                {commitMut.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Import {importable} question{importable === 1 ? "" : "s"}
              </Button>
              <Button variant="ghost" onClick={() => setReport(null)}>
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Stat = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "green" | "amber" | "red";
}) => {
  const cls = {
    default: "text-foreground",
    green: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-rose-600",
  }[tone];
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-2">
      <p className={`text-lg font-display font-semibold ${cls}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
};
