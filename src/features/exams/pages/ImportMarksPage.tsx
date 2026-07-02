import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  markImportService,
  type MarkImportPreview,
  type MarkImportResult,
  type MarkRowStatus,
} from "../services";

// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Mark Import (Phase 8). Upload → auto-map + preview (Conflict
// Center) → commit → result + error report. All logic in markImportService,
// which reuses the import-engine matching and the central marks write path.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_META: Record<MarkRowStatus, { label: string; color: string }> = {
  new: { label: "New", color: "text-emerald-600" },
  update: { label: "Update", color: "text-sky-600" },
  invalid_exam: { label: "Invalid Exam", color: "text-red-600" },
  missing_student: { label: "Missing Student", color: "text-amber-600" },
  duplicate: { label: "Duplicate", color: "text-amber-600" },
  invalid: { label: "Invalid", color: "text-red-600" },
};

const download = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const ImportMarksPage = () => {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<MarkImportPreview | null>(null);
  const [result, setResult] = useState<MarkImportResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const onFile = async (file: File) => {
    setFileName(file.name);
    setPreview(null);
    setResult(null);
    setParsing(true);
    try {
      setPreview(await markImportService.preview(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setParsing(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setCommitting(true);
    try {
      const res = await markImportService.commit(preview, user?.profileId);
      setResult(res);
      toast.success(`Imported ${res.imported}, updated ${res.updated}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setCommitting(false);
    }
  };

  const validCount = preview ? preview.counts.new + preview.counts.update : 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">Import Marks</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV or multi-sheet Excel. Columns are auto-mapped, students matched to their exam,
          and marks committed through the standard grading path.
        </p>
      </header>

      {/* Upload */}
      <Card className="border-border/60">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button onClick={() => fileRef.current?.click()} className="gap-2" disabled={parsing}>
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {parsing ? "Reading…" : "Choose file"}
          </Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </CardContent>
      </Card>

      {/* Mapping + counts */}
      {preview && (
        <>
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Auto-Mapped Columns</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(preview.mapping).length === 0 ? (
                <p className="text-xs text-muted-foreground">No columns recognised — check the header row.</p>
              ) : (
                Object.entries(preview.mapping).map(([field, header]) => (
                  <span key={field} className="text-xs rounded-md border border-border/60 bg-muted/30 px-2 py-1">
                    <span className="text-muted-foreground">{field}</span> ← <b>{header}</b>
                  </span>
                ))
              )}
            </CardContent>
          </Card>

          <section className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {(Object.keys(STATUS_META) as MarkRowStatus[]).map((k) => (
              <Card key={k} className="border-border/60">
                <CardContent className="p-3">
                  <p className="text-[11px] text-muted-foreground">{STATUS_META[k].label}</p>
                  <p className={`text-2xl font-display font-semibold ${STATUS_META[k].color}`}>{preview.counts[k]}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <div className="flex flex-wrap gap-2">
            <Button onClick={commit} disabled={committing || validCount === 0} className="gap-2">
              {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Commit {validCount} valid row(s)
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => download("mark_import_errors.csv", markImportService.errorReportCsv(preview))}
            >
              <Download className="w-4 h-4" /> Error Report
            </Button>
          </div>

          {/* Conflict Center */}
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Conflict Center — Preview</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto max-h-[460px]">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Student</th>
                    <th className="px-3 py-2 font-medium">Exam</th>
                    <th className="px-3 py-2 font-medium">Marks</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {preview.rows.slice(0, 300).map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-1.5 text-muted-foreground">{r.sheet}:{r.rowNum}</td>
                      <td className="px-3 py-1.5">{r.studentLabel}</td>
                      <td className="px-3 py-1.5">{r.examLabel}</td>
                      <td className="px-3 py-1.5">{r.absent ? "AB" : r.marks ?? "—"}</td>
                      <td className={`px-3 py-1.5 font-medium ${STATUS_META[r.status].color}`}>{STATUS_META[r.status].label}</td>
                      <td className="px-3 py-1.5 text-muted-foreground text-xs">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Result */}
      {result && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Imported</p><p className="text-xl font-semibold text-emerald-600">{result.imported}</p></div>
            <div><p className="text-xs text-muted-foreground">Updated</p><p className="text-xl font-semibold text-sky-600">{result.updated}</p></div>
            <div><p className="text-xs text-muted-foreground">Skipped</p><p className="text-xl font-semibold">{result.skipped}</p></div>
            <div><p className="text-xs text-muted-foreground">Invalid</p><p className="text-xl font-semibold text-red-600">{result.invalid}</p></div>
            <div><p className="text-xs text-muted-foreground">Duplicate</p><p className="text-xl font-semibold text-amber-600">{result.duplicate}</p></div>
            <div><p className="text-xs text-muted-foreground">Missing</p><p className="text-xl font-semibold text-amber-600">{result.missingStudent}</p></div>
          </CardContent>
        </Card>
      )}

      {!preview && !parsing && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          Recognised columns: Exam, Subject, Class, Section, Month, Student, Roll No, Admission No, Student ID, Marks, Absent.
        </p>
      )}
    </div>
  );
};

export default ImportMarksPage;
