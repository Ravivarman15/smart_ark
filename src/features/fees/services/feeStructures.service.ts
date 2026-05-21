import { BaseService, AppError } from "@/shared/services";
import type {
  CreateFeeStructureInput,
  FeeStructure,
  FeeStructureRevision,
  FeeType,
  RecurringInterval,
  UpdateFeeStructureInput,
} from "../types/fee.types";

// Columns introduced by the 2026-05-21 migration. When the DB is older the
// service strips these and retries so create/update still succeeds.
const NEW_COLUMNS = [
  "description",
  "fee_type",
  "discount_amount",
  "transport_fee",
  "material_fee",
  "recurring_interval",
  "due_day",
  "batch_id",
];

const isColumnError = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("column") || m.includes("schema cache");
};
const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

// ── DB row shape (private) ───────────────────────────────────────────────────
type FeeStructureRow = {
  id: string;
  name: string | null;
  description: string | null;
  course_type_id: string | null;
  course_type: string | null;
  standard_id: string | null;
  standard_name: string | null;
  batch_id: string | null;
  tax_id: string | null;
  academic_year_id: string | null;
  fee_type: string | null;
  total_amount: number | string | null;
  fee_amount: number | string | null;
  transport_fee: number | string | null;
  material_fee: number | string | null;
  discount_amount: number | string | null;
  seat_confirmation_amount: number | string | null;
  first_payment_amount: number | string | null;
  installment_count: number | null;
  recurring_interval: string | null;
  due_day: number | null;
  is_active: boolean | null;
  total_students: number | null;
  created_at: string;
};

const num = (v: unknown): number => Number(v) || 0;

const toDomain = (r: FeeStructureRow): FeeStructure => ({
  id: r.id,
  name: r.name ?? "",
  description: r.description ?? undefined,
  courseTypeId: r.course_type_id ?? undefined,
  courseType: r.course_type ?? undefined,
  standardId: r.standard_id ?? undefined,
  standardName: r.standard_name ?? undefined,
  batchId: r.batch_id ?? undefined,
  taxId: r.tax_id ?? undefined,
  academicYearId: r.academic_year_id ?? undefined,
  feeType: (r.fee_type as FeeType) ?? "one_time",
  totalAmount: num(r.total_amount ?? r.fee_amount),
  transportFee: num(r.transport_fee),
  materialFee: num(r.material_fee),
  discountAmount: num(r.discount_amount),
  seatConfirmationAmount: num(r.seat_confirmation_amount),
  firstPaymentAmount: num(r.first_payment_amount),
  installmentCount: r.installment_count ?? 0,
  recurringInterval: (r.recurring_interval as RecurringInterval) ?? undefined,
  dueDay: r.due_day ?? undefined,
  isActive: r.is_active ?? true,
  totalStudents: r.total_students ?? 0,
  createdAt: r.created_at,
});

