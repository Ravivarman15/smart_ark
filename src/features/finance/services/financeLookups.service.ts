import { BaseService } from "@/shared/services";

// ─────────────────────────────────────────────────────────────────────────────
// Reference-data lookups for the Finance forms — campuses (branches), taxes,
// departments (derived from existing transactions), and students for the
// fee-linked income case. Each query degrades to an empty list if its table
// is unavailable so the form always renders.
// ─────────────────────────────────────────────────────────────────────────────

export interface LookupOption {
  id: string;
  name: string;
}

export interface TaxOption extends LookupOption {
  percentage: number;
}

export interface StudentLookup extends LookupOption {
  batchName?: string;
}

class FinanceLookupsService extends BaseService {
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

  async branches(): Promise<LookupOption[]> {
    return this.safeList<LookupOption>("campuses", "id, name", {
      column: "name",
    });
  }

  async taxes(): Promise<TaxOption[]> {
    const rows = await this.safeList<TaxOption>(
      "taxes",
      "id, name, percentage",
      { column: "name" },
    );
    return rows
      .map((t) => ({ ...t, percentage: Number(t.percentage ?? 0) }));
  }

  /** Distinct department names seen on past expenses. */
  async departments(): Promise<string[]> {
    const { data, error } = await this.db
      .from("expense_transactions")
      .select("department")
      .not("department", "is", null);
    if (error) return [];
    const seen = new Set<string>();
    for (const r of (data as { department: string | null }[]) ?? []) {
      if (r.department && r.department.trim()) seen.add(r.department.trim());
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }

  async students(): Promise<StudentLookup[]> {
    const { data, error } = await this.db
      .from("students")
      .select("id, name, batch_id")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) return [];
    return (
      (data as { id: string; name: string; batch_id: string | null }[]) ?? []
    ).map((s) => ({ id: s.id, name: s.name }));
  }

  async all(): Promise<{
    branches: LookupOption[];
    taxes: TaxOption[];
    departments: string[];
  }> {
    const [branches, taxes, departments] = await Promise.all([
      this.branches(),
      this.taxes(),
      this.departments(),
    ]);
    return { branches, taxes, departments };
  }
}

export const financeLookupsService = new FinanceLookupsService();
