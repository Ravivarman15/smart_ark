import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAcademicYears,
  useBatches,
  useCourseTypes,
  useStandards,
} from "@/features/setup/hooks";
import { invalidateSetupLookups } from "@/features/setup/lib/setupSync";
import { EmptyState, StatTile, StudentPageShell } from "../components";
import { useStudents } from "../hooks/useStudents";
import { useCommitImport, useImportHistory } from "../hooks/useStudentImport";
import { academicProvisionService } from "../services/academicProvision.service";
import { formatDateTime, parseSpreadsheet } from "../utils";
import { IMPORT_TEMPLATE_HEADERS } from "../utils/constants";
import {
  buildDuplicateIndex,
  buildImportPreview,
  detectColumnMappings,
  detectMissingAcademic,
  distributionBy,
  isMissingAcademicEmpty,
  rowsToImportRecords,
  type ImportLookups,
  type ImportRecord,
  type ImportRowPreview,
  type MissingAcademic,
} from "../utils/importMapping";

// Sample template: canonical headers + one fully-mapped example row.
const TEMPLATE =
  IMPORT_TEMPLATE_HEADERS.join(",") +
  "\n" +
  [
    "Asha Kumar",
    "A101",
    "Female",
    "2009-04-12",
    "Ravi Kumar",
    "9800000000",
    "ravi@example.com",
    "12 MG Road",
    "11",
    "11A",
    "NEET",
    "2025-2026",
  ].join(",") +
  "\n";

