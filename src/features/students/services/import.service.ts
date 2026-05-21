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

/**
 * Student CSV import. Validation / duplicate-preview happens in the page
 * (utils.csvToStudentRows + a name check); `commit` persists the approved
 * rows and records an import-history entry.
 */
class ImportService extends BaseService {
  /** Insert approved rows one-by-one so a single bad row can't abort the run. */
  async commit(
    rows: StudentWriteInput[],
    fileName: string,
    importedBy?: string
  ): Promise<ImportBatch> {
    let success = 0;
    let errors = 0;
    for (const row of rows) {
      try {
        await studentsService.create(row);
        success++;
      } catch {
        errors++;
      }
    }

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
        };
      }
      throw AppError.fromSupabase(res.error, "student_import_batches");
    }
    return toDomain(res.data as unknown as BatchRow);
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
