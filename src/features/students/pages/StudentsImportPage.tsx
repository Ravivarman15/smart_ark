import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Info,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  useCommitImport,
  useImportHistory,
  useRollbackImport,
} from "../hooks/useStudentImport";
import { academicProvisionService } from "../services/academicProvision.service";
import { formatDateTime, parseSpreadsheet } from "../utils";
import { IMPORT_TEMPLATE_HEADERS, normalizeHeader } from "../utils/constants";
import type { Student } from "../types/student.types";
import { changedPatch, diffStudent } from "../utils/incrementalDiff";
import {
  buildDataHealth,
  rowHealthIssues,
  summarizeImports,
} from "../utils/dataHealth";
import {
  buildDuplicateIndex,
  buildFamilyDashboard,
  buildImportPreview,
  detectColumnMappings,
  detectMissingAcademic,
  distributionBy,
  isMissingAcademicEmpty,
  rowsToImportRecords,
  OVERRIDE_TARGETS,
  type ColumnOverrides,
  type DuplicateAction,
  type ImportLookups,
  type ImportRecord,
  type ImportRowPreview,
  type MissingAcademic,
} from "../utils/importMapping";

// Per-row duplicate actions the operator can choose. Skip / Import as New need
// no existing match; Merge / Update Existing patch the matched student instead.
const DUPLICATE_ACTIONS: { value: DuplicateAction; label: string }[] = [
  { value: "import_new", label: "Import as New" },
  { value: "update_existing", label: "Update Existing" },
  { value: "merge", label: "Merge" },
  { value: "skip", label: "Skip" },
];

// Radix Select forbids an empty-string item value — sentinel for "Ignore column".
const IGNORE = "__ignore__";

const STATUS_LABEL: Record<ImportRowPreview["status"], string> = {
  valid: "valid",
  possible_duplicate: "review",
  duplicate: "duplicate",
  error: "error",
};

/**
 * Resolve a preview + the operator's per-row action overrides into a commit
 * plan. Valid rows always insert; flagged rows follow their action; errors and
 * skips are excluded. Merge / Update Existing patch the matched student when one
 * was found, else fall back to inserting a new record.
 */
type PlanUpdate = { id: string; data: Partial<ImportRowPreview["student"]>; row: ImportRowPreview };

const resolvePlan = (
  rows: ImportRowPreview[],
  actions: Map<number, DuplicateAction>,
  existingById?: Map<string, Student>
): {
  inserts: ImportRowPreview[];
  updates: PlanUpdate[];
  skipped: number;
} => {
  const inserts: ImportRowPreview[] = [];
  const updates: PlanUpdate[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (r.status === "error") continue;
    if (r.status === "valid") {
      inserts.push(r);
      continue;
    }
    const action = actions.get(r.rowNumber) ?? r.suggestedAction;
    if (action === "skip") {
      skipped += 1;
    } else if ((action === "update_existing" || action === "merge") && r.existingId) {
      // Incremental: write ONLY changed fields, never overwrite with blanks.
      const ex = existingById?.get(r.existingId);
      const data = ex ? changedPatch(ex, r.student) : r.student;
      if (Object.keys(data).length === 0) skipped += 1; // nothing changed → ignore
      else updates.push({ id: r.existingId, data, row: r });
    } else {
      inserts.push(r); // import_new, or merge/update with no match → new record
    }
  }
  return { inserts, updates, skipped };
};

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
  possible_duplicate: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  duplicate: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
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
  updated: number;
  failed: number;
  duplicates: number;
  families: number;
  avgConfidence: number;
  durationMs: number;
  rowsPerSec: number;
  status?: string;
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

// One side of the conflict-center comparison (existing vs incoming).
const ConflictCol = ({
  title,
  student,
}: {
  title: string;
  student: {
    name?: string;
    enrolmentNo?: string;
    rollNumber?: string;
    mobile?: string;
    dob?: string;
    className?: string;
  };
}) => (
  <div className="rounded bg-muted/40 p-2">
    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </p>
    <dl className="space-y-0.5">
      {(
        [
          ["Name", student.name],
          ["Admission", student.enrolmentNo],
          ["Roll", student.rollNumber],
          ["Mobile", student.mobile],
          ["DOB", student.dob],
          ["Class", student.className],
        ] as const
      ).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="truncate font-medium">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  </div>
);

const FamilyStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md bg-muted/40 px-2 py-2">
    <p className="text-lg font-semibold">{value}</p>
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
  </div>
);

