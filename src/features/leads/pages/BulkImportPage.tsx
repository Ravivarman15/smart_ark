// Bulk Lead Import workspace — drag & drop upload → auto column mapping →
// validate / dedupe / assign / insert (500-row batches) → live progress with
// pause / resume / cancel → summary + report downloads + audit trail.

import { useCallback, useRef, useState } from "react";
import {
  Upload, FileSpreadsheet, Play, Pause, RotateCcw, XCircle, Download,
  CheckCircle2, AlertTriangle, Users, UserX, MessageSquare, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ActionGuard } from "@/features/rbac/components/ActionGuard";
import { useBulkImport } from "../hooks/useBulkImport";
import { useBulkImportJobs } from "../hooks/useBulkImportJobs";
import { errorsToCsv, downloadCsv } from "../utils/bulkImportCsv";
import { MAX_IMPORT_ROWS, type CanonicalField, type ImportPhase } from "../types/bulkImport.types";

const CANONICAL_FIELDS: { key: CanonicalField; label: string; required?: boolean }[] = [
  { key: "student_name", label: "Student Name", required: true },
  { key: "mobile",       label: "Mobile",        required: true },
  { key: "parent_name",  label: "Parent Name" },
  { key: "class",        label: "Class / Grade" },
  { key: "school",       label: "School" },
  { key: "board",        label: "Board" },
  { key: "course",       label: "Course" },
  { key: "source",       label: "Source" },
];

const PHASE_LABEL: Record<ImportPhase, string> = {
  idle: "Ready", uploading: "Uploading", parsing: "Parsing", validating: "Validating",
  assigning: "Assigning", importing: "Importing", paused: "Paused",
  completed: "Completed", cancelled: "Cancelled", failed: "Failed",
};

const ACCEPT = ".csv,.xls,.xlsx";

