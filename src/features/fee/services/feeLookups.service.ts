import { BaseService } from "@/shared/services";

// ─────────────────────────────────────────────────────────────────────────────
// Reference-data lookups for the Fee structure form (course types, standards,
// taxes, academic years, batches). Each query degrades to an empty list if its
// table is absent, so the form always renders.
// ─────────────────────────────────────────────────────────────────────────────

export interface LookupOption {
  id: string;
  name: string;
}

export interface TaxOption extends LookupOption {
  percentage: number;
}

class FeeLookupsService extends BaseService {
  private async safeList<T>(
    table: string,
    columns: string,
    order?: { column: string; ascending?: boolean },
  ): Promise<T[]> {
    let q = this.db.from(table).select(columns);
    if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as unknown as T[];
  }

  async courseTypes(): Promise<LookupOption[]> {
    return this.safeList<LookupOption>("course_types", "id, name");
  }

  async standards(): Promise<LookupOption[]> {
    return this.safeList<LookupOption>("standards", "id, name", {
      column: "display_order",
    });
  }

  async taxes(): Promise<TaxOption[]> {
    const rows = await this.safeList<TaxOption>(
      "taxes",
      "id, name, percentage",
    );
    return rows.map((t) => ({ ...t, percentage: Number(t.percentage ?? 0) }));
  }

  async academicYears(): Promise<LookupOption[]> {
    return this.safeList<LookupOption>("academic_years", "id, name", {
      column: "created_at",
      ascending: false,
    });
  }

  async batches(): Promise<LookupOption[]> {
    return this.safeList<LookupOption>("batches", "id, name", {
      column: "name",
    });
  }

  /** Load every lookup the structure form needs in one call. */
  async all(): Promise<{
    courseTypes: LookupOption[];
    standards: LookupOption[];
    taxes: TaxOption[];
    academicYears: LookupOption[];
    batches: LookupOption[];
  }> {
    const [courseTypes, standards, taxes, academicYears, batches] =
      await Promise.all([
        this.courseTypes(),
        this.standards(),
        this.taxes(),
        this.academicYears(),
        this.batches(),
      ]);
    return { courseTypes, standards, taxes, academicYears, batches };
  }
}

export const feeLookupsService = new FeeLookupsService();