const StudentsImportPage = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Sibling student routes share a parent path — used by the action center.
  const base = pathname.replace(/\/import$/, "");
  // RBAC: only management / admin may auto-create academic master records.
  const canAutoCreate = user?.role === "management" || user?.role === "admin";
  // RBAC: only admin / management / coordinator may import or roll back.
  const canImport =
    user?.role === "admin" || user?.role === "management" || user?.role === "coordinator";
  const canRollback = user?.role === "admin" || user?.role === "management";

  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  // The raw parsed sheet — records are re-derived from it whenever the operator
  // changes a manual column mapping.
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [overrides, setOverrides] = useState<ColumnOverrides>({});
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [autoCreate, setAutoCreate] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [missing, setMissing] = useState<MissingAcademic | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Per-row duplicate-action overrides (rowNumber → action). Empty = use the
  // engine's suggested action for each flagged row.
  const [actions, setActions] = useState<Map<number, DuplicateAction>>(new Map());
  // Cooperative pause / cancel for the running commit (refs so the running
  // promise reads live values; state mirrors them for the UI).
  const controlRef = useRef({ paused: false, cancelled: false });
  const [paused, setPaused] = useState(false);

  const headers = useMemo(() => matrix[0] ?? [], [matrix]);
  const records = useMemo<ImportRecord[]>(
    () => rowsToImportRecords(matrix, overrides),
    [matrix, overrides]
  );

  // Live Setup-module data drives all name→id resolution. No hardcoded lists.
  const { data: standards = [] } = useStandards();
  const { data: batches = [] } = useBatches();
  const { data: courseTypes = [] } = useCourseTypes();
  const { data: years = [] } = useAcademicYears();
  const lookups = useMemo<ImportLookups>(
    () => ({ standards, batches, courseTypes, years }),
    [standards, batches, courseTypes, years]
  );

  // Existing students power multi-key duplicate detection + the conflict center.
  const { data: existing } = useStudents({ filters: { status: "all" } });
  const existingIndex = useMemo(() => buildDuplicateIndex(existing?.rows ?? []), [existing]);
  const existingById = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of existing?.rows ?? []) m.set(s.id, s);
    return m;
  }, [existing]);

  // Preview is derived — it auto-refreshes once Setup data / existing students
  // finish loading after the file was picked.
  const results = useMemo(
    () => buildImportPreview(records, lookups, existingIndex),
    [records, lookups, existingIndex]
  );
  const detected = useMemo(() => detectColumnMappings(headers), [headers]);

  const commitMut = useCommitImport();
  const rollbackMut = useRollbackImport();
  const { data: history = [] } = useImportHistory();

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setLastRun(null);
    setProgress(null);
    setOverrides({});
    setActions(new Map());
    setParsing(true);
    try {
      const m = await parseSpreadsheet(file);
      if (m.length < 2) {
        toast.error("No data rows found in the file.");
        setMatrix([]);
        return;
      }
      setMatrix(m);
    } catch (e) {
      toast.error(
        e instanceof Error ? `Could not read file: ${e.message}` : "Could not read file"
      );
      setMatrix([]);
    } finally {
      setParsing(false);
    }
  };

  // Manual column-mapping override (by normalised header).
  const setOverride = (header: string, field: string) =>
    setOverrides((prev) => ({ ...prev, [normalizeHeader(header)]: field }));

  // Data-health summary + cross-import dashboard.
  const health = useMemo(() => buildDataHealth(results), [results]);
  const dashboard = useMemo(() => summarizeImports(history), [history]);

  // Family structure of the current preview (siblings sharing a parent).
  const family = useMemo(() => buildFamilyDashboard(results), [results]);
  const familyMembers = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const r of results) if (r.familyId) sizes.set(r.familyId, (sizes.get(r.familyId) ?? 0) + 1);
    return results.filter((r) => r.familyId && (sizes.get(r.familyId) ?? 0) > 1).length;
  }, [results]);

  const summary = useMemo(() => {
    const valid = results.filter((r) => r.status === "valid");
    return {
      total: results.length,
      valid,
      validCount: valid.length,
      possibleDuplicate: results.filter((r) => r.status === "possible_duplicate").length,
      duplicate: results.filter((r) => r.status === "duplicate").length,
      error: results.filter((r) => r.status === "error").length,
      missingAcademic: results.filter((r) => r.missingAcademic).length,
      invalidMobile: results.filter((r) => r.invalidMobile).length,
      missingData: results.filter((r) => r.status !== "error" && r.missingData).length,
      warningRows: results.filter((r) => r.validation.length > 0).length,
    };
  }, [results]);

  // Flagged rows the operator can act on (duplicate + possible duplicate).
  const duplicates = useMemo(
    () => results.filter((r) => r.status === "duplicate" || r.status === "possible_duplicate"),
    [results]
  );

  // The live commit plan after applying per-row actions.
  const plan = useMemo(
    () => resolvePlan(results, actions, existingById),
    [results, actions, existingById]
  );
  const importableCount = plan.inserts.length + plan.updates.length;

  const setAction = (rowNumber: number, action: DuplicateAction) =>
    setActions((prev) => new Map(prev).set(rowNumber, action));
  const applyToAll = (action: DuplicateAction) =>
    setActions(() => new Map(duplicates.map((r) => [r.rowNumber, action] as const)));

  const reset = () => {
    setMatrix([]);
    setOverrides({});
    setFileName("");
    setProgress(null);
    setMissing(null);
    setActions(new Map());
    controlRef.current = { paused: false, cancelled: false };
    setPaused(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Pause / resume / cancel the running commit (cooperative — read between chunks).
  const togglePause = () => {
    controlRef.current.paused = !controlRef.current.paused;
    setPaused(controlRef.current.paused);
  };
  const cancelImport = () => {
    controlRef.current.cancelled = true;
    controlRef.current.paused = false;
    setPaused(false);
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
    const finalPlan = resolvePlan(finalPreviews, actions, existingById);
    const insertRows = finalPlan.inserts.map((r) => r.student);
    const updateRows = finalPlan.updates.map((u) => ({ id: u.id, data: u.data }));
    const committedPreviews = [...finalPlan.inserts, ...finalPlan.updates.map((u) => u.row)];
    if (insertRows.length + updateRows.length === 0) return;

    // Average confidence over the rows actually committed (duplicates that were
    // imported anyway carry their score; brand-new rows are 100% confident-new).
    const avgConfidence = committedPreviews.length
      ? Math.round(
          committedPreviews.reduce((sum, r) => sum + (r.confidence || 0), 0) /
            committedPreviews.length
        )
      : 0;
    const familyCount = buildFamilyDashboard(committedPreviews).familiesCreated;

    controlRef.current = { paused: false, cancelled: false };
    setPaused(false);
    const total = insertRows.length + updateRows.length;
    setProgress({ done: 0, total });
    commitMut.mutate(
      {
        rows: insertRows,
        updates: updateRows,
        fileName: fileName || "import.csv",
        onProgress: (done, t) => setProgress({ done, total: t }),
        createdAcademic: created?.summary,
        stats: { skipped: finalPlan.skipped, warnings: summary.warningRows, families: familyCount },
        control: {
          isPaused: () => controlRef.current.paused,
          isCancelled: () => controlRef.current.cancelled,
        },
      },
      {
        onSuccess: (batch) => {
          const durationMs = batch.durationMs ?? 0;
          setLastRun({
            imported: batch.successRows,
            updated: batch.updatedRows ?? 0,
            failed: batch.errorRows,
            duplicates: finalPlan.skipped,
            families: familyCount,
            avgConfidence,
            durationMs,
            rowsPerSec: durationMs > 0 ? Math.round((batch.totalRows / durationMs) * 1000) : 0,
            status: batch.status,
            batchDist: distributionBy(committedPreviews, (r) => r.resolved.batchName),
            standardDist: distributionBy(committedPreviews, (r) => r.resolved.standardName),
            courseTypeDist: distributionBy(committedPreviews, (r) => r.resolved.courseTypeName),
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
    if (importableCount === 0) return;
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

  // Suggested fix for the error report — actionable, per failure reason.
  const suggestFix = (r: ImportRowPreview): string => {
    if (r.status === "error") return "Add the missing student name";
    if (r.status === "duplicate")
      return r.existingId
        ? "Confirmed match — Skip, or choose Update Existing to refresh the record"
        : "Duplicate within this file — Skip the repeat row";
    if (r.status === "possible_duplicate")
      return "Review the matched fields; Import as New if it's a different student";
    return "";
  };

  // Full import report — every row with its resolved action, status, confidence,
  // family, reason and warnings. Downloadable as CSV or Excel.
  const buildReportRows = (): (string | number)[][] => {
    const header = [
      "row", "name", "status", "action", "confidence", "matched_fields", "family_id",
      "admission_no", "roll_number", "mobile", "email", "class",
      "reason", "warnings", "suggested_fix",
    ];
    const body = results.map((r) => {
      const action = r.status === "valid" ? "import_new" : actions.get(r.rowNumber) ?? r.suggestedAction;
      return [
        r.rowNumber,
        r.name,
        r.status,
        action,
        r.confidence ? `${r.confidence}%` : "",
        r.matchedFields.join(" + "),
        r.familyId ?? "",
        r.dedup.enrolmentNo ?? "",
        r.dedup.rollNumber ?? "",
        r.dedup.mobile ?? "",
        r.dedup.email ?? "",
        r.raw.batchName ?? "",
        r.messages.join("; "),
        r.validation.join("; "),
        suggestFix(r),
      ];
    });
    return [header, ...body];
  };

  const downloadReportCsv = () => {
    if (results.length === 0) return;
    const csv = buildReportRows().map((row) => row.map(escapeCsv).join(",")).join("\n");
    downloadCsv("student-import-report.csv", csv);
  };

  const downloadReportExcel = async () => {
    if (results.length === 0) return;
    const XLSX = await import("xlsx"); // lazy — keep the xlsx bundle off the main chunk
    const ws = XLSX.utils.aoa_to_sheet(buildReportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import Report");
    XLSX.writeFile(wb, "student-import-report.xlsx");
  };

  // Data health report — one row per student with its data gaps.
  const downloadHealthReport = () => {
    if (results.length === 0) return;
    const header = ["row", "name", "family_id", "issues"];
    const rows = results
      .filter((r) => r.status !== "error")
      .map((r) => [r.rowNumber, r.name, r.familyId ?? "", rowHealthIssues(r).join("; ")]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    downloadCsv("student-data-health.csv", csv);
  };

  const requestRollback = async (batchId: string, fileLabel: string) => {
    const ok = await confirm({
      title: "Roll back this import?",
      description: `This permanently deletes only the students created by "${fileLabel}". Manually created students and other imports are not affected.`,
      confirmText: "Roll back",
      type: "danger",
    });
    if (ok) rollbackMut.mutate(batchId);
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
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
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
                  Duplicates use a <span className="font-medium">weighted identity score</span>
                  {" "}(admission/student id, roll+class, name+DOB) — a shared parent mobile is a
                  family signal, never a duplicate.
                </li>
                <li>
                  Siblings sharing one parent mobile are grouped as a family and all imported as
                  distinct students.
                </li>
                <li><code>name</code> is required; flagged rows can be Imported as New, Updated,
                  Merged or Skipped.</li>
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

          {/* Detected column mappings + manual override */}
          {detected.length > 0 && (
            <div className="glass-card p-4 space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 text-accent" />
                Column mapping
                <span className="text-xs font-normal text-muted-foreground">
                  ({detected.filter((d) => d.kind !== "unmapped").length}/{detected.length} auto-matched
                  · override any below)
                </span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {detected.map((d) => {
                  const nh = normalizeHeader(d.sourceHeader);
                  const current = Object.prototype.hasOwnProperty.call(overrides, nh)
                    ? overrides[nh]
                    : d.field ?? "";
                  return (
                    <div
                      key={d.sourceHeader}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/40 px-2 py-1.5"
                    >
                      <span
                        className={`truncate rounded px-1.5 py-0.5 text-xs ${MAPPING_KIND_STYLE[d.kind]}`}
                        title={d.sourceHeader}
                      >
                        {d.sourceHeader}
                      </span>
                      <Select
                        value={current || IGNORE}
                        onValueChange={(v) => setOverride(d.sourceHeader, v === IGNORE ? "" : v)}
                      >
                        <SelectTrigger className="h-7 w-40 text-xs">
                          <SelectValue placeholder="Ignore" />
                        </SelectTrigger>
                        <SelectContent>
                          {OVERRIDE_TARGETS.map((t) => (
                            <SelectItem key={t.value || IGNORE} value={t.value || IGNORE}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Post-import analytics */}
          {lastRun && (
            <div className="glass-card p-5 space-y-4 border border-emerald-500/30">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                {lastRun.status === "cancelled" ? "Import cancelled (partial)" : "Import complete"}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                <StatTile label="Imported" value={lastRun.imported} tone="positive" />
                <StatTile label="Updated" value={lastRun.updated} tone="positive" />
                <StatTile label="Failed" value={lastRun.failed} tone="danger" />
                <StatTile label="Skipped" value={lastRun.duplicates} tone="warning" />
                <StatTile label="Families" value={lastRun.families} />
                <StatTile label="Avg confidence" value={`${lastRun.avgConfidence}%`} />
                <StatTile label="Time" value={`${(lastRun.durationMs / 1000).toFixed(1)}s`} />
                <StatTile label="Rows/sec" value={lastRun.rowsPerSec} />
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

              {/* Post-import action center — one-click jump to the linked module
                  flows (no manual navigation). Records are never auto-created. */}
              <div className="space-y-2 border-t border-border/40 pt-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Next actions
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["Assign Class / Batch", "/assign-batch"],
                      ["Generate Logins / App Access", "/app-access"],
                      ["Send Welcome Message", "/chat"],
                      ["Manage Students", ""],
                    ] as const
                  ).map(([label, suffix]) => (
                    <Button
                      key={label}
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`${base}${suffix}`)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Cross-module linking (Parent accounts, Fee structure, Attendance, Transport,
                  Hostel, Library, Live Class) opens the relevant module — records are created
                  there, never automatically.
                </p>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                <StatTile label="Total rows" value={summary.total} />
                <StatTile label="New students" value={summary.validCount} tone="positive" />
                <StatTile label="Possible duplicates" value={summary.possibleDuplicate} tone="warning" />
                <StatTile label="Duplicates" value={summary.duplicate} tone="warning" />
                <StatTile label="Family members" value={familyMembers} />
                <StatTile label="Missing data" value={summary.missingData} tone="warning" />
                <StatTile label="Invalid mobile" value={summary.invalidMobile} tone="warning" />
                <StatTile label="Errors" value={summary.error} tone="danger" />
              </div>

              {/* Family dashboard — one parent → many students is expected, not a duplicate. */}
              {family.familiesCreated > 0 && (
                <div className="glass-card p-4 space-y-3 border border-sky-500/30">
                  <p className="flex items-center gap-2 text-sm font-medium text-sky-600 dark:text-sky-400">
                    <Users className="w-4 h-4" />
                    Family dashboard
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-center">
                    <FamilyStat label="Families" value={family.familiesCreated} />
                    <FamilyStat label="Parents" value={family.parents} />
                    <FamilyStat label="Children" value={family.children} />
                    <FamilyStat label="Sharing mobile" value={family.sharingMobile} />
                    <FamilyStat label="Sharing address" value={family.sharingAddress} />
                    <FamilyStat label="Sharing parent" value={family.sharingParentName} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Students who share a parent mobile / address are grouped as one family and
                    imported as <span className="font-medium">distinct students</span> — never
                    skipped as duplicates.
                  </p>
                </div>
              )}

              {/* Data health report */}
              <div className="glass-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <HelpCircle className="w-4 h-4 text-accent" />
                    Data health
                  </p>
                  <Button variant="outline" size="sm" onClick={downloadHealthReport}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Health report
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 text-center">
                  <FamilyStat label="No parent mobile" value={health.missingParentMobile} />
                  <FamilyStat label="No email" value={health.missingEmail} />
                  <FamilyStat label="No DOB" value={health.missingDob} />
                  <FamilyStat label="No admission no" value={health.missingAdmission} />
                  <FamilyStat label="No roll no" value={health.missingRoll} />
                  <FamilyStat label="No blood group" value={health.missingBloodGroup} />
                  <FamilyStat label="No address" value={health.missingAddress} />
                  <FamilyStat label="Duplicate parents" value={health.duplicateParentRecords} />
                  <FamilyStat label="Without batch" value={health.withoutBatch} />
                  <FamilyStat label="Without year" value={health.withoutAcademicYear} />
                </div>
              </div>

              {/* Commit progress + pause / resume / cancel */}
              {committing && progress && (
                <div className="glass-card p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {paused ? "Paused" : "Importing students…"} {progress.done}/{progress.total}
                    </p>
                    {commitMut.isPending && (
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={togglePause}>
                          {paused ? <Play className="w-3.5 h-3.5 mr-1" /> : <Pause className="w-3.5 h-3.5 mr-1" />}
                          {paused ? "Resume" : "Pause"}
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={cancelImport}>
                          <X className="w-3.5 h-3.5 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
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
                  <Button variant="outline" size="sm" onClick={downloadReportCsv}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadReportExcel}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Excel
                  </Button>
                  {canImport ? (
                    <Button onClick={commit} disabled={importableCount === 0 || committing}>
                      {committing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {provisioning
                        ? "Creating records…"
                        : `Import ${importableCount} student${importableCount === 1 ? "" : "s"}`}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      You don't have permission to import students.
                    </span>
                  )}
                </div>
              </div>

              {/* Duplicate review — confidence + per-row action + apply-to-all */}
              {duplicates.length > 0 && (
                <div className="glass-card p-4 space-y-3 border border-amber-500/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      Duplicate review ({duplicates.length})
                    </p>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Apply to all:</span>
                      {DUPLICATE_ACTIONS.map((a) => (
                        <Button
                          key={a.value}
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => applyToAll(a.value)}
                          disabled={committing}
                        >
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Conflict center — compare the existing record with the incoming row, then choose
                    an action per row.
                  </p>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {duplicates.map((r) => {
                      const ex = r.existingId ? existingById.get(r.existingId) : undefined;
                      return (
                        <div key={r.rowNumber} className="rounded-md border border-border/40 p-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-medium">Row {r.rowNumber}: {r.name}</span>
                              <span className="ml-2 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 font-medium">
                                {r.confidence}%
                              </span>
                              {r.familyId && (
                                <span className="ml-1.5 text-muted-foreground">· {r.familyId}</span>
                              )}
                              {r.matchedFields.length > 0 && (
                                <span className="ml-1.5 text-muted-foreground">
                                  · matched {r.matchedFields.join(", ")}
                                </span>
                              )}
                            </div>
                            <Select
                              value={actions.get(r.rowNumber) ?? r.suggestedAction}
                              onValueChange={(v) => setAction(r.rowNumber, v as DuplicateAction)}
                              disabled={committing}
                            >
                              <SelectTrigger className="h-8 w-40 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DUPLICATE_ACTIONS.map((a) => (
                                  <SelectItem
                                    key={a.value}
                                    value={a.value}
                                    disabled={
                                      (a.value === "update_existing" || a.value === "merge") &&
                                      !r.existingId
                                    }
                                  >
                                    {a.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {ex ? (
                            <div className="mt-1.5 grid grid-cols-2 gap-2">
                              <ConflictCol title="Existing record" student={{
                                name: ex.name,
                                enrolmentNo: ex.enrolmentNo,
                                rollNumber: ex.rollNumber,
                                mobile: ex.parentContact || ex.studentContact,
                                dob: ex.dateOfBirth,
                                className: ex.batch || ex.standardName,
                              }} />
                              <ConflictCol title="Incoming row" student={{
                                name: r.student.name,
                                enrolmentNo: r.student.enrolmentNo,
                                rollNumber: r.student.rollNumber,
                                mobile: r.student.parentContact || r.student.studentContact,
                                dob: r.student.dateOfBirth,
                                className: r.raw.batchName,
                              }} />
                            </div>
                          ) : (
                            <p className="mt-1 text-muted-foreground">{r.messages.join("; ")}</p>
                          )}
                          {/* Incremental change list — only when Update/Merge is chosen. */}
                          {ex && ["update_existing", "merge"].includes(actions.get(r.rowNumber) ?? r.suggestedAction) && (() => {
                            const diffs = diffStudent(ex, r.student);
                            return (
                              <div className="mt-1.5 rounded bg-amber-500/10 p-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                  {diffs.length === 0
                                    ? "No changed fields — nothing to update"
                                    : `${diffs.length} changed field${diffs.length === 1 ? "" : "s"} (only these are written)`}
                                </p>
                                {diffs.map((d) => (
                                  <div key={d.field} className="flex gap-2">
                                    <span className="text-muted-foreground">{d.label}:</span>
                                    <span className="line-through opacity-70">{d.prev || "—"}</span>
                                    <span>→</span>
                                    <span className="font-medium">{d.next}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
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
                      <th className="px-4 py-2.5 text-left font-medium">Family</th>
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
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {r.familyId ?? "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                              STATUS_STYLE[r.status]
                            }`}
                          >
                            {r.status === "valid" && <CheckCircle2 className="w-3 h-3" />}
                            {r.status === "possible_duplicate" && <HelpCircle className="w-3 h-3" />}
                            {r.status === "duplicate" && <AlertTriangle className="w-3 h-3" />}
                            {r.status === "error" && <XCircle className="w-3 h-3" />}
                            {STATUS_LABEL[r.status]}
                            {r.status !== "valid" && r.status !== "error" && r.confidence > 0 && (
                              <span className="opacity-70">· {r.confidence}%</span>
                            )}
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
            <div className="glass-card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">File</th>
                    <th className="px-4 py-2.5 text-left font-medium">When</th>
                    <th className="px-4 py-2.5 text-center font-medium">Total</th>
                    <th className="px-4 py-2.5 text-center font-medium">Imported</th>
                    <th className="px-4 py-2.5 text-center font-medium">Updated</th>
                    <th className="px-4 py-2.5 text-center font-medium">Skipped</th>
                    <th className="px-4 py-2.5 text-center font-medium">Failed</th>
                    <th className="px-4 py-2.5 text-center font-medium">Families</th>
                    <th className="px-4 py-2.5 text-center font-medium">Time</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {history.map((b) => {
                    const rolledBack = b.status === "rolled_back";
                    return (
                      <tr key={b.id} className={rolledBack ? "opacity-60" : ""}>
                        <td className="px-4 py-2.5 font-medium">{b.fileName ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {formatDateTime(b.createdAt)}
                        </td>
                        <td className="px-4 py-2.5 text-center">{b.totalRows}</td>
                        <td className="px-4 py-2.5 text-center text-emerald-600">{b.successRows}</td>
                        <td className="px-4 py-2.5 text-center">{b.updatedRows ?? 0}</td>
                        <td className="px-4 py-2.5 text-center">{b.skippedRows ?? 0}</td>
                        <td className="px-4 py-2.5 text-center text-red-600">{b.errorRows}</td>
                        <td className="px-4 py-2.5 text-center">{b.families ?? 0}</td>
                        <td className="px-4 py-2.5 text-center text-muted-foreground">
                          {b.durationMs ? `${(b.durationMs / 1000).toFixed(1)}s` : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs capitalize text-muted-foreground">
                            {(b.status ?? "completed").replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {canRollback && !rolledBack && b.successRows > 0 && b.id !== "unsaved" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => requestRollback(b.id, b.fileName ?? "this import")}
                              disabled={rollbackMut.isPending}
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              Roll back
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          {history.length === 0 ? (
            <div className="glass-card">
              <EmptyState
                icon={<FileSpreadsheet className="w-5 h-5" />}
                title="No imports yet"
                description="Run an import to see lifetime analytics."
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                <StatTile label="Total imports" value={dashboard.totalImports} />
                <StatTile label="Students imported" value={dashboard.studentsImported} tone="positive" />
                <StatTile label="Updated" value={dashboard.updated} />
                <StatTile label="Skipped" value={dashboard.skipped} tone="warning" />
                <StatTile label="Families" value={dashboard.families} />
                <StatTile label="Rolled back" value={dashboard.rolledBack} tone="danger" />
                <StatTile label="Errors" value={dashboard.totalErrors} tone="danger" />
                <StatTile
                  label="Avg time"
                  value={dashboard.avgProcessingMs ? `${(dashboard.avgProcessingMs / 1000).toFixed(1)}s` : "—"}
                />
              </div>
              <div className="glass-card p-4 space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">Recent imports</p>
                <div className="space-y-1 text-sm">
                  {history.slice(0, 8).map((b) => (
                    <div key={b.id} className="flex justify-between gap-3 border-b border-border/30 py-1">
                      <span className="truncate font-medium">{b.fileName ?? "—"}</span>
                      <span className="text-muted-foreground">
                        {b.successRows} imported · {b.updatedRows ?? 0} updated ·{" "}
                        {(b.status ?? "completed").replace("_", " ")} · {formatDateTime(b.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
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
