import { BaseService, AppError, safeInsertWithColumnFallback } from "@/shared/services";
import type {
  ImportBatch,
  ImportControl,
  ImportRunStats,
  StudentWriteInput,
} from "../types/student.types";
import { studentsService } from "./students.service";
import type { CreatedAcademicSummary } from "./academicProvision.service";

type BatchRow = {
  id: string;
  file_name: string | null;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  updated_rows?: number | null;
  skipped_rows?: number | null;
  warning_rows?: number | null;
  families?: number | null;
  duration_ms?: number | null;
  status?: string | null;
  rolled_back_at?: string | null;
  imported_by: string | null;
  created_at: string | null;
};

const toDomain = (r: BatchRow): ImportBatch => ({
  id: r.id,
  fileName: r.file_name ?? undefined,
  totalRows: r.total_rows,
  successRows: r.success_rows,
  errorRows: r.error_rows,
  updatedRows: r.updated_rows ?? undefined,
  skippedRows: r.skipped_rows ?? undefined,
  warningRows: r.warning_rows ?? undefined,
  families: r.families ?? undefined,
  durationMs: r.duration_ms ?? undefined,
  status: r.status ?? undefined,
  rolledBackAt: r.rolled_back_at ?? undefined,
  importedBy: r.imported_by ?? undefined,
  createdAt: r.created_at ?? undefined,
});

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("column");
};

/** Progress callback fired after each processed chunk. */
export type ImportProgress = (done: number, total: number) => void;

/**
 * A commit plan splits the approved rows by the operator's per-row duplicate
 * action: `inserts` create new students, `updates` patch a matched existing
 * student (the Merge / Update Existing actions). Skipped rows never reach here.
 */
export interface ImportPlan {
  inserts: StudentWriteInput[];
  // Incremental updates carry ONLY the changed fields (Partial) — never blanks.
  updates: { id: string; data: Partial<StudentWriteInput> }[];
}

export interface CommitOptions {
  importedBy?: string;
  onProgress?: ImportProgress;
  createdAcademic?: CreatedAcademicSummary;
  /** Run-level counts the page computed from the preview (stored with batch). */
  stats?: ImportRunStats;
  /** Cooperative pause / cancel control for big files. */
  control?: ImportControl;
}

// Rows are committed in bounded-concurrency chunks: large enough to keep a
// 20,000-row import fast, small enough not to flood Supabase with connections
// or hold the whole result set in memory.
const CHUNK_SIZE = 25;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** UUID for a batch — generated client-side so inserted students can be tagged
 *  with it BEFORE the history row exists (enables rollback). */
const newBatchId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

/**
 * Student import service. Validation / duplicate-preview happens in the page
 * (importMapping.buildImportPreview); the commit persists the approved plan,
 * tags every created student with the batch id (for rollback), records an
 * import-history entry, and writes an audit trail.
 */
class ImportService extends BaseService {
  /** Insert-only commit — preserved for back-compat. Delegates to commitPlan. */
  async commit(
    rows: StudentWriteInput[],
    fileName: string,
    importedBy?: string,
    onProgress?: ImportProgress,
    createdAcademic?: CreatedAcademicSummary
  ): Promise<ImportBatch> {
    return this.commitPlan({ inserts: rows, updates: [] }, fileName, {
      importedBy,
      onProgress,
      createdAcademic,
    });
  }

