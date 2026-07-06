import { BaseService, AppError } from "@/shared/services";
import { splitGross, toAmount } from "../utils/financeCalc";
import type {
  FinanceFilters,
  FinanceKind,
  FinanceTransaction,
  FinanceTransactionInput,
  TransactionStatus,
} from "../types/finance.types";

// ─────────────────────────────────────────────────────────────────────────────
// Finance transaction service — CRUD + lifecycle for expense AND income rows.
//
// One table, one service. `type` is the discriminator. The legacy
// ExpenseManagement page + AppDataContext keep working because every new
// column is nullable and the service falls back to a legacy projection
// (id/category/amount/date/description/entered_by) when the schema cache
// reports the extension columns as missing.
//
// Tax math runs through the centralised calc layer (`splitGross`) — never
// in the UI, never in components.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  type: string | null;
  title: string | null;
  category: string | null;
  category_id: string | null;
  amount: string | number;
  tax_id: string | null;
  tax_amount: string | number | null;
  net_amount: string | number | null;
  date: string | null;
  description: string | null;
  entered_by: string | null;
  payment_method: string | null;
  branch_id: string | null;
  branch_name: string | null;
  department: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  invoice_number: string | null;
  status: string | null;
  due_date: string | null;
  paid_at: string | null;
  is_recurring: boolean | null;
  recurring_id: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  attachment_url: string | null;
  source: string | null;
  source_id: string | null;
  linked_student_id: string | null;
  linked_student_fee_id: string | null;
  transaction_reference: string | null;
  created_at: string;
  updated_at: string | null;
};

type LegacyRow = {
  id: string;
  amount: string | number;
  category: string | null;
  date: string | null;
  description: string | null;
  entered_by: string | null;
  created_at: string;
};

const normStatus = (s?: string | null): TransactionStatus => {
  switch (s) {
    case "draft":
    case "pending":
    case "approved":
    case "rejected":
    case "paid":
    case "cancelled":
      return s;
    default:
      return "pending";
  }
};

const normKind = (s?: string | null): FinanceKind =>
  s === "income" ? "income" : "expense";

class FinanceTransactionService extends BaseService {
  private categoryCache = new Map<string, { name: string; color?: string }>();
  private taxCache = new Map<string, { name: string; percentage: number }>();
  private attachmentCountCache = new Map<string, number>();

  private async hydrateCaches(rows: Row[]): Promise<void> {
    const catIds = new Set<string>();
    const taxIds = new Set<string>();
    for (const r of rows) {
      if (r.category_id) catIds.add(r.category_id);
      if (r.tax_id) taxIds.add(r.tax_id);
    }
    if (catIds.size > 0) {
      const { data } = await this.db
        .from("expense_categories")
        .select("id, name, color")
        .in("id", Array.from(catIds));
      for (const c of (data as { id: string; name: string; color: string | null }[]) ?? []) {
        this.categoryCache.set(c.id, { name: c.name, color: c.color ?? undefined });
      }
    }
    if (taxIds.size > 0) {
      const { data } = await this.db
        .from("taxes")
        .select("id, name, percentage")
        .in("id", Array.from(taxIds));
      for (const t of (data as { id: string; name: string; percentage: number | string | null }[]) ?? []) {
        this.taxCache.set(t.id, { name: t.name, percentage: Number(t.percentage ?? 0) });
      }
    }
    const txIds = rows.map((r) => r.id);
    if (txIds.length > 0) {
      const { data } = await this.db
        .from("finance_attachments")
        .select("transaction_id")
        .in("transaction_id", txIds);
      this.attachmentCountCache.clear();
      for (const a of (data as { transaction_id: string }[]) ?? []) {
        this.attachmentCountCache.set(
          a.transaction_id,
          (this.attachmentCountCache.get(a.transaction_id) ?? 0) + 1,
        );
      }
    }
  }

  private toTransaction(r: Row): FinanceTransaction {
    const cat = r.category_id ? this.categoryCache.get(r.category_id) : undefined;
    const tax = r.tax_id ? this.taxCache.get(r.tax_id) : undefined;
    const gross = toAmount(r.amount);
    const taxAmount =
      r.tax_amount != null
        ? toAmount(r.tax_amount)
        : tax
          ? splitGross(gross, tax.percentage).taxAmount
          : 0;
    const net = r.net_amount != null ? toAmount(r.net_amount) : gross - taxAmount;

    return {
      id: r.id,
      type: normKind(r.type),
      title: r.title ?? undefined,
      category: r.category ?? cat?.name ?? "",
      categoryId: r.category_id ?? undefined,
      categoryName: cat?.name ?? r.category ?? undefined,
      categoryColor: cat?.color,
      amount: gross,
      taxId: r.tax_id ?? undefined,
      taxName: tax?.name,
      taxAmount,
      netAmount: net,
      date: r.date ?? undefined,
      description: r.description ?? undefined,
      paymentMethod: r.payment_method ?? undefined,
      branchId: r.branch_id ?? undefined,
      branchName: r.branch_name ?? undefined,
      department: r.department ?? undefined,
      vendorId: r.vendor_id ?? undefined,
      vendorName: r.vendor_name ?? undefined,
      invoiceNumber: r.invoice_number ?? undefined,
      status: normStatus(r.status),
      dueDate: r.due_date ?? undefined,
      paidAt: r.paid_at ?? undefined,
      isRecurring: !!r.is_recurring,
      recurringId: r.recurring_id ?? undefined,
      approvedBy: r.approved_by ?? undefined,
      approvedByName: r.approved_by_name ?? undefined,
      approvedAt: r.approved_at ?? undefined,
      rejectionReason: r.rejection_reason ?? undefined,
      notes: r.notes ?? undefined,
      attachmentUrl: r.attachment_url ?? undefined,
      source: r.source ?? undefined,
      sourceId: r.source_id ?? undefined,
      linkedStudentId: r.linked_student_id ?? undefined,
      linkedStudentFeeId: r.linked_student_fee_id ?? undefined,
      transactionReference: r.transaction_reference ?? undefined,
      enteredBy: r.entered_by ?? undefined,
      attachmentsCount: this.attachmentCountCache.get(r.id) ?? 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? r.created_at,
    };
  }

