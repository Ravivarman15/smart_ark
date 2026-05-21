import { BaseService, AppError } from "@/shared/services";
import type {
  StudentYearTransfer,
  TransferInput,
  TransferStatus,
} from "../types/student.types";

type TransferRow = {
  id: string;
  student_id: string;
  from_academic_year_id: string | null;
  to_academic_year_id: string | null;
  from_standard_id: string | null;
  to_standard_id: string | null;
  from_batch_id: string | null;
  to_batch_id: string | null;
  status: string;
  note: string | null;
  transferred_by: string | null;
  transferred_at: string | null;
  rolled_back_at: string | null;
  students?: { name?: string | null } | null;
};

const toDomain = (r: TransferRow): StudentYearTransfer => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.students?.name ?? undefined,
  fromAcademicYearId: r.from_academic_year_id ?? undefined,
  toAcademicYearId: r.to_academic_year_id ?? undefined,
  fromStandardId: r.from_standard_id ?? undefined,
  toStandardId: r.to_standard_id ?? undefined,
  fromBatchId: r.from_batch_id ?? undefined,
  toBatchId: r.to_batch_id ?? undefined,
  status: (r.status as TransferStatus) ?? "active",
  note: r.note ?? undefined,
  transferredBy: r.transferred_by ?? undefined,
  transferredAt: r.transferred_at ?? undefined,
  rolledBackAt: r.rolled_back_at ?? undefined,
});

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
};
const isColumnError = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("column") || m.includes("schema cache");
};

const SELECT =
  "id, student_id, from_academic_year_id, to_academic_year_id, from_standard_id, to_standard_id, from_batch_id, to_batch_id, status, note, transferred_by, transferred_at, rolled_back_at, students(name)";

/**
 * Student year transfer — academic-year promotion with batch reassignment.
 * Every promotion writes an immutable `student_year_transfers` row; rollback
 * flips its status to `rolled_back` and restores the student's prior
 * placement, so the audit trail is never destroyed.
 */
class TransferService extends BaseService {
  async list(filters?: { status?: TransferStatus }): Promise<StudentYearTransfer[]> {
    let q = this.db
      .from("student_year_transfers" as never)
      .select(SELECT)
      .order("transferred_at", { ascending: false });
    if (filters?.status) q = q.eq("status", filters.status);
    const res = await q;
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_year_transfers");
    }
    return ((res.data ?? []) as unknown as TransferRow[]).map(toDomain);
  }

  /** Promote a set of students; returns the number transferred. */
  async transfer(input: TransferInput, byProfileId?: string): Promise<number> {
    const cur = await this.db
      .from("students")
      .select("id, academic_year_id, standard_id, batch_id")
      .in("id", input.studentIds);
    // academic_year_id may not exist pre-migration — fall back to a lean read.
    let rows = cur.data as
      | { id: string; academic_year_id: string | null; standard_id: string | null; batch_id: string | null }[]
      | null;
    if (cur.error) {
      if (!isColumnError(cur.error)) throw AppError.fromSupabase(cur.error, "students");
      const lean = await this.db
        .from("students")
        .select("id, standard_id, batch_id")
        .in("id", input.studentIds);
      if (lean.error) throw AppError.fromSupabase(lean.error, "students");
      rows = ((lean.data ?? []) as { id: string; standard_id: string | null; batch_id: string | null }[]).map(
        (r) => ({ ...r, academic_year_id: null })
      );
    }

    let count = 0;
    for (const s of rows ?? []) {
      const tRow = {
        student_id: s.id,
        from_academic_year_id: s.academic_year_id,
        to_academic_year_id: input.toAcademicYearId,
        from_standard_id: s.standard_id,
        to_standard_id: input.toStandardId || null,
        from_batch_id: s.batch_id,
        to_batch_id: input.toBatchId || null,
        status: "active",
        note: input.note || null,
        transferred_by: byProfileId ?? null,
      };
      const ins = await this.db
        .from("student_year_transfers" as never)
        .insert(tRow as never);
      if (ins.error) throw AppError.fromSupabase(ins.error, "student_year_transfers.insert");

      await this.applyPlacement(s.id, {
        academic_year_id: input.toAcademicYearId,
        standard_id: input.toStandardId || s.standard_id,
        batch_id: input.toBatchId || s.batch_id,
      });
      count++;
    }
    return count;
  }

  /** Roll a transfer back: restore the prior placement, mark it rolled_back. */
  async rollback(transferId: string): Promise<void> {
    const res = await this.db
      .from("student_year_transfers" as never)
      .select(SELECT)
      .eq("id", transferId)
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "student_year_transfers");
    const t = toDomain(res.data as unknown as TransferRow);
    if (t.status === "rolled_back") return;

    await this.applyPlacement(t.studentId, {
      academic_year_id: t.fromAcademicYearId ?? null,
      standard_id: t.fromStandardId ?? null,
      batch_id: t.fromBatchId ?? null,
    });
    const { error } = await this.db
      .from("student_year_transfers" as never)
      .update({ status: "rolled_back", rolled_back_at: new Date().toISOString() } as never)
      .eq("id", transferId);
    if (error) throw AppError.fromSupabase(error, "student_year_transfers.rollback");
  }

  /** Update a student's placement, degrading gracefully pre-migration. */
  private async applyPlacement(
    studentId: string,
    patch: { academic_year_id: string | null; standard_id: string | null; batch_id: string | null }
  ): Promise<void> {
    let res = await this.db.from("students").update(patch as never).eq("id", studentId);
    if (res.error && isColumnError(res.error)) {
      const { academic_year_id, ...lean } = patch;
      void academic_year_id;
      res = await this.db.from("students").update(lean as never).eq("id", studentId);
    }
    if (res.error) throw AppError.fromSupabase(res.error, "students.placement");
  }
}

export const transferService = new TransferService();
