import { BaseService, AppError } from "@/shared/services";
import type { LookupOption, Tax } from "../types/fee.types";

export interface BatchLookup extends LookupOption {
  standardId?: string;
}

/**
 * Read-only lookups for the fee-structure form pickers — course types,
 * standards, batches, academic years and taxes.
 */
class FeeLookupsService extends BaseService {
  async courseTypes(): Promise<LookupOption[]> {
    const res = await this.db.from("course_types").select("id, name").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "course_types");
    return (res.data ?? []) as LookupOption[];
  }

  async standards(): Promise<LookupOption[]> {
    const res = await this.db.from("standards").select("id, name").order("display_order");
    if (res.error) {
      const retry = await this.db.from("standards").select("id, name").order("name");
      if (retry.error) throw AppError.fromSupabase(retry.error, "standards");
      return (retry.data ?? []) as LookupOption[];
    }
    return (res.data ?? []) as LookupOption[];
  }

  async batches(): Promise<BatchLookup[]> {
    const res = await this.db.from("batches").select("id, name, standard_id").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "batches");
    return ((res.data ?? []) as { id: string; name: string; standard_id: string | null }[]).map(
      (r) => ({ id: r.id, name: r.name, standardId: r.standard_id ?? undefined })
    );
  }

  async academicYears(): Promise<LookupOption[]> {
    const res = await this.db
      .from("academic_years")
      .select("id, name")
      .order("start_date", { ascending: false });
    if (res.error) throw AppError.fromSupabase(res.error, "academic_years");
    return (res.data ?? []) as LookupOption[];
  }

  async taxes(): Promise<Tax[]> {
    const res = await this.db.from("taxes").select("id, name, percentage").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "taxes");
    return ((res.data ?? []) as { id: string; name: string; percentage: number | null }[]).map(
      (r) => ({ id: r.id, name: r.name, percentage: Number(r.percentage) || 0 })
    );
  }
}

export const feeLookupsService = new FeeLookupsService();