  private toLegacyTransaction(r: LegacyRow): FinanceTransaction {
    const amount = toAmount(r.amount);
    return {
      id: r.id,
      type: "expense",
      category: r.category ?? "Uncategorised",
      amount,
      taxAmount: 0,
      netAmount: amount,
      date: r.date ?? undefined,
      description: r.description ?? undefined,
      status: "pending",
      isRecurring: false,
      enteredBy: r.entered_by ?? undefined,
      attachmentsCount: 0,
      createdAt: r.created_at,
      updatedAt: r.created_at,
    };
  }

  async list(filters: FinanceFilters = {}): Promise<FinanceTransaction[]> {
    let q = this.db.from("expense_transactions").select("*");
    if (filters.type) q = q.eq("type", filters.type);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
    if (filters.branchId) q = q.eq("branch_id", filters.branchId);
    if (filters.vendorId) q = q.eq("vendor_id", filters.vendorId);
    if (filters.isRecurring != null) q = q.eq("is_recurring", filters.isRecurring);
    if (filters.from) q = q.gte("date", filters.from);
    if (filters.to) q = q.lte("date", filters.to);
    const res = await q
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (res.error) {
      // Fallback to legacy projection.
      const legacyQ = this.db
        .from("expense_transactions")
        .select("id, amount, category, date, description, entered_by, created_at");
      const legacy = await legacyQ
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      const rows = ((legacy.data as LegacyRow[]) ?? []).map((r) =>
        this.toLegacyTransaction(r),
      );
      return filters.search ? this.applySearch(rows, filters.search) : rows;
    }
    const rows = (res.data as Row[]) ?? [];
    await this.hydrateCaches(rows);
    const mapped = rows.map((r) => this.toTransaction(r));
    return filters.search ? this.applySearch(mapped, filters.search) : mapped;
  }