class FeeStructuresService extends BaseService {
  /** Resolve denormalised course-type / standard labels from picker ids. */
  private async resolveLabels(
    courseTypeId?: string,
    standardId?: string
  ): Promise<{ courseType: string; standardName: string }> {
    const [ct, st] = await Promise.all([
      courseTypeId
        ? this.db.from("course_types").select("name").eq("id", courseTypeId).maybeSingle()
        : Promise.resolve({ data: null }),
      standardId
        ? this.db.from("standards").select("name").eq("id", standardId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      courseType: (ct.data as { name?: string } | null)?.name ?? "General",
      standardName: (st.data as { name?: string } | null)?.name ?? "—",
    };
  }

  private toDb(
    i: Partial<CreateFeeStructureInput>,
    labels?: { courseType: string; standardName: string }
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (i.name !== undefined) out.name = i.name;
    if (i.description !== undefined) out.description = i.description || null;
    if (i.courseTypeId !== undefined) out.course_type_id = i.courseTypeId || null;
    if (i.standardId !== undefined) out.standard_id = i.standardId || null;
    if (i.batchId !== undefined) out.batch_id = i.batchId || null;
    if (i.academicYearId !== undefined) out.academic_year_id = i.academicYearId || null;
    if (i.taxId !== undefined) out.tax_id = i.taxId || null;
    if (i.feeType !== undefined) out.fee_type = i.feeType;
    if (i.totalAmount !== undefined) {
      out.total_amount = i.totalAmount;
      out.fee_amount = i.totalAmount; // keep legacy column in sync
    }
    if (i.transportFee !== undefined) out.transport_fee = i.transportFee;
    if (i.materialFee !== undefined) out.material_fee = i.materialFee;
    if (i.discountAmount !== undefined) out.discount_amount = i.discountAmount;
    if (i.seatConfirmationAmount !== undefined)
      out.seat_confirmation_amount = i.seatConfirmationAmount;
    if (i.firstPaymentAmount !== undefined) out.first_payment_amount = i.firstPaymentAmount;
    if (i.installmentCount !== undefined) out.installment_count = i.installmentCount;
    if (i.recurringInterval !== undefined) out.recurring_interval = i.recurringInterval || null;
    if (i.dueDay !== undefined) out.due_day = i.dueDay ?? null;
    if (i.isActive !== undefined) out.is_active = i.isActive;
    if (labels) {
      out.course_type = labels.courseType;
      out.standard_name = labels.standardName;
    }
    return out;
  }

  /** Insert/update, stripping migration-only columns if the DB is older. */
  private stripNewColumns(payload: Record<string, unknown>): Record<string, unknown> {
    const copy = { ...payload };
    for (const c of NEW_COLUMNS) delete copy[c];
    return copy;
  }

  async list(filters: {
    search?: string;
    isActive?: boolean;
    feeType?: FeeType;
  } = {}): Promise<FeeStructure[]> {
    const res = await this.db
      .from("fee_structures")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = this.guardList(res, "fee_structures") as unknown as FeeStructureRow[];
    let structures = rows.map(toDomain);
    if (filters.isActive !== undefined)
      structures = structures.filter((s) => s.isActive === filters.isActive);
    if (filters.feeType) structures = structures.filter((s) => s.feeType === filters.feeType);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      structures = structures.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.standardName ?? "").toLowerCase().includes(q) ||
          (s.courseType ?? "").toLowerCase().includes(q)
      );
    }
    return structures;
  }

  async getById(id: string): Promise<FeeStructure> {
    const res = await this.db.from("fee_structures").select("*").eq("id", id).single();
    const row = this.guard(res, "fee_structure");
    return toDomain(row as unknown as FeeStructureRow);
  }

  async create(input: CreateFeeStructureInput): Promise<FeeStructure> {
    const labels = await this.resolveLabels(input.courseTypeId, input.standardId);
    const payload = this.toDb(input, labels);

    let res = await this.db
      .from("fee_structures")
      .insert(payload as never)
      .select()
      .single();
    if (res.error && isColumnError(res.error)) {
      res = await this.db
        .from("fee_structures")
        .insert(this.stripNewColumns(payload) as never)
        .select()
        .single();
    }
    const row = this.guard(res, "fee_structure");
    return toDomain(row as unknown as FeeStructureRow);
  }

  async update(id: string, updates: UpdateFeeStructureInput): Promise<void> {
    // Snapshot the current row into the revision history first.
    await this.recordRevision(id, "Structure updated");

    const labels =
      updates.courseTypeId !== undefined || updates.standardId !== undefined
        ? await this.resolveLabels(updates.courseTypeId, updates.standardId)
        : undefined;
    const payload = this.toDb(updates, labels);
    if (Object.keys(payload).length === 0) return;

    let res = await this.db.from("fee_structures").update(payload as never).eq("id", id);
    if (res.error && isColumnError(res.error)) {
      res = await this.db
        .from("fee_structures")
        .update(this.stripNewColumns(payload) as never)
        .eq("id", id);
    }
    if (res.error) throw AppError.fromSupabase(res.error, "fee_structures.update");
  }

  /** Activate / deactivate a structure (deactivated structures stay assignable in history). */
  async setActive(id: string, isActive: boolean): Promise<void> {
    const res = await this.db
      .from("fee_structures")
      .update({ is_active: isActive } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "fee_structures.setActive");
  }

  /** Clone a structure as a fresh draft ("… (Copy)"). */
  async duplicate(id: string): Promise<FeeStructure> {
    const src = await this.getById(id);
    return this.create({
      name: `${src.name} (Copy)`,
      description: src.description,
      courseTypeId: src.courseTypeId,
      standardId: src.standardId,
      batchId: src.batchId,
      taxId: src.taxId,
      academicYearId: src.academicYearId,
      feeType: src.feeType,
      totalAmount: src.totalAmount,
      transportFee: src.transportFee,
      materialFee: src.materialFee,
      discountAmount: src.discountAmount,
      seatConfirmationAmount: src.seatConfirmationAmount,
      firstPaymentAmount: src.firstPaymentAmount,
      installmentCount: src.installmentCount,
      recurringInterval: src.recurringInterval,
      dueDay: src.dueDay,
      isActive: false,
    });
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("fee_structures").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "fee_structures.delete");
  }

  // ── Revisions / history ────────────────────────────────────────────────────
  /** Snapshot the current structure into fee_structure_revisions. Best-effort. */
  private async recordRevision(id: string, note: string): Promise<void> {
    try {
      const current = await this.getById(id);
      const res = await this.db.from("fee_structure_revisions" as never).insert({
        fee_structure_id: id,
        snapshot: current as unknown as Record<string, unknown>,
        note,
      } as never);
      if (res.error && !tableMissing(res.error)) {
        throw AppError.fromSupabase(res.error, "fee_structure_revisions.insert");
      }
    } catch {
      /* history is best-effort — never block the edit */
    }
  }

  /** History of edits for a structure (newest first). Empty pre-migration. */
  async listRevisions(id: string): Promise<FeeStructureRevision[]> {
    const res = await this.db
      .from("fee_structure_revisions" as never)
      .select("*")
      .eq("fee_structure_id", id)
      .order("created_at", { ascending: false });
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "fee_structure_revisions.list");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      feeStructureId: String(r.fee_structure_id),
      snapshot: (r.snapshot as Record<string, unknown>) ?? {},
      note: (r.note as string) ?? undefined,
      createdAt: String(r.created_at),
    }));
  }
}

export const feeStructuresService = new FeeStructuresService();
