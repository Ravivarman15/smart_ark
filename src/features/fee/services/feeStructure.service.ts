import { BaseService, AppError } from "@/shared/services";
import type {
  FeeStructure,
  FeeStructureInput,
  FeeStructureRevision,
} from "../types/fee.types";

// ─────────────────────────────────────────────────────────────────────────────
// Fee structure service — CRUD for fee templates + an immutable revision log.
//
// MIGRATION SAFETY: the enrichment columns (fee_type, transport_fee, …) and the
// `fee_structure_revisions` table arrive in 20260521_live_classes_and_fee_module.
// Until that migration is applied this service degrades gracefully — selects
// retry with core columns, writes strip the extended keys, and revision logging
// is best-effort. The module therefore runs on the old schema unchanged.
// ─────────────────────────────────────────────────────────────────────────────

type StructureRow = {
  id: string;
  name: string;
  course_type_id: string | null;
  standard_id: string | null;
  academic_year_id: string | null;
  tax_id: string | null;
  total_amount: number | null;
  seat_confirmation_amount: number | null;
  first_payment_amount: number | null;
  installment_count: number | null;
  created_at: string;
  description?: string | null;
  fee_type?: string | null;
  transport_fee?: number | null;
  material_fee?: number | null;
  recurring_interval?: string | null;
  due_day?: number | null;
  batch_id?: string | null;
};

const CORE_COLUMNS =
  "id, name, course_type_id, standard_id, academic_year_id, tax_id, " +
  "total_amount, seat_confirmation_amount, first_payment_amount, " +
  "installment_count, created_at";
const EXTENDED_COLUMNS =
  "description, fee_type, transport_fee, material_fee, recurring_interval, " +
  "due_day, batch_id";
const FULL_COLUMNS = `${CORE_COLUMNS}, ${EXTENDED_COLUMNS}`;

/** Keys stripped from a write when the extended columns are absent. */
const EXTENDED_KEYS = [
  "description",
  "fee_type",
  "transport_fee",
  "material_fee",
  "recurring_interval",
  "due_day",
  "batch_id",
];

const isColumnError = (err: unknown): boolean => {
  const m = (err as { message?: string } | null)?.message;
  return !!m && /column|schema cache|does not exist/i.test(m);
};

const toDomain = (r: StructureRow): FeeStructure => ({
  id: r.id,
  name: r.name,
  description: r.description ?? undefined,
  courseTypeId: r.course_type_id ?? undefined,
  standardId: r.standard_id ?? undefined,
  academicYearId: r.academic_year_id ?? undefined,
  taxId: r.tax_id ?? undefined,
  batchId: r.batch_id ?? undefined,
  totalAmount: Number(r.total_amount ?? 0),
  seatConfirmationAmount: Number(r.seat_confirmation_amount ?? 0),
  firstPaymentAmount: Number(r.first_payment_amount ?? 0),
  installmentCount: Number(r.installment_count ?? 0),
  feeType: (r.fee_type as FeeStructure["feeType"]) ?? "one_time",
  transportFee: Number(r.transport_fee ?? 0),
  materialFee: Number(r.material_fee ?? 0),
  recurringInterval:
    (r.recurring_interval as FeeStructure["recurringInterval"]) ?? undefined,
  dueDay: r.due_day ?? undefined,
  createdAt: r.created_at,
});

const toDb = (i: Partial<FeeStructureInput>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (i.name !== undefined) out.name = i.name;
  if (i.description !== undefined) out.description = i.description ?? null;
  if (i.courseTypeId !== undefined) out.course_type_id = i.courseTypeId ?? null;
  if (i.standardId !== undefined) out.standard_id = i.standardId ?? null;
  if (i.academicYearId !== undefined)
    out.academic_year_id = i.academicYearId ?? null;
  if (i.taxId !== undefined) out.tax_id = i.taxId ?? null;
  if (i.batchId !== undefined) out.batch_id = i.batchId ?? null;
  if (i.feeType !== undefined) out.fee_type = i.feeType;
  if (i.totalAmount !== undefined) out.total_amount = i.totalAmount;
  if (i.seatConfirmationAmount !== undefined)
    out.seat_confirmation_amount = i.seatConfirmationAmount;
  if (i.firstPaymentAmount !== undefined)
    out.first_payment_amount = i.firstPaymentAmount;
  if (i.installmentCount !== undefined)
    out.installment_count = i.installmentCount;
  if (i.transportFee !== undefined) out.transport_fee = i.transportFee;
  if (i.materialFee !== undefined) out.material_fee = i.materialFee;
  if (i.recurringInterval !== undefined)
    out.recurring_interval = i.recurringInterval ?? null;
  if (i.dueDay !== undefined) out.due_day = i.dueDay ?? null;
  return out;
};

