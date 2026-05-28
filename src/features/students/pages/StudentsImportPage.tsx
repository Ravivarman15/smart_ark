import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAcademicYears,
  useBatches,
  useCourseTypes,
  useStandards,
} from "@/features/setup/hooks";
import { EmptyState, StatTile, StudentPageShell } from "../components";
import { useStudents } from "../hooks/useStudents";
import { useCommitImport, useImportHistory } from "../hooks/useStudentImport";
import { formatDateTime, parseCsv } from "../utils/helpers";
import { IMPORT_TEMPLATE_HEADERS } from "../utils/constants";
import {
  csvToImportRows,
  distributionBy,
  resolveAcademic,
  type ImportLookups,
  type ImportRowPreview,
} from "../utils/importMapping";
import type { StudentWriteInput } from "../types/student.types";

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
}

const StudentsImportPage = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<ImportRowPreview[]>([]);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  // Live Setup-module data drives all name→id resolution. No hardcoded lists.
  const { data: standards = [] } = useStandards();
  const { data: batches = [] } = useBatches();
  const { data: courseTypes = [] } = useCourseTypes();
  const { data: years = [] } = useAcademicYears();
  const lookups = useMemo<ImportLookups>(
    () => ({ standards, batches, courseTypes, years }),
    [standards, batches, courseTypes, years]
  );

  // Existing names power duplicate detection.
  const { data: existing } = useStudents({ filters: { status: "all" } });
  const existingNames = useMemo(
    () => new Set((existing?.rows ?? []).map((s) => s.name.trim().toLowerCase())),
    [existing]
  );

  const commitMut = useCommitImport();
  const { data: history = [] } = useImportHistory();

  const process = (parsed: ReturnType<typeof csvToImportRows>): ImportRowPreview[] => {
    const seen = new Set<string>();
    return parsed.map(({ student: raw, academic }, i) => {
      const name = (raw.name ?? "").trim();
      const key = name.toLowerCase();
      const resolved = resolveAcademic(academic, lookups);

      const messages: string[] = [];
      let status: ImportRowPreview["status"] = "valid";

      if (!name) {
        status = "error";
        messages.push("Missing student name");
      } else if (resolved.errors.length > 0) {
        status = "error";
        messages.push(...resolved.errors);
      } else if (existingNames.has(key) || seen.has(key)) {
        status = "duplicate";
        messages.push("A student with this name already exists");
      }
      seen.add(key);

      // Merge resolved ids into the write payload so commit links the student.
      const student: StudentWriteInput = {
        ...raw,
        ...(resolved.standardId ? { standardId: resolved.standardId } : {}),
        ...(resolved.batchId ? { batchId: resolved.batchId } : {}),
        ...(resolved.courseTypeId ? { courseTypeId: resolved.courseTypeId } : {}),
        ...(resolved.academicYearId
          ? { academicYearId: resolved.academicYearId }
          : {}),
      };

      return {
        rowNumber: i + 2,
        name: name || "(blank)",
        status,
        messages,
        student,
        resolved,
        raw: academic,
      };
    });
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setLastRun(null);
    const text = await file.text();
    setResults(process(csvToImportRows(parseCsv(text))));
  };

  const summary = useMemo(() => {
    const valid = results.filter((r) => r.status === "valid");
    return {
      total: results.length,
      valid,
      validCount: valid.length,
      duplicate: results.filter((r) => r.status === "duplicate").length,
      error: results.filter((r) => r.status === "error").length,
      validRows: valid.map((r) => r.student),
    };
  }, [results]);

  const reset = () => {
    setResults([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const commit = () => {
    if (summary.validRows.length === 0) return;
    const validPreviews = summary.valid;
    commitMut.mutate(
      { rows: summary.validRows, fileName: fileName || "import.csv" },
      {
        onSuccess: (batch) => {
          setLastRun({
            imported: batch.successRows,
            failed: batch.errorRows,
            duplicates: summary.duplicate,
            batchDist: distributionBy(validPreviews, (r) => r.resolved.batchName),
            standardDist: distributionBy(
              validPreviews,
              (r) => r.resolved.standardName
            ),
          });
          reset();
        },
      }
    );
  };

  const downloadTemplate = () => downloadCsv("student-import-template.csv", TEMPLATE);

  const downloadErrors = () => {
    const bad = results.filter((r) => r.status !== "valid");
    if (bad.length === 0) return;
    const headers = [
      "row",
      "name",
      "status",
      "standard_name",
      "batch_name",
      "course_type_name",
      "academic_year_name",
      "validation_reason",
    ];
    const lines = bad.map((r) =>
      [
        r.rowNumber,
        r.name,
        r.status,
        r.raw.standardName ?? "",
        r.raw.batchName ?? "",
        r.raw.courseTypeName ?? "",
        r.raw.academicYearName ?? "",
        r.messages.join("; "),
      ]
        .map(escapeCsv)
        .join(",")
    );
    downloadCsv("student-import-errors.csv", [headers.join(","), ...lines].join("\n"));
  };

  return (
    <StudentPageShell
      title="Students Import"
      description="Bulk-import students from a CSV file with academic mapping, validation preview and duplicate detection."
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
                Import instructions
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li>First row must be the column headers.</li>
                <li>
                  <code>name</code> is required. All other columns are optional.
                </li>
                <li>
                  Academic columns link each student to Setup records by name —
                  matching is case-insensitive and ignores spaces/dashes.
                </li>
                <li>Rows with unknown references are flagged and skipped.</li>
                <li>Old templates without academic columns still import.</li>
              </ul>
            </div>
            <div className="glass-card p-4 space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <FileSpreadsheet className="w-4 h-4 text-accent" />
                Academic mapping columns
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="font-mono text-foreground">standard_name</span>
                <span className="text-muted-foreground">{standards.length} in Setup</span>
                <span className="font-mono text-foreground">batch_name</span>
                <span className="text-muted-foreground">{batches.length} in Setup</span>
                <span className="font-mono text-foreground">course_type_name</span>
                <span className="text-muted-foreground">
                  {courseTypes.length} in Setup
                </span>
                <span className="font-mono text-foreground">academic_year_name</span>
                <span className="text-muted-foreground">{years.length} in Setup</span>
              </div>
            </div>
          </div>

          {/* Upload */}
          <div className="glass-card p-6 flex flex-col items-center gap-3 text-center">
            <span className="flex w-12 h-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Upload className="w-6 h-6" />
            </span>
            <div>
              <p className="text-sm font-medium">
                {fileName || "Choose a CSV file to import"}
              </p>
              <p className="text-xs text-muted-foreground max-w-xl">
                {IMPORT_TEMPLATE_HEADERS.join(", ")}
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                Select CSV
              </Button>
              {results.length > 0 && (
                <Button size="sm" variant="outline" onClick={reset}>
                  Clear
                </Button>
              )}
            </div>
          </div>

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
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
                    Batch distribution
                  </p>
                  <div className="space-y-1">
                    {lastRun.batchDist.map((d) => (
                      <div key={d.name} className="flex justify-between text-sm">
                        <span>{d.name}</span>
                        <span className="font-medium">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
                    Standard distribution
                  </p>
                  <div className="space-y-1">
                    {lastRun.standardDist.map((d) => (
                      <div key={d.name} className="flex justify-between text-sm">
                        <span>{d.name}</span>
                        <span className="font-medium">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile label="Rows" value={summary.total} />
                <StatTile label="Valid" value={summary.validCount} tone="positive" />
                <StatTile label="Duplicates" value={summary.duplicate} tone="warning" />
                <StatTile label="Errors" value={summary.error} tone="danger" />
              </div>

              <div className="flex items-center justify-end gap-2">
                {summary.error + summary.duplicate > 0 && (
                  <Button variant="outline" size="sm" onClick={downloadErrors}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download failed rows
                  </Button>
                )}
                <Button
                  onClick={commit}
                  disabled={summary.validCount === 0 || commitMut.isPending}
                >
                  {commitMut.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Import {summary.validCount} valid student
                  {summary.validCount === 1 ? "" : "s"}
                </Button>
              </div>

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
                            {r.status === "duplicate" && (
                              <AlertTriangle className="w-3 h-3" />
                            )}
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
                description="Completed CSV imports will be logged here."
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
    </StudentPageShell>
  );
};

export default StudentsImportPage;
