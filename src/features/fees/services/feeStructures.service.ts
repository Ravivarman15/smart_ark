import { BaseService, AppError } from "@/shared/services";
import type {
  CreateFeeStructureInput,
  FeeStructure,
  UpdateFeeStructureInput,
} from "../types/fee.types";

// ── DB row shape (private) ───────────────────────────────────────────────────
type FeeStructureRow = {
  id: string;
  name: string | null;
  course_type_id: string | null;
  standard_id: string | null;
  total_amount: number | string | null;
  tax_id: string | null;
  academic_year_id: string | null;
  seat_confirmation_amount: number | string | null;
  first_payment_amount: number | string | null;
  installment_count: number | null;
  created_at: string;
};

const toDomain = (r: FeeStructureRow): FeeStructure => ({
  id: r.id,
  name: r.name ?? "",
  courseTypeId: r.course_type_id ?? undefined,
  standardId: r.standard_id ?? undefined,
  taxId: r.tax_id ?? undefined,
  academicYearId: r.academic_year_id ?? undefined,
  totalAmount: Number(r.total_amount) || 0,
  seatConfirmationAmount: Number(r.seat_confirmation_amount) || 0,
  firstPaymentAmount: Number(r.first_payment_amount) || 0,
  installmentCount: r.installment_count ?? 0,
  createdAt: r.created_at,
});

const toDb = (i: Partial<CreateFeeStructureInput>) => {
  const out: Record<string, unknown> = {};
  if (i.name !== undefined) out.name = i.name;
  if (i.courseTypeId !== undefined) out.course_type_id = i.courseTypeId || null;
  if (i.standardId !== undefined) out.standard_id = i.standardId || null;
  if (i.academicYearId !== undefined) out.academic_year_id = i.academicYearId || null;
  if (i.taxId !== undefined) out.tax_id = i.taxId || null;
  if (i.totalAmount !== undefined) out.total_amount = i.totalAmount;
  if (i.seatConfirmationAmount !== undefined) out.seat_confirmation_amount = i.seatConfirmationAmount;
  if (i.firstPaymentAmount !== undefined) out.first_payment_amount = i.firstPaymentAmount;
  if (i.installmentCount !== undefined) out.installment_count = i.installmentCount;
  return out;
};

class FeeStructuresService extends BaseService {
  async list(): Promise<FeeStructure[]> {
    const res = await this.db
      .from("fee_structures")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = this.guardList(res, "fee_structures");
    return (rows as unknown as FeeStructureRow[]).map(toDomain);
  }

  async getById(id: string): Promise<FeeStructure> {
    const res = await this.db.from("fee_structures").select("*").eq("id", id).single();
    const row = this.guard(res, "fee_structure");
    return toDomain(row as unknown as FeeStructureRow);
  }

  async create(input: CreateFeeStructureInput): Promise<FeeStructure> {
    const res = await this.db
      .from("fee_structures")
      .insert(toDb(input) as never)
      .select()
      .single();
    const row = this.guard(res, "fee_structure");
    return toDomain(row as unknown as FeeStructureRow);
  }

  async update(id: string, updates: UpdateFeeStructureInput): Promise<void> {
    const patch = toDb(updates);
    if (Object.keys(patch).length === 0) return;
    const { error } = await this.db.from("fee_structures").update(patch as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "fee_structures.update");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("fee_structures").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "fee_structures.delete");
  }
}

export const feeStructuresService = new FeeStructuresService();