const STATUS_STYLE: Record<ImportRowPreview["status"], string> = {
  valid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  duplicate: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  error: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const MAPPING_KIND_STYLE: Record<string, string> = {
  student: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  academic: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  unmapped: "bg-muted text-muted-foreground",
};

const escapeCsv = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadCsv = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const Mapped = ({ value }: { value?: string }) =>
  value ? (
    <span className="inline-flex items-center gap-1 text-foreground">
      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
      {value}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

interface RunResult {
  imported: number;
  failed: number;
  duplicates: number;
  batchDist: { name: string; count: number }[];
  standardDist: { name: string; count: number }[];
  courseTypeDist: { name: string; count: number }[];
  /** Counts of academic master records auto-created during this run. */
  created?: { standards: number; courseTypes: number; years: number; batches: number };
}

const Distribution = ({
  title,
  data,
}: {
  title: string;
  data: { name: string; count: number }[];
}) => (
  <div>
    <p className="text-xs font-medium uppercase text-muted-foreground mb-2">{title}</p>
    <div className="space-y-1">
      {data.length === 0 ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : (
        data.map((d) => (
          <div key={d.name} className="flex justify-between text-sm">
            <span className="truncate pr-2">{d.name}</span>
            <span className="font-medium">{d.count}</span>
          </div>
        ))
      )}
    </div>
  </div>
);

const StudentsImportPage = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { user } = useAuth();
  // RBAC: only management / admin may auto-create academic master records.
  const canAutoCreate = user?.role === "management" || user?.role === "admin";

  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [autoCreate, setAutoCreate] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [missing, setMissing] = useState<MissingAcademic | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Live Setup-module data drives all name→id resolution. No hardcoded lists.
  const { data: standards = [] } = useStandards();
  const { data: batches = [] } = useBatches();
  const { data: courseTypes = [] } = useCourseTypes();
  const { data: years = [] } = useAcademicYears();
  const lookups = useMemo<ImportLookups>(
    () => ({ standards, batches, courseTypes, years }),
    [standards, batches, courseTypes, years]
  );

  // Existing students power multi-key duplicate detection.
  const { data: existing } = useStudents({ filters: { status: "all" } });
  const existingIndex = useMemo(
    () => buildDuplicateIndex(existing?.rows ?? []),
    [existing]
  );

  // Preview is derived — it auto-refreshes once Setup data / existing students
  // finish loading after the file was picked.
  const results = useMemo(
    () => buildImportPreview(records, lookups, existingIndex),
    [records, lookups, existingIndex]
  );
  const detected = useMemo(() => detectColumnMappings(headers), [headers]);

  const commitMut = useCommitImport();
  const { data: history = [] } = useImportHistory();

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setLastRun(null);
    setProgress(null);
    setParsing(true);
    try {
      const matrix = await parseSpreadsheet(file);
      if (matrix.length < 2) {
        toast.error("No data rows found in the file.");
        setHeaders([]);
        setRecords([]);
        return;
      }
      setHeaders(matrix[0] ?? []);
      setRecords(rowsToImportRecords(matrix));
    } catch (e) {
      toast.error(
        e instanceof Error ? `Could not read file: ${e.message}` : "Could not read file"
      );
      setHeaders([]);
      setRecords([]);
    } finally {
      setParsing(false);
    }
  };

  const summary = useMemo(() => {
    const valid = results.filter((r) => r.status === "valid");
    return {
      total: results.length,
      valid,
      validCount: valid.length,
      duplicate: results.filter((r) => r.status === "duplicate").length,
      error: results.filter((r) => r.status === "error").length,
      missingAcademic: results.filter((r) => r.missingAcademic).length,
      validRows: valid.map((r) => r.student),
    };
  }, [results]);

  const duplicates = useMemo(
    () => results.filter((r) => r.status === "duplicate"),
    [results]
  );

  const reset = () => {
    setRecords([]);
    setHeaders([]);
    setFileName("");
    setProgress(null);
    setMissing(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Commit valid rows. `lookupsToUse` lets the auto-create path re-resolve
  // against the records it just created; `created` carries the counts/audit.
  const runImport = (
    lookupsToUse: ImportLookups,
    created?: {
      counts: RunResult["created"];
      summary: Parameters<typeof commitMut.mutate>[0]["createdAcademic"];
    }
  ) => {
    const finalPreviews = buildImportPreview(records, lookupsToUse, existingIndex);
    const validPreviews = finalPreviews.filter((r) => r.status === "valid");
    const validRows = validPreviews.map((r) => r.student);
    const duplicateCount = finalPreviews.filter((r) => r.status === "duplicate").length;
    if (validRows.length === 0) return;

    setProgress({ done: 0, total: validRows.length });
    commitMut.mutate(
      {
        rows: validRows,
        fileName: fileName || "import.csv",
        onProgress: (done, total) => setProgress({ done, total }),
        createdAcademic: created?.summary,
      },
      {
        onSuccess: (batch) => {
          setLastRun({
            imported: batch.successRows,
            failed: batch.errorRows,
            duplicates: duplicateCount,
            batchDist: distributionBy(validPreviews, (r) => r.resolved.batchName),
            standardDist: distributionBy(validPreviews, (r) => r.resolved.standardName),
            courseTypeDist: distributionBy(validPreviews, (r) => r.resolved.courseTypeName),
            created: created?.counts,
          });
          reset();
        },
        onSettled: () => setProgress(null),
      }
    );
  };

  // Import button. With auto-create ON (and permitted), first surface any
  // missing academic records for confirmation; otherwise import straight away.
  const commit = () => {
    if (summary.validRows.length === 0) return;
    if (autoCreate && canAutoCreate) {
      const found = detectMissingAcademic(records, lookups);
      if (!isMissingAcademicEmpty(found)) {
        setMissing(found);
        setConfirmOpen(true);
        return;
      }
    }
    runImport(lookups);
  };

  // Confirmed in the dialog: create the missing records, then re-resolve + import.
  const confirmAutoCreate = async () => {
    if (!missing) return;
    setConfirmOpen(false);
    setProvisioning(true);
    try {
      const created = await academicProvisionService.createMissing(missing, {
        actorProfileId: user?.profileId,
        actorName: user?.name,
        sourceFile: fileName,
        existing: { standards, courseTypes, years, batches },
      });
      // Refresh Setup-derived caches app-wide so the new records show everywhere.
      invalidateSetupLookups(qc);

      const counts = {
        standards: created.standards.length,
        courseTypes: created.courseTypes.length,
        years: created.years.length,
        batches: created.batches.length,
      };
      const total = counts.standards + counts.courseTypes + counts.years + counts.batches;
      if (total > 0) {
        toast.success(
          `Created ${counts.standards} standard(s), ${counts.batches} batch(es), ` +
            `${counts.courseTypes} course type(s), ${counts.years} year(s)`
        );
      }

      const augmented: ImportLookups = {
        standards: [...standards, ...created.standards],
        batches: [...batches, ...created.batches],
        courseTypes: [...courseTypes, ...created.courseTypes],
        years: [...years, ...created.years],
      };
      runImport(augmented, {
        counts,
        summary: academicProvisionService.summarize(
          { actorProfileId: user?.profileId, actorName: user?.name, sourceFile: fileName, existing: { standards, courseTypes, years, batches } },
          created
        ),
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? `Auto-create failed: ${e.message}` : "Auto-create failed"
      );
    } finally {
      setProvisioning(false);
    }
  };

  const downloadTemplate = () => downloadCsv("student-import-template.csv", TEMPLATE);

  const downloadErrors = () => {
    const bad = results.filter((r) => r.status !== "valid");
    if (bad.length === 0) return;
    const headerRow = [
      "row",
      "name",
      "status",
      "biometric_id",
      "enrolment_no",
      "roll_number",
      "mobile",
      "email",
      "standard_name",
      "batch_name",
      "course_type_name",
      "academic_year_name",
      "reason",
    ];
    const lines = bad.map((r) =>
      [
        r.rowNumber,
        r.name,
        r.status,
        r.dedup.biometricId ?? "",
        r.dedup.enrolmentNo ?? "",
        r.dedup.rollNumber ?? "",
        r.dedup.mobile ?? "",
        r.dedup.email ?? "",
        r.raw.standardName ?? "",
        r.raw.batchName ?? "",
        r.raw.courseTypeName ?? "",
        r.raw.academicYearName ?? "",
        r.messages.join("; "),
      ]
        .map(escapeCsv)
        .join(",")
    );
    downloadCsv("student-import-errors.csv", [headerRow.join(","), ...lines].join("\n"));
  };

  const committing = commitMut.isPending || provisioning;
  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  const missingTotal = missing
    ? missing.standards.length +
      missing.courseTypes.length +
      missing.years.length +
      missing.batches.length
    : 0;

  return (
    <StudentPageShell
      title="Students Import"
      description="Smart-import students from Excel or CSV — columns are auto-detected and mapped, academic references resolved, duplicates flagged. No manual mapping needed."
      icon={<FileSpreadsheet className="w-5 h-5" />}
      headerExtra={
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Sample template
        </Button>
      }
    >
      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-4 space-y-4">
          {/* Instructions + academic mapping helper */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="glass-card p-4 space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Info className="w-4 h-4 text-accent" />
                How smart import works
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li>Upload an Excel (.xlsx, .xls) or CSV file — the first sheet with data is used.</li>
                <li>
                  Columns are matched by name automatically (e.g. <code>Class/Batch</code>,{" "}
                  <code>Father Mobile</code>, <code>Birth Date</code>) — no manual mapping.
                </li>
                <li>
                  Standard / Batch / Course Type / Academic Year are resolved against Setup;
                  a known batch fills in the rest.
                </li>
                <li>
                  Duplicates are detected by Biometric Id, Enrolment No, GR No, Roll No,
                  Mobile and Email.
                </li>
                <li><code>name</code> is required; rows with unknown academic refs are flagged.</li>
              </ul>
            </div>
            <div className="glass-card p-4 space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <FileSpreadsheet className="w-4 h-4 text-accent" />
                Live Setup data
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="font-mono text-foreground">Standards</span>
                <span className="text-muted-foreground">{standards.length} in Setup</span>
                <span className="font-mono text-foreground">Batches</span>
                <span className="text-muted-foreground">{batches.length} in Setup</span>
                <span className="font-mono text-foreground">Course types</span>
                <span className="text-muted-foreground">{courseTypes.length} in Setup</span>
                <span className="font-mono text-foreground">Academic years</span>
                <span className="text-muted-foreground">{years.length} in Setup</span>
              </div>
            </div>
          </div>

          {/* Upload */}
          <div className="glass-card p-6 flex flex-col items-center gap-3 text-center">
            <span className="flex w-12 h-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              {parsing ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Upload className="w-6 h-6" />
              )}
            </span>
            <div>
              <p className="text-sm font-medium">
                {fileName || "Choose an Excel or CSV file to import"}
              </p>
              <p className="text-xs text-muted-foreground max-w-xl">
                Supports .xlsx, .xls and .csv · institution exports work as-is
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={parsing}>
                Select file
              </Button>
              {(records.length > 0 || headers.length > 0) && (
                <Button size="sm" variant="outline" onClick={reset}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Detected column mappings */}
          {detected.length > 0 && (
            <div className="glass-card p-4 space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 text-accent" />
                Detected column mappings
                <span className="text-xs font-normal text-muted-foreground">
                  ({detected.filter((d) => d.kind !== "unmapped").length}/{detected.length} matched)
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {detected.map((d) => (
                  <span
                    key={d.sourceHeader}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
                      MAPPING_KIND_STYLE[d.kind]
                    }`}
                    title={d.kind === "unmapped" ? "Not imported" : `→ ${d.field}`}
                  >
                    <span className="font-medium">{d.sourceHeader}</span>
                    {d.field && <span className="opacity-70">→ {d.field}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Post-import analytics */}
          {lastRun && (
            <div className="glass-card p-5 space-y-4 border border-emerald-500/30">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Import complete
              </p>
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Imported" value={lastRun.imported} tone="positive" />
                <StatTile label="Failed" value={lastRun.failed} tone="danger" />
                <StatTile
                  label="Duplicates skipped"
                  value={lastRun.duplicates}
                  tone="warning"
                />
              </div>
              {lastRun.created &&
                lastRun.created.standards +
                  lastRun.created.courseTypes +
                  lastRun.created.years +
                  lastRun.created.batches >
                  0 && (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                      Created:
                    </span>
                    {lastRun.created.standards > 0 && (
                      <span>{lastRun.created.standards} Standard(s)</span>
                    )}
                    {lastRun.created.batches > 0 && (
                      <span>{lastRun.created.batches} Batch(es)</span>
                    )}
                    {lastRun.created.courseTypes > 0 && (
                      <span>{lastRun.created.courseTypes} Course Type(s)</span>
                    )}
                    {lastRun.created.years > 0 && (
                      <span>{lastRun.created.years} Academic Year(s)</span>
                    )}
                  </p>
                )}
              <div className="grid gap-4 md:grid-cols-3">
                <Distribution title="Standard distribution" data={lastRun.standardDist} />
                <Distribution title="Batch distribution" data={lastRun.batchDist} />
                <Distribution title="Course type distribution" data={lastRun.courseTypeDist} />
              </div>
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatTile label="Rows" value={summary.total} />
                <StatTile label="Valid" value={summary.validCount} tone="positive" />
                <StatTile label="Duplicates" value={summary.duplicate} tone="warning" />
                <StatTile label="Errors" value={summary.error} tone="danger" />
                <StatTile
                  label="Missing mappings"
                  value={summary.missingAcademic}
                  tone="warning"
                />
              </div>

              {/* Commit progress */}
              {committing && progress && (
                <div className="glass-card p-4 space-y-2">
                  <p className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Importing students…</span>
                    <span>
                      {progress.done}/{progress.total}
                    </span>
                  </p>
                  <Progress value={pct} />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Auto-create option — management/admin only (RBAC). */}
                {canAutoCreate ? (
                  <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                    <Checkbox
                      checked={autoCreate}
                      onCheckedChange={(v) => setAutoCreate(v === true)}
                      disabled={committing}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Create Missing Academic Records</span>
                      <span className="block text-xs text-muted-foreground">
                        Auto-create Standards, Batches, Course Types & Academic Years not in Setup.
                      </span>
                    </span>
                  </label>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  {summary.error + summary.duplicate > 0 && (
                    <Button variant="outline" size="sm" onClick={downloadErrors}>
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Download failed rows
                    </Button>
                  )}
                  <Button onClick={commit} disabled={summary.validCount === 0 || committing}>
                    {committing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {provisioning
                      ? "Creating records…"
                      : `Import ${summary.validCount} valid student${
                          summary.validCount === 1 ? "" : "s"
                        }`}
                  </Button>
                </div>
              </div>

              {/* Duplicate report */}
              {duplicates.length > 0 && (
                <div className="glass-card p-4 space-y-2 border border-amber-500/30">
                  <p className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    Duplicate report ({duplicates.length})
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
                    {duplicates.map((r) => (
                      <div
                        key={r.rowNumber}
                        className="flex justify-between gap-3 border-b border-border/30 py-1"
                      >
                        <span className="font-medium">
                          Row {r.rowNumber}: {r.name}
                        </span>
                        <span className="text-muted-foreground text-right">
                          {r.messages.join("; ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="glass-card p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Row</th>
                      <th className="px-4 py-2.5 text-left font-medium">Name</th>
                      <th className="px-4 py-2.5 text-left font-medium">Standard</th>
                      <th className="px-4 py-2.5 text-left font-medium">Batch</th>
                      <th className="px-4 py-2.5 text-left font-medium">Course type</th>
                      <th className="px-4 py-2.5 text-left font-medium">Year</th>
                      <th className="px-4 py-2.5 text-left font-medium">Status</th>
                      <th className="px-4 py-2.5 text-left font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {results.map((r) => (
                      <tr
                        key={r.rowNumber}
                        className={r.status === "error" ? "bg-red-500/5" : ""}
                      >
                        <td className="px-4 py-2 text-muted-foreground">{r.rowNumber}</td>
                        <td className="px-4 py-2 font-medium">{r.name}</td>
                        <td className="px-4 py-2 text-xs">
                          <Mapped value={r.resolved.standardName} />
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <Mapped value={r.resolved.batchName} />
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <Mapped value={r.resolved.courseTypeName} />
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <Mapped value={r.resolved.academicYearName} />
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                              STATUS_STYLE[r.status]
                            }`}
                          >
                            {r.status === "valid" && <CheckCircle2 className="w-3 h-3" />}
                            {r.status === "duplicate" && <AlertTriangle className="w-3 h-3" />}
                            {r.status === "error" && <XCircle className="w-3 h-3" />}
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {r.messages.length ? r.messages.join("; ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <div className="glass-card">
              <EmptyState
                icon={<FileSpreadsheet className="w-5 h-5" />}
                title="No imports yet"
                description="Completed imports will be logged here."
              />
            </div>
          ) : (
            <div className="glass-card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-medium">File</th>
                    <th className="px-5 py-2.5 text-left font-medium">When</th>
                    <th className="px-5 py-2.5 text-center font-medium">Total</th>
                    <th className="px-5 py-2.5 text-center font-medium">Imported</th>
                    <th className="px-5 py-2.5 text-center font-medium">Failed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {history.map((b) => (
                    <tr key={b.id}>
                      <td className="px-5 py-2.5 font-medium">{b.fileName ?? "—"}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {formatDateTime(b.createdAt)}
                      </td>
                      <td className="px-5 py-2.5 text-center">{b.totalRows}</td>
                      <td className="px-5 py-2.5 text-center text-emerald-600">
                        {b.successRows}
                      </td>
                      <td className="px-5 py-2.5 text-center text-red-600">{b.errorRows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Auto-create confirmation — review what will be created before importing. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Create {missingTotal} missing academic record{missingTotal === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              These names from your file aren't in Setup yet. They'll be created and linked
              before the students are imported. Existing records are matched and reused.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-72 overflow-y-auto">
            {missing &&
              (
                [
                  ["Standards", missing.standards],
                  ["Batches", missing.batches],
                  ["Course Types", missing.courseTypes],
                  ["Academic Years", missing.years],
                ] as const
              ).map(([title, items]) =>
                items.length === 0 ? null : (
                  <div key={title}>
                    <p className="text-xs font-medium uppercase text-muted-foreground mb-1">
                      Missing {title} ({items.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((it) => (
                        <span
                          key={it.key}
                          className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs"
                        >
                          {it.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAutoCreate} disabled={provisioning}>
              {provisioning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create &amp; Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudentPageShell>
  );
};

export default StudentsImportPage;
