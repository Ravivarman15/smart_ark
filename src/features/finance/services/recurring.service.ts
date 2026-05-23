import { BaseService, AppError } from "@/shared/services";
import { advanceRecurring } from "../utils/financeCalc";
import { financeTransactionService } from "./financeTransaction.service";
import type {
  RecurringFrequency,
  RecurringTransaction,
  RecurringTransactionInput,
  FinanceKind,
} from "../types/finance.types";

// ─────────────────────────────────────────────────────────────────────────────
// Recurring transaction service — schedule definitions for repeating
// expenses or incomes. `runDue()` materialises every schedule that is due,
// generating real expense_transactions rows via the central transaction
// service so all tax math + audit hooks fire identically.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  type: string | null;
  title: string;
  category_id: string | null;
  amount: string | number;
  frequency: string | null;
  next_run_date: string;
  last_run_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  payment_method: string | null;
  vendor_id: string | null;
  branch_id: string | null;
  department: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

const normFreq = (s?: string | null): RecurringFrequency =>
  s === "weekly" || s === "quarterly" || s === "yearly" ? s : "monthly";

const normKind = (s?: string | null): FinanceKind =>
  s === "income" ? "income" : "expense";

class RecurringTransactionService extends BaseService {
  private async hydrate(rows: Row[]): Promise<RecurringTransaction[]> {
    const catIds = Array.from(
      new Set(rows.map((r) => r.category_id).filter((x): x is string => !!x)),
    );
    const vendorIds = Array.from(
      new Set(rows.map((r) => r.vendor_id).filter((x): x is string => !!x)),
    );
    const branchIds = Array.from(
      new Set(rows.map((r) => r.branch_id).filter((x): x is string => !!x)),
    );
    const [cats, vendors, branches] = await Promise.all([
      catIds.length === 0
        ? Promise.resolve([] as { id: string; name: string }[])
        : this.db
            .from("expense_categories")
            .select("id, name")
            .in("id", catIds)
            .then(({ data }) => (data as { id: string; name: string }[]) ?? []),
      vendorIds.length === 0
        ? Promise.resolve([] as { id: string; name: string }[])
        : this.db
            .from("vendors")
            .select("id, name")
            .in("id", vendorIds)
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
    const vMap = new Map(vendors.map((v) => [v.id, v.name]));
    const bMap = new Map(branches.map((b) => [b.id, b.name]));
    return rows.map((r) => ({
      id: r.id,
      type: normKind(r.type),
      title: r.title,
      categoryId: r.category_id ?? undefined,
      categoryName: r.category_id ? catMap.get(r.category_id) : undefined,
      amount: Number(r.amount ?? 0),
      frequency: normFreq(r.frequency),
      nextRunDate: r.next_run_date,
      lastRunDate: r.last_run_date ?? undefined,
      endDate: r.end_date ?? undefined,
      isActive: r.is_active ?? true,
      paymentMethod: r.payment_method ?? undefined,
      vendorId: r.vendor_id ?? undefined,
      vendorName: r.vendor_id ? vMap.get(r.vendor_id) : undefined,
      branchId: r.branch_id ?? undefined,
      branchName: r.branch_id ? bMap.get(r.branch_id) : undefined,
      department: r.department ?? undefined,
      notes: r.notes ?? undefined,
      createdBy: r.created_by ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? r.created_at,
    }));
  }

  async list(): Promise<RecurringTransaction[]> {
    const { data, error } = await this.db
      .from("recurring_transactions")
      .select("*")
      .order("next_run_date", { ascending: true });
    if (error) return [];
    return this.hydrate((data as Row[]) ?? []);
  }

  async getById(id: string): Promise<RecurringTransaction> {
    const res = await this.db
      .from("recurring_transactions")
      .select("*")
      .eq("id", id)
      .single();
    const row = this.guard(res, "recurring") as unknown as Row;
    const list = await this.hydrate([row]);
    return list[0];
  }

  async create(
    input: RecurringTransactionInput,
    createdBy?: string,
  ): Promise<RecurringTransaction> {
    const res = await this.db
      .from("recurring_transactions")
      .insert({
        type: input.type,
        title: input.title,
        category_id: input.categoryId ?? null,
        amount: input.amount,
        frequency: input.frequency,
        next_run_date: input.nextRunDate,
        end_date: input.endDate ?? null,
        is_active: input.isActive,
        payment_method: input.paymentMethod ?? null,
        vendor_id: input.vendorId ?? null,
        branch_id: input.branchId ?? null,
        department: input.department ?? null,
        notes: input.notes ?? null,
        created_by: createdBy ?? null,
      } as never)
      .select("id")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "recurring");
    return this.getById((res.data as { id: string }).id);
  }

  async update(
    id: string,
    input: RecurringTransactionInput,
  ): Promise<RecurringTransaction> {
    const res = await this.db
      .from("recurring_transactions")
      .update({
        type: input.type,
        title: input.title,
        category_id: input.categoryId ?? null,
        amount: input.amount,
        frequency: input.frequency,
        next_run_date: input.nextRunDate,
        end_date: input.endDate ?? null,
        is_active: input.isActive,
        payment_method: input.paymentMethod ?? null,
        vendor_id: input.vendorId ?? null,
        branch_id: input.branchId ?? null,
        department: input.department ?? null,
        notes: input.notes ?? null,
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "recurring");
    return this.getById(id);
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    const res = await this.db
      .from("recurring_transactions")
      .update({ is_active: isActive } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "recurring");
  }

  async remove(id: string): Promise<void> {
    const res = await this.db
      .from("recurring_transactions")
      .delete()
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "recurring");
  }

  /**
   * Materialise one schedule into a real transaction row and advance the
   * schedule's next-run date. Returns the new transaction id.
   */
  async runOnce(id: string, enteredBy?: string): Promise<string> {
    const r = await this.getById(id);
    const tx = await financeTransactionService.create(
      {
        type: r.type,
        title: r.title,
        category: r.categoryName ?? "Recurring",
        categoryId: r.categoryId,
        amount: r.amount,
        paymentMethod: r.paymentMethod,
        branchId: r.branchId,
        branchName: r.branchName,
        department: r.department,
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        notes: r.notes,
        isRecurring: true,
        recurringId: r.id,
        date: r.nextRunDate,
        status: "pending",
      },
      enteredBy,
    );
    const next = advanceRecurring(
      new Date(`${r.nextRunDate}T00:00:00`),
      r.frequency,
    )
      .toISOString()
      .slice(0, 10);
    await this.db
      .from("recurring_transactions")
      .update({
        last_run_date: r.nextRunDate,
        next_run_date: next,
      } as never)
      .eq("id", id);
    return tx.id;
  }
}

export const recurringTransactionService = new RecurringTransactionService();