  private applySearch(
    rows: FinanceTransaction[],
    search: string,
  ): FinanceTransaction[] {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const hay = [
        r.title,
        r.category,
        r.categoryName,
        r.vendorName,
        r.invoiceNumber,
        r.description,
        r.notes,
        r.transactionReference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  async getById(id: string): Promise<FinanceTransaction> {
    const res = await this.db
      .from("expense_transactions")
      .select("*")
      .eq("id", id)
      .single();
    const row = this.guard(res, "transaction") as unknown as Row;
    await this.hydrateCaches([row]);
    return this.toTransaction(row);
  }

  private async resolveTaxRate(taxId?: string | null): Promise<number> {
    if (!taxId) return 0;
    if (this.taxCache.has(taxId)) return this.taxCache.get(taxId)!.percentage;
    const { data } = await this.db
      .from("taxes")
      .select("id, name, percentage")
      .eq("id", taxId)
      .maybeSingle();
    if (!data) return 0;
    const row = data as { id: string; name: string; percentage: number | string | null };
    const pct = Number(row.percentage ?? 0);
    this.taxCache.set(row.id, { name: row.name, percentage: pct });
    return pct;
  }

  /** Snapshot a category's name onto the transaction (legacy `category` text). */
  private async resolveCategoryName(
    categoryId?: string | null,
    fallback?: string,
  ): Promise<string> {
    if (categoryId) {
      if (this.categoryCache.has(categoryId)) {
        return this.categoryCache.get(categoryId)!.name;
      }
      const { data } = await this.db
        .from("expense_categories")
        .select("id, name, color")
        .eq("id", categoryId)
        .maybeSingle();
      if (data) {
        const row = data as { id: string; name: string; color: string | null };
        this.categoryCache.set(row.id, {
          name: row.name,
          color: row.color ?? undefined,
        });
        return row.name;
      }
    }
    return fallback ?? "Uncategorised";
  }

  async create(
    input: FinanceTransactionInput,
    enteredBy?: string,
  ): Promise<FinanceTransaction> {
    const rate = await this.resolveTaxRate(input.taxId);
    const { taxAmount, net } = splitGross(input.amount, rate);
    const categoryName = await this.resolveCategoryName(
      input.categoryId,
      input.category,
    );

    const res = await this.db
      .from("expense_transactions")
      .insert({
        type: input.type,
        title: input.title ?? null,
        category: categoryName,
        category_id: input.categoryId ?? null,
        amount: input.amount,
        tax_id: input.taxId ?? null,
        tax_amount: taxAmount,
        net_amount: net,
        date: input.date ?? new Date().toISOString().slice(0, 10),
        description: input.description ?? null,
        entered_by: enteredBy ?? null,
        payment_method: input.paymentMethod ?? null,
        branch_id: input.branchId ?? null,
        branch_name: input.branchName ?? null,
        department: input.department ?? null,
        vendor_id: input.vendorId ?? null,
        vendor_name: input.vendorName ?? null,
        invoice_number: input.invoiceNumber ?? null,
        status: input.status ?? "pending",
        due_date: input.dueDate ?? null,
        is_recurring: !!input.isRecurring,
        recurring_id: input.recurringId ?? null,
        notes: input.notes ?? null,
        attachment_url: input.attachmentUrl ?? null,
        source: input.source ?? null,
        source_id: input.sourceId ?? null,
        linked_student_id: input.linkedStudentId ?? null,
        linked_student_fee_id: input.linkedStudentFeeId ?? null,
        transaction_reference: input.transactionReference ?? null,
      } as never)
      .select("id")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "transaction");
    return this.getById((res.data as { id: string }).id);
  }

  async update(
    id: string,
    input: FinanceTransactionInput,
  ): Promise<FinanceTransaction> {
    const rate = await this.resolveTaxRate(input.taxId);
    const { taxAmount, net } = splitGross(input.amount, rate);
    const categoryName = await this.resolveCategoryName(
      input.categoryId,
      input.category,
    );
    const res = await this.db
      .from("expense_transactions")
      .update({
        type: input.type,
        title: input.title ?? null,
        category: categoryName,
        category_id: input.categoryId ?? null,
        amount: input.amount,
        tax_id: input.taxId ?? null,
        tax_amount: taxAmount,
        net_amount: net,
        date: input.date ?? null,
        description: input.description ?? null,
        payment_method: input.paymentMethod ?? null,
        branch_id: input.branchId ?? null,
        branch_name: input.branchName ?? null,
        department: input.department ?? null,
        vendor_id: input.vendorId ?? null,
        vendor_name: input.vendorName ?? null,
        invoice_number: input.invoiceNumber ?? null,
        due_date: input.dueDate ?? null,
        is_recurring: !!input.isRecurring,
        recurring_id: input.recurringId ?? null,
        notes: input.notes ?? null,
        attachment_url: input.attachmentUrl ?? null,
        source: input.source ?? null,
        source_id: input.sourceId ?? null,
        linked_student_id: input.linkedStudentId ?? null,
        linked_student_fee_id: input.linkedStudentFeeId ?? null,
        transaction_reference: input.transactionReference ?? null,
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "transaction");
    return this.getById(id);
  }

  async approve(
    id: string,
    approver?: { id?: string; name?: string },
  ): Promise<void> {
    const res = await this.db
      .from("expense_transactions")
      .update({
        status: "approved",
        approved_by: approver?.id ?? null,
        approved_by_name: approver?.name ?? null,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "transaction");
  }

  async reject(
    id: string,
    reason: string,
    rejecter?: { id?: string; name?: string },
  ): Promise<void> {
    const res = await this.db
      .from("expense_transactions")
      .update({
        status: "rejected",
        approved_by: rejecter?.id ?? null,
        approved_by_name: rejecter?.name ?? null,
        approved_at: new Date().toISOString(),
        rejection_reason: reason,
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "transaction");
  }

  async markPaid(id: string): Promise<void> {
    const res = await this.db
      .from("expense_transactions")
      .update({ status: "paid", paid_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "transaction");
  }

  async setStatus(id: string, status: TransactionStatus): Promise<void> {
    const res = await this.db
      .from("expense_transactions")
      .update({ status } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "transaction");
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.from("expense_transactions").delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "transaction");
  }

  /** Bulk approve every supplied id — single batch update, no scoring. */
  async bulkApprove(
    ids: string[],
    approver?: { id?: string; name?: string },
  ): Promise<void> {
    if (ids.length === 0) return;
    const res = await this.db
      .from("expense_transactions")
      .update({
        status: "approved",
        approved_by: approver?.id ?? null,
        approved_by_name: approver?.name ?? null,
        approved_at: new Date().toISOString(),
      } as never)
      .in("id", ids);
    if (res.error) throw AppError.fromSupabase(res.error, "transactions");
  }

  async bulkDelete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const res = await this.db
      .from("expense_transactions")
      .delete()
      .in("id", ids);
    if (res.error) throw AppError.fromSupabase(res.error, "transactions");
  }
}

export const financeTransactionService = new FinanceTransactionService();
