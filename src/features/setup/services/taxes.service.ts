import { BaseService, AppError } from "@/shared/services";
import type { Tax, TaxInput } from "../types/setup.types";

type DbRow = {
  id: string;
  name: string;
  percentage: number | null;
  amount?: number | null;
  tax_type?: string | null;
  is_active: boolean;
  created_at: string | null;
};

const toDomain = (r: DbRow): Tax => ({
  id: r.id,
  name: r.name,
  percentage: Number(r.percentage ?? 0),
  amount: r.amount === null || r.amount === undefined ? undefined : Number(r.amount),
  taxType: (r.tax_type as "percentage" | "fixed") ?? "percentage",
  isActive: !!r.is_active,
  createdAt: r.created_at ?? undefined,
});

class TaxesService extends BaseService {
  async list(): Promise<Tax[]> {
    const res = await this.db
      .from("taxes")
      .select("id, name, percentage, amount, tax_type, is_active, created_at")
      .order("name");
    if (res.error) {
      // Older schemas may lack amount/tax_type. Retry with the legacy projection.
      const msg = (res.error.message ?? "").toLowerCase();
      if (msg.includes("column") || msg.includes("schema cache")) {
        const fallback = await this.db
          .from("taxes")
          .select("id, name, percentage, is_active, created_at")
          .order("name");
        if (fallback.error) throw AppError.fromSupabase(fallback.error, "taxes");
        return ((fallback.data ?? []) as unknown as DbRow[]).map(toDomain);
      }
      throw AppError.fromSupabase(res.error, "taxes");
    }
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  async create(input: TaxInput): Promise<void> {
    const payload = {
      name: input.name,
      tax_type: input.taxType,
      percentage: input.taxType === "percentage" ? (input.percentage ?? 0) : 0,
      amount: input.taxType === "fixed" ? (input.amount ?? 0) : null,
      is_active: input.isActive ?? true,
    };
    const { error } = await this.db.from("taxes").insert(payload as never);
    if (error) throw AppError.fromSupabase(error, "taxes.create");
  }

  async update(id: string, input: Partial<TaxInput>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.taxType !== undefined) payload.tax_type = input.taxType;
    if (input.percentage !== undefined) payload.percentage = input.percentage;
    if (input.amount !== undefined) payload.amount = input.amount;
    if (input.isActive !== undefined) payload.is_active = input.isActive;
    const { error } = await this.db.from("taxes").update(payload as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "taxes.update");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("taxes").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "taxes.remove");
  }
}

export const taxesService = new TaxesService();