  /**
   * Commit a duplicate-aware plan: create the `inserts` (tagged with the batch
   * id) and patch the `updates` (Merge / Update Existing). Every row is isolated
   * (Promise.allSettled) so one bad row can't abort the run; chunks are bounded
   * for memory safety on 20k+ files. Honors pause / cancel between chunks.
   * Records one history row + audit entry and returns the run analytics.
   */
  async commitPlan(
    plan: ImportPlan,
    fileName: string,
    opts: CommitOptions = {}
  ): Promise<ImportBatch> {
    const { importedBy, onProgress, createdAcademic, stats, control } = opts;
    const startedAt = Date.now();
    const batchId = newBatchId();
    let created = 0;
    let updated = 0;
    let errors = 0;
    let done = 0;
    let cancelled = false;
    const total = plan.inserts.length + plan.updates.length;
    const dropped = new Set<string>();
    const collectDropped = (cols: string[]) => cols.forEach((c) => dropped.add(c));

    // Pause loop: block between chunks while paused, bail if cancelled.
    const gate = async (): Promise<boolean> => {
      if (control?.isCancelled()) return false;
      while (control?.isPaused() && !control.isCancelled()) await sleep(150);
      return !control?.isCancelled();
    };

    // Phase 1 — inserts (tagged with the batch id so rollback can find them).
    for (let i = 0; i < plan.inserts.length; i += CHUNK_SIZE) {
      if (!(await gate())) { cancelled = true; break; }
      const chunk = plan.inserts.slice(i, i + CHUNK_SIZE);
      const settled = await Promise.allSettled(
        chunk.map((row) =>
          studentsService.create(
            { ...row, importBatchId: batchId },
            { onColumnsDropped: collectDropped }
          )
        )
      );
      for (const r of settled) {
        if (r.status === "fulfilled") created++;
        else errors++;
      }
      done += chunk.length;
      onProgress?.(done, total);
    }

    // Phase 2 — updates (Merge / Update Existing). Skipped if cancelled.
    if (!cancelled) {
      for (let i = 0; i < plan.updates.length; i += CHUNK_SIZE) {
        if (!(await gate())) { cancelled = true; break; }
        const chunk = plan.updates.slice(i, i + CHUNK_SIZE);
        const settled = await Promise.allSettled(
          chunk.map((u) => studentsService.update(u.id, u.data, { onColumnsDropped: collectDropped }))
        );
        for (const r of settled) {
          if (r.status === "fulfilled") updated++;
          else errors++;
        }
        done += chunk.length;
        onProgress?.(done, total);
      }
    }

    const droppedColumns = dropped.size > 0 ? [...dropped] : undefined;
    const durationMs = Date.now() - startedAt;
    const status = cancelled ? "cancelled" : "completed";

    const batchRow: Record<string, unknown> = {
      id: batchId,
      file_name: fileName,
      total_rows: total,
      success_rows: created,
      error_rows: errors,
      updated_rows: updated,
      skipped_rows: stats?.skipped ?? 0,
      warning_rows: stats?.warnings ?? 0,
      families: stats?.families ?? 0,
      duration_ms: durationMs,
      status,
      imported_by: importedBy ?? null,
      ...(createdAcademic ? { created_academic: createdAcademic } : {}),
    };
    // Returning only base columns keeps this working before the Phase-2
    // migration adds the rich columns; the rich stats are merged from memory.
    const res = await safeInsertWithColumnFallback<BatchRow>(
      this.db,
      "student_import_batches",
      batchRow,
      {
        returning: "id, file_name, total_rows, success_rows, error_rows, imported_by, created_at",
        label: "student_import_batches",
      }
    );

    const enrich = (b: ImportBatch): ImportBatch => ({
      ...b,
      updatedRows: updated,
      skippedRows: stats?.skipped ?? 0,
      warningRows: stats?.warnings ?? 0,
      families: stats?.families ?? 0,
      durationMs,
      status,
      droppedColumns,
    });

    if (res.error || !res.data) {
      if (tableMissing(res.error)) {
        return enrich({
          id: batchId,
          fileName,
          totalRows: total,
          successRows: created,
          errorRows: errors,
          createdAt: new Date().toISOString(),
        });
      }
      throw AppError.fromSupabase(res.error, "student_import_batches");
    }

    await this.writeAudit("import", batchId, importedBy, {
      file: fileName,
      created,
      updated,
      errors,
      skipped: stats?.skipped ?? 0,
      warnings: stats?.warnings ?? 0,
      families: stats?.families ?? 0,
      durationMs,
      status,
    });

    return enrich(toDomain(res.data));
  }

  /**
   * Undo an import: hard-delete ONLY the students created by that batch and mark
   * the batch rolled back. Manually created students (no batch id) and other
   * imports are never touched. Audited.
   */
  async rollbackBatch(batchId: string, actorId?: string): Promise<{ deleted: number }> {
    const deleted = await studentsService.deleteByBatch(batchId);
    const res = await this.db
      .from("student_import_batches" as never)
      .update({
        status: "rolled_back",
        rolled_back_at: new Date().toISOString(),
        rolled_back_by: actorId ?? null,
      } as never)
      .eq("id", batchId);
    if (res.error && !tableMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "student_import_batches.rollback");
    }
    await this.writeAudit("rollback", batchId, actorId, { deleted });
    return { deleted };
  }

  /** Fire-and-forget audit write — a missing table never blocks the import. */
  private async writeAudit(
    action: "import" | "rollback" | "reopen",
    batchId: string,
    actorId: string | undefined,
    detail: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.db
      .from("student_import_audit" as never)
      .insert({ batch_id: batchId, action, actor_id: actorId ?? null, detail } as never);
    if (error && !tableMissing(error)) {
      console.warn("[student-import.audit]", error.message);
    }
  }

  async history(): Promise<ImportBatch[]> {
    const RICH =
      "id, file_name, total_rows, success_rows, error_rows, updated_rows, skipped_rows, warning_rows, families, duration_ms, status, rolled_back_at, imported_by, created_at";
    const BASE = "id, file_name, total_rows, success_rows, error_rows, imported_by, created_at";
    let res = await this.db
      .from("student_import_batches" as never)
      .select(RICH)
      .order("created_at", { ascending: false })
      .limit(50);
    if (res.error && tableMissing(res.error)) {
      // Rich columns not migrated yet — fall back to the base column set.
      res = await this.db
        .from("student_import_batches" as never)
        .select(BASE)
        .order("created_at", { ascending: false })
        .limit(50);
    }
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_import_batches");
    }
    return ((res.data ?? []) as unknown as BatchRow[]).map(toDomain);
  }
}

export const importService = new ImportService();
