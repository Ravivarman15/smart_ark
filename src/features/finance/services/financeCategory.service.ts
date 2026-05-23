import { BaseService, AppError } from "@/shared/services";
import type {
  FinanceCategory,
  FinanceCategoryInput,
  FinanceKind,
  IncomeScope,
} from "../types/finance.types";

// ─────────────────────────────────────────────────────────────────────────────
// Finance category (expense + income types) — both kinds live in the existing
// `expense_categories` table. `kind` is the discriminator (`type` column in
// the DB). Service degrades gracefully if the extension columns added by
// 20260525_finance_module.sql are absent: list/getById fall back to the
// legacy projection (just id/name/type/created_at) so the UI still renders
// pre-migration.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  name: string;
  type: string | null;
  parent_id: string | null;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean | null;
  is_recurring: boolean | null;
  tax_id: string | null;
  monthly_budget: string | number | null;
  sort_order: number | null;
  scope: string | null;
  created_at: string;
  updated_at: string | null;
};

type LegacyRow = {
  id: string;
  name: string;
  type: string | null;
  created_at: string;
};

type Tax = { id: string; name: string; percentage: number | string | null };

const normKind = (s?: string | null): FinanceKind =>
  s === "income" ? "income" : "expense";

const normScope = (s?: string | null): IncomeScope =>
  s === "external" || s === "fee" ? s : "internal";

class FinanceCategoryService extends BaseService {
  private async taxesById(): Promise<Map<string, Tax>> {
    const { data, error } = await this.db
      .from("taxes")
      .select("id, name, percentage");
    if (error) return new Map();
    return new Map(((data as Tax[]) ?? []).map((t) => [t.id, t]));
  }

  private async parentsById(
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await this.db
      .from("expense_categories")
      .select("id, name")
      .in("id", ids);
    if (error) return new Map();
    return new Map(((data as { id: string; name: string }[]) ?? []).map((r) => [r.id, r.name]));
  }

  private toCategory(
    r: Row,
    taxes: Map<string, Tax>,
    parents: Map<string, string>,
  ): FinanceCategory {
    const tax = r.tax_id ? taxes.get(r.tax_id) : undefined;
    return {
      id: r.id,
      name: r.name,
      kind: normKind(r.type),
      parentId: r.parent_id ?? undefined,
      parentName: r.parent_id ? parents.get(r.parent_id) : undefined,
      description: r.description ?? undefined,
      color: r.color ?? undefined,
      icon: r.icon ?? undefined,
      isActive: r.is_active ?? true,
      isRecurring: !!r.is_recurring,
      taxId: r.tax_id ?? undefined,
      taxName: tax?.name,
      taxPercentage: tax ? Number(tax.percentage ?? 0) : undefined,
      monthlyBudget:
        r.monthly_budget == null ? undefined : Number(r.monthly_budget),
      sortOrder: r.sort_order ?? 0,
      scope: normScope(r.scope),
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? r.created_at,
    };
  }

  /** Pre-migration fallback — only name/type/created_at are guaranteed. */
  private toLegacyCategory(r: LegacyRow): FinanceCategory {
    return {
      id: r.id,
      name: r.name,
      kind: normKind(r.type),
      isActive: true,
      isRecurring: false,
      sortOrder: 0,
      scope: "internal",
      createdAt: r.created_at,
      updatedAt: r.created_at,
    };
  }

  async list(kind?: FinanceKind): Promise<FinanceCategory[]> {
    let q = this.db.from("expense_categories").select("*");
    if (kind) q = q.eq("type", kind);
    const { data, error } = await q.order("name", { ascending: true });
    if (error) {
      // Probable schema cache miss — try legacy projection.
      let lq = this.db
        .from("expense_categories")
        .select("id, name, type, created_at");
      if (kind) lq = lq.eq("type", kind);
      const legacy = await lq.order("name", { ascending: true });
      return ((legacy.data as LegacyRow[]) ?? []).map((r) =>
        this.toLegacyCategory(r),
      );
    }
    const rows = (data as Row[]) ?? [];
    const parentIds = Array.from(
      new Set(rows.map((r) => r.parent_id).filter((x): x is string => !!x)),
    );
    const [taxes, parents] = await Promise.all([
      this.taxesById(),
      this.parentsById(parentIds),
    ]);
    return rows
      .map((r) => this.toCategory(r, taxes, parents))
      .sort((a, b) =>
        a.sortOrder !== b.sortOrder
          ? a.sortOrder - b.sortOrder
          : a.name.localeCompare(b.name),
      );
  }

  async getById(id: string): Promise<FinanceCategory> {
    const res = await this.db
      .from("expense_categories")
      .select("*")
      .eq("id", id)
      .single();
    const row = this.guard(res, "category") as unknown as Row;
    const [taxes, parents] = await Promise.all([
      this.taxesById(),
      this.parentsById(row.parent_id ? [row.parent_id] : []),
    ]);
    return this.toCategory(row, taxes, parents);
  }

  async create(input: FinanceCategoryInput): Promise<FinanceCategory> {
    const res = await this.db
      .from("expense_categories")
      .insert({
        name: input.name,
        type: input.kind,
        parent_id: input.parentId ?? null,
        description: input.description ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        is_active: input.isActive,
        is_recurring: input.isRecurring,
        tax_id: input.taxId ?? null,
        monthly_budget: input.monthlyBudget ?? null,
        sort_order: input.sortOrder ?? 0,
        scope: input.scope,
      } as never)
      .select("id")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "category");
    return this.getById((res.data as { id: string }).id);
  }

  async update(
    id: string,
    input: FinanceCategoryInput,
  ): Promise<FinanceCategory> {
    const res = await this.db
      .from("expense_categories")
      .update({
        name: input.name,
        type: input.kind,
        parent_id: input.parentId ?? null,
        description: input.description ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        is_active: input.isActive,
        is_recurring: input.isRecurring,
        tax_id: input.taxId ?? null,
        monthly_budget: input.monthlyBudget ?? null,
        sort_order: input.sortOrder ?? 0,
        scope: input.scope,
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "category");
    return this.getById(id);
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    const res = await this.db
      .from("expense_categories")
      .update({ is_active: isActive } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "category");
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.from("expense_categories").delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "category");
  }
}

export const financeCategoryService = new FinanceCategoryService();
