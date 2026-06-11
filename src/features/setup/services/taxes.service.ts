import { BaseService, AppError } from "@/shared/services";
import type { Tax, TaxInput } from "../types/setup.types";

type DbRow = {
  id: string;
  name: string;
  percentage: number | null;
  amount?: number | null;
  tax_type?: string | null;
  is_active: boolean;
  created_at?: string | null;
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
  /**
   * Whether the DB has the extended columns (tax_type, amount).
   * Starts as `null` (unknown), then set to true/false after the first probe.
   * Avoids repeating the failed SELECT on every call.
   */
  private hasExtendedCols: boolean | null = null;

  async list(): Promise<Tax[]> {
    // If we already know the schema shape, skip the probe.
    if (this.hasExtendedCols === false) {
      return this.listLegacy();
    }

    const res = await this.db
      .from("taxes")
      .select("id, name, percentage, amount, tax_type, is_active")
      .order("name");

    if (res.error) {
      // Older schemas may lack amount/tax_type. Fall back to legacy projection.
      const msg = (res.error.message ?? "").toLowerCase();
      if (
        msg.includes("column") ||
        msg.includes("schema cache") ||
        msg.includes("does not exist") ||
        msg.includes("undefined column")
      ) {
        this.hasExtendedCols = false;
        return this.listLegacy();
      }
      throw AppError.fromSupabase(res.error, "taxes");
    }

    this.hasExtendedCols = true;
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  private async listLegacy(): Promise<Tax[]> {
    const fallback = await this.db
      .from("taxes")
      .select("id, name, percentage, is_active")
      .order("name");
    if (fallback.error) throw AppError.fromSupabase(fallback.error, "taxes");
    return ((fallback.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  async create(input: TaxInput): Promise<void> {
    // If we know extended columns are missing, skip straight to legacy insert.
    if (this.hasExtendedCols === false) {
      return this.createLegacy(input);
    }

    // Try inserting with extended columns first (tax_type, amount — added by
    // the 20260520_setup_extensions migration). If the migration hasn't been
    // applied yet the DB rejects the unknown columns; fall back to the legacy
    // schema that only has name/percentage/is_active.
    const fullPayload = {
      name: input.name,
      tax_type: input.taxType,
      percentage: input.taxType === "percentage" ? (input.percentage ?? 0) : 0,
      amount: input.taxType === "fixed" ? (input.amount ?? 0) : null,
      is_active: input.isActive ?? true,
    };

    const { error } = await this.db.from("taxes").insert(fullPayload as never);
    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (
        msg.includes("column") ||
        msg.includes("schema cache") ||
        msg.includes("does not exist") ||
        msg.includes("undefined column")
      ) {
        this.hasExtendedCols = false;
        return this.createLegacy(input);
      }
      throw AppError.fromSupabase(error, "taxes.create");
    }
    this.hasExtendedCols = true;
  }

  private async createLegacy(input: TaxInput): Promise<void> {
    const legacyPayload = {
      name: input.name,
      percentage:
        input.taxType === "percentage"
          ? (input.percentage ?? 0)
          : (input.amount ?? 0),
      is_active: input.isActive ?? true,
    };
    const { error } = await this.db
      .from("taxes")
      .insert(legacyPayload as never);
    if (error) throw AppError.fromSupabase(error, "taxes.create");
  }

  async update(id: string, input: Partial<TaxInput>): Promise<void> {
    if (this.hasExtendedCols === false) {
      return this.updateLegacy(id, input);
    }

    // Build full payload including extended columns.
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.taxType !== undefined) payload.tax_type = input.taxType;
    if (input.percentage !== undefined) payload.percentage = input.percentage;
    if (input.amount !== undefined) payload.amount = input.amount;
    if (input.isActive !== undefined) payload.is_active = input.isActive;

    const { error } = await this.db
      .from("taxes")
      .update(payload as never)
      .eq("id", id);
    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (
        msg.includes("column") ||
        msg.includes("schema cache") ||
        msg.includes("does not exist") ||
        msg.includes("undefined column")
      ) {
        this.hasExtendedCols = false;
        return this.updateLegacy(id, input);
      }
      throw AppError.fromSupabase(error, "taxes.update");
    }
    this.hasExtendedCols = true;
  }

  private async updateLegacy(
    id: string,
    input: Partial<TaxInput>,
  ): Promise<void> {
    const legacyPayload: Record<string, unknown> = {};
    if (input.name !== undefined) legacyPayload.name = input.name;
    if (input.percentage !== undefined)
      legacyPayload.percentage = input.percentage;
    if (input.amount !== undefined) legacyPayload.percentage = input.amount;
    if (input.isActive !== undefined) legacyPayload.is_active = input.isActive;
    const { error } = await this.db
      .from("taxes")
      .update(legacyPayload as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "taxes.update");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("taxes").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "taxes.remove");
  }
}

export const taxesService = new TaxesService();
