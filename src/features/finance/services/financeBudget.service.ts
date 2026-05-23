import { BaseService, AppError } from "@/shared/services";
import { periodEnd } from "../utils/financeCalc";
import type {
  FinanceBudget,
  FinanceBudgetInput,
  BudgetPeriod,
} from "../types/finance.types";

type Row = {
  id: string;
  category_id: string;
  period: string | null;
  period_start: string;
  period_end: string;
  amount: string | number;
  alert_threshold: number | null;
  branch_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

const normPeriod = (s?: string | null): BudgetPeriod => {
  if (s === "quarterly" || s === "yearly") return s;
  return "monthly";
};

class FinanceBudgetService extends BaseService {
  private categoryName(id: string): Promise<string | undefined> {
    return this.db
      .from("expense_categories")
      .select("name")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => (data as { name: string } | null)?.name);
  }

  private async hydrate(rows: Row[]): Promise<FinanceBudget[]> {
    const catIds = Array.from(new Set(rows.map((r) => r.category_id)));
    const branchIds = Array.from(
      new Set(rows.map((r) => r.branch_id).filter((x): x is string => !!x)),
    );
    const [cats, branches] = await Promise.all([
      catIds.length === 0
        ? Promise.resolve([] as { id: string; name: string }[])
        : this.db
            .from("expense_categories")
            .select("id, name")
            .in("id", catIds)
            .then(({ data }) => (data as { id: string; name: string }[]) ?? []),
      branchIds.length === 0
        ? Promise.resolve([] as { id: string; name: string }[])
        : this.db
            .from("campuses")
            .select("id, name")
            .in("id", branchIds)
            .then(({ data }) => (data as { id: string; name: string }[]) ?? []),
    ]);
    const catMap = new Map(cats.map((c) => [c.id, c.name]));
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));
    return rows.map((r) => ({
      id: r.id,
      categoryId: r.category_id,
      categoryName: catMap.get(r.category_id),
      period: normPeriod(r.period),
      periodStart: r.period_start,
      periodEnd: r.period_end,
      amount: Number(r.amount ?? 0),
      alertThreshold: r.alert_threshold ?? 80,
      branchId: r.branch_id ?? undefined,
      branchName: r.branch_id ? branchMap.get(r.branch_id) : undefined,
      notes: r.notes ?? undefined,
      createdBy: r.created_by ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? r.created_at,
    }));
  }

  async list(): Promise<FinanceBudget[]> {
    const { data, error } = await this.db
      .from("finance_budgets")
      .select("*")
      .order("period_start", { ascending: false });
    if (error) return [];
    return this.hydrate((data as Row[]) ?? []);
  }

  async getById(id: string): Promise<FinanceBudget> {
    const res = await this.db
      .from("finance_budgets")
      .select("*")
      .eq("id", id)
      .single();
    const row = this.guard(res, "budget") as unknown as Row;
    const list = await this.hydrate([row]);
    return list[0];
  }

  async create(
    input: FinanceBudgetInput,
    createdBy?: string,
  ): Promise<FinanceBudget> {
    const end = periodEnd(input.periodStart, input.period);
    const res = await this.db
      .from("finance_budgets")
      .insert({
        category_id: input.categoryId,
        period: input.period,
        period_start: input.periodStart,
        period_end: end,
        amount: input.amount,
        alert_threshold: input.alertThreshold ?? 80,
        branch_id: input.branchId ?? null,
        notes: input.notes ?? null,
        created_by: createdBy ?? null,
      } as never)
      .select("id")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "budget");
    return this.getById((res.data as { id: string }).id);
  }

  async update(id: string, input: FinanceBudgetInput): Promise<FinanceBudget> {
    const end = periodEnd(input.periodStart, input.period);
    const res = await this.db
      .from("finance_budgets")
      .update({
        category_id: input.categoryId,
        period: input.period,
        period_start: input.periodStart,
        period_end: end,
        amount: input.amount,
        alert_threshold: input.alertThreshold ?? 80,
        branch_id: input.branchId ?? null,
        notes: input.notes ?? null,
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "budget");
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.from("finance_budgets").delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "budget");
  }
}

export const financeBudgetService = new FinanceBudgetService();