const BulkImportPage = () => {
  const imp = useBulkImport();
  const { data: jobs = [], refetch: refetchJobs } = useBulkImportJobs();
  const [whatsapp, setWhatsapp] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = useCallback(async (f?: File | null) => {
    if (!f) return;
    try {
      await imp.selectFile(f);
    } catch (e) {
      toast.error("Could not read file: " + (e as Error).message);
    }
  }, [imp]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void onFile(e.dataTransfer.files?.[0]);
  }, [onFile]);

  const running = imp.busy && (imp.phase === "importing" || imp.phase === "paused" || imp.phase === "validating" || imp.phase === "assigning");
  const canStart = !!imp.parsed && !!imp.mapping.student_name && !!imp.mapping.mobile && !imp.busy && imp.phase !== "completed";

  const start = async () => {
    await imp.start({ whatsapp });
    refetchJobs();
  };

  return (
    <div className="space-y-5 p-4">
      <header>
        <h1 className="text-xl font-bold">Bulk Lead Import</h1>
        <p className="text-sm text-muted-foreground">
          Upload CSV / XLS / XLSX (up to {MAX_IMPORT_ROWS.toLocaleString()} leads). Columns are auto-detected;
          mobiles are validated, duplicates removed, courses matched and counselors assigned automatically.
        </p>
      </header>

      {/* ── Upload ──────────────────────────────────────────────────────── */}
      <ActionGuard action="bulk_import.upload">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`glass-card flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? "border-accent bg-accent/10" : "border-border/60 hover:border-accent/50"
          }`}
        >
          <Upload className="h-7 w-7 text-accent" />
          <p className="text-sm font-medium">Drag &amp; drop your file here, or click to browse</p>
          <p className="text-xs text-muted-foreground">Accepted: .csv, .xls, .xlsx</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
      </ActionGuard>

      {/* ── File summary + column mapping + preview ─────────────────────── */}
      {imp.parsed && (
        <div className="glass-card space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-accent" />
              <span className="text-sm font-medium">{imp.file?.name}</span>
              <Badge variant="outline">{imp.summary.total.toLocaleString()} rows</Badge>
              <Badge variant="outline">{imp.parsed.headers.length} columns</Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={imp.reset} disabled={imp.busy} className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>

          {imp.truncated && (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              File exceeds {MAX_IMPORT_ROWS.toLocaleString()} rows — only the first {MAX_IMPORT_ROWS.toLocaleString()} will be imported.
            </div>
          )}

          {/* Column mapping */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Column mapping</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {CANONICAL_FIELDS.map((f) => (
                <label key={f.key} className="space-y-1 text-xs">
                  <span className="text-muted-foreground">
                    {f.label}{f.required && <span className="text-rose-500"> *</span>}
                  </span>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={imp.mapping[f.key] ?? ""}
                    disabled={imp.busy}
                    onChange={(e) => imp.setMapping({ ...imp.mapping, [f.key]: e.target.value || undefined })}
                  >
                    <option value="">— none —</option>
                    {imp.parsed!.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {(!imp.mapping.student_name || !imp.mapping.mobile) && (
              <p className="mt-2 text-xs text-rose-500">Map both Student Name and Mobile to start the import.</p>
            )}
          </div>

          {/* Preview (first 10 rows) */}
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Preview (first 10 rows)</p>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  {imp.parsed.headers.map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {imp.parsed.rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b border-border/30">
                    {imp.parsed!.headers.map((h) => <td key={h} className="px-2 py-1">{r[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={whatsapp} onCheckedChange={setWhatsapp} disabled={imp.busy} />
              <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> Queue WhatsApp (welcome + counselor)</span>
            </label>
            <div className="ml-auto flex items-center gap-2">
              {!running && (
                <ActionGuard action="bulk_import.start">
                  <Button onClick={start} disabled={!canStart} className="gap-1">
                    <Play className="h-4 w-4" /> Start Import
                  </Button>
                </ActionGuard>
              )}
              {running && (
                <ActionGuard action="bulk_import.cancel">
                  {imp.paused ? (
                    <Button variant="outline" onClick={imp.resume} className="gap-1">
                      <Play className="h-4 w-4" /> Resume
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={imp.pause} className="gap-1">
                      <Pause className="h-4 w-4" /> Pause
                    </Button>
                  )}
                  <Button variant="outline" onClick={imp.cancel} className="gap-1 text-rose-600 border-rose-200 hover:bg-rose-50">
                    <XCircle className="h-4 w-4" /> Cancel
                  </Button>
                </ActionGuard>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Live progress + summary ─────────────────────────────────────── */}
      {imp.phase !== "idle" && imp.phase !== "parsing" && (
        <div className="glass-card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              {imp.phase === "completed" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                : imp.phase === "failed" || imp.phase === "cancelled" ? <XCircle className="h-4 w-4 text-rose-600" />
                : <RefreshCw className="h-4 w-4 animate-spin text-accent" />}
              {PHASE_LABEL[imp.phase]}
            </span>
            <span className="text-sm text-muted-foreground">{imp.progress}%</span>
          </div>
          <Progress value={imp.progress} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="Total" value={imp.summary.total} />
            <Stat label="Imported" value={imp.summary.imported} tone="text-emerald-600" icon={CheckCircle2} />
            <Stat label="Duplicates" value={imp.summary.duplicate} tone="text-amber-600" />
            <Stat label="Invalid" value={imp.summary.invalid} tone="text-rose-600" />
            <Stat label="Assigned" value={imp.summary.assigned} tone="text-accent" icon={Users} />
            <Stat label="Unassigned" value={imp.summary.unassigned} icon={UserX} />
            <Stat label="WhatsApp" value={imp.summary.whatsappQueued} icon={MessageSquare} />
          </div>

          {(imp.errors.length > 0 || imp.duplicates.length > 0) && (
            <ActionGuard action="bulk_import.export">
              <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3">
                {imp.errors.length > 0 && (
                  <Button variant="outline" size="sm" className="gap-1"
                    onClick={() => downloadCsv("failed_rows.csv", errorsToCsv(imp.errors))}>
                    <Download className="h-3.5 w-3.5" /> Failed rows ({imp.errors.length})
                  </Button>
                )}
                {imp.duplicates.length > 0 && (
                  <Button variant="outline" size="sm" className="gap-1"
                    onClick={() => downloadCsv("duplicate_leads.csv", errorsToCsv(imp.duplicates))}>
                    <Download className="h-3.5 w-3.5" /> Duplicate leads ({imp.duplicates.length})
                  </Button>
                )}
              </div>
            </ActionGuard>
          )}
        </div>
      )}

      {/* ── Recent imports ──────────────────────────────────────────────── */}
      <ActionGuard action="bulk_import.audit">
        <div className="glass-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent imports</h2>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => refetchJobs()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="px-2 py-1 font-medium">File</th>
                    <th className="px-2 py-1 font-medium">Status</th>
                    <th className="px-2 py-1 font-medium">Total</th>
                    <th className="px-2 py-1 font-medium">Imported</th>
                    <th className="px-2 py-1 font-medium">Dup</th>
                    <th className="px-2 py-1 font-medium">Invalid</th>
                    <th className="px-2 py-1 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-b border-border/30">
                      <td className="px-2 py-1">{j.fileName}</td>
                      <td className="px-2 py-1"><Badge variant="outline">{j.status}</Badge></td>
                      <td className="px-2 py-1">{j.totalRows.toLocaleString()}</td>
                      <td className="px-2 py-1">{j.importedRows.toLocaleString()}</td>
                      <td className="px-2 py-1">{j.duplicateRows.toLocaleString()}</td>
                      <td className="px-2 py-1">{j.invalidRows.toLocaleString()}</td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {j.createdAt ? new Date(j.createdAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ActionGuard>
    </div>
  );
};

const Stat = ({
  label, value, tone, icon: Icon,
}: { label: string; value: number; tone?: string; icon?: typeof Users }) => (
  <div className="rounded-md border border-border/60 bg-card/60 px-3 py-2">
    <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
      {Icon && <Icon className="h-3 w-3" />} {label}
    </p>
    <p className={`text-lg font-semibold ${tone ?? "text-foreground"}`}>{value.toLocaleString()}</p>
  </div>
);

export default BulkImportPage;
