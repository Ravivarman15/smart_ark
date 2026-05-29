import { BaseService, AppError } from "@/shared/services";
import type { ImportBatch, StudentWriteInput } from "../types/student.types";
import { studentsService } from "./students.service";

type BatchRow = {
  id: string;
  file_name: string | null;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  imported_by: string | null;
  created_at: string | null;
};

const toDomain = (r: BatchRow): ImportBatch => ({
  id: r.id,
  fileName: r.file_name ?? undefined,
  totalRows: r.total_rows,
  successRows: r.success_rows,
  errorRows: r.error_rows,
  importedBy: r.imported_by ?? undefined,
  createdAt: r.created_at ?? undefined,
});

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
};

/** Progress callback fired after each processed chunk. */
export type ImportProgress = (done: number, total: number) => void;

// Rows are committed in bounded-concurrency chunks: large enough to keep a
// 1000+ row import fast, small enough not to flood Supabase with connections.
const CHUNK_SIZE = 25;

/**
 * Student import. Validation / duplicate-preview happens in the page
 * (importMapping.buildImportPreview); `commit` persists the approved rows and
 * records an import-history entry.
 */
class ImportService extends BaseService {
  /**
   * Insert approved rows in concurrent chunks. Each row is isolated in its own
   * try/catch (via Promise.allSettled) so a single bad row can't abort the run
   * — "transaction-safe" at the run level. `onProgress` is called after every
   * chunk so the UI can render a live progress bar for big files.
   */
  async commit(
    rows: StudentWriteInput[],
    fileName: string,
    importedBy?: string,
    onProgress?: ImportProgress
  ): Promise<ImportBatch> {
    let success = 0;
    let errors = 0;
    let done = 0;
    const total = rows.length;
    // Aggregate columns dropped across all rows so the run can warn ONCE that
    // the schema is mid-migration — instead of one toast per row.
    const dropped = new Set<string>();
    const collectDropped = (cols: string[]) => cols.forEach((c) => dropped.add(c));

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const settled = await Promise.allSettled(
        chunk.map((row) => studentsService.create(row, { onColumnsDropped: collectDropped }))
      );
      for (const r of settled) {
        if (r.status === "fulfilled") success++;
        else errors++;
      }
      done += chunk.length;
      onProgress?.(done, total);
    }
    const droppedColumns = dropped.size > 0 ? [...dropped] : undefined;

    const batchRow = {
      file_name: fileName,
      total_rows: rows.length,
      success_rows: success,
      error_rows: errors,
      imported_by: importedBy ?? null,
    };
    const res = await this.db
      .from("student_import_batches" as never)
      .insert(batchRow as never)
      .select("id, file_name, total_rows, success_rows, error_rows, imported_by, created_at")
      .single();
    if (res.error) {
      if (tableMissing(res.error)) {
        // History table absent — still report the run outcome to the caller.
        return {
          id: "unsaved",
          fileName,
          totalRows: rows.length,
          successRows: success,
          errorRows: errors,
          createdAt: new Date().toISOString(),
          droppedColumns,
        };
      }
      throw AppError.fromSupabase(res.error, "student_import_batches");
    }
    return { ...toDomain(res.data as unknown as BatchRow), droppedColumns };
  }

  async history(): Promise<ImportBatch[]> {
    const res = await this.db
      .from("student_import_batches" as never)
      .select("id, file_name, total_rows, success_rows, error_rows, imported_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_import_batches");
    }
    return ((res.data ?? []) as unknown as BatchRow[]).map(toDomain);
  }
}

export const importService = new ImportService();