const stripExtended = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const clean = { ...payload };
  for (const k of EXTENDED_KEYS) delete clean[k];
  return clean;
};

interface UpdateOpts {
  /** Note stored alongside the revision snapshot. */
  revisionNote?: string;
  revisedBy?: string;
}

class FeeStructureService extends BaseService {
  /** List every fee structure, newest first. */
  async list(): Promise<FeeStructure[]> {
    let res = await this.db
      .from("fee_structures")
      .select(FULL_COLUMNS)
      .order("created_at", { ascending: false });
    if (res.error && isColumnError(res.error)) {
      res = await this.db
        .from("fee_structures")
        .select(CORE_COLUMNS)
        .order("created_at", { ascending: false });
    }
    const rows = this.guardList(res, "fee_structures");
    return (rows as unknown as StructureRow[]).map(toDomain);
  }

  /** Create a fee structure. */
  async create(input: FeeStructureInput): Promise<FeeStructure> {
    const payload = toDb(input);
    let res = await this.db
      .from("fee_structures")
      .insert(payload as never)
      .select(FULL_COLUMNS)
      .single();
    if (res.error && isColumnError(res.error)) {
      res = await this.db
        .from("fee_structures")
        .insert(stripExtended(payload) as never)
        .select(CORE_COLUMNS)
        .single();
    }
    const row = this.guard(res, "fee structure");
    return toDomain(row as unknown as StructureRow);
  }

  /**
   * Update a fee structure. Before writing, the CURRENT row is snapshotted
   * into `fee_structure_revisions` so every edit leaves an audit trail.
   */
  async update(
    id: string,
    input: Partial<FeeStructureInput>,
    opts: UpdateOpts = {},
  ): Promise<void> {
    await this.snapshotRevision(id, opts.revisionNote, opts.revisedBy);

    const payload = toDb(input);
    if (Object.keys(payload).length === 0) return;
    let res = await this.db
      .from("fee_structures")
      .update(payload as never)
      .eq("id", id);
    if (res.error && isColumnError(res.error)) {
      res = await this.db
        .from("fee_structures")
        .update(stripExtended(payload) as never)
        .eq("id", id);
    }
    if (res.error) throw AppError.fromSupabase(res.error, "fee structure");
  }

  /** Delete a fee structure. Linked student fees keep their data (FK SET NULL). */
  async remove(id: string): Promise<void> {
    const { error } = await this.db
      .from("fee_structures")
      .delete()
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "fee structure");
  }

  /** Revision history for one structure, newest first. Empty if unavailable. */
  async listRevisions(structureId: string): Promise<FeeStructureRevision[]> {
    const { data, error } = await this.db
      .from("fee_structure_revisions")
      .select("id, fee_structure_id, snapshot, note, revised_by, created_at")
      .eq("fee_structure_id", structureId)
      .order("created_at", { ascending: false });
    if (error) return []; // table not migrated yet — history simply absent
    return (data ?? []).map((r) => ({
      id: r.id as string,
      feeStructureId: r.fee_structure_id as string,
      snapshot: (r.snapshot as Record<string, unknown>) ?? {},
      note: (r.note as string | null) ?? undefined,
      revisedBy: (r.revised_by as string | null) ?? undefined,
      createdAt: r.created_at as string,
    }));
  }

  /**
   * Best-effort: snapshot the current structure row into the revision log.
   * Never throws — a missing revisions table must not block a legitimate edit.
   */
  private async snapshotRevision(
    structureId: string,
    note?: string,
    revisedBy?: string,
  ): Promise<void> {
    try {
      const { data } = await this.db
        .from("fee_structures")
        .select("*")
        .eq("id", structureId)
        .maybeSingle();
      if (!data) return;
      await this.db.from("fee_structure_revisions").insert({
        fee_structure_id: structureId,
        snapshot: data,
        note: note ?? null,
        revised_by: revisedBy ?? null,
      } as never);
    } catch {
      /* revisions table absent / not writable — skip silently */
    }
  }
}

export const feeStructureService = new FeeStructureService();
