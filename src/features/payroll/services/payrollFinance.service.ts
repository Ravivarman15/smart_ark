import { BaseService } from "@/shared/services";

// ─────────────────────────────────────────────────────────────────────────────
// Finance integration — when a payroll run is paid, a single Salary expense
// row is written into `expense_transactions` (the Finance module's table) so
// the P&L, dashboard KPIs and expense reports stay synchronised.
//
// Best-effort + migration-safe: if the finance schema columns aren't present,
// the insert silently degrades (the run still completes). Resolves / creates a
// "Salary" expense category on demand.
// ─────────────────────────────────────────────────────────────────────────────

class PayrollFinanceService extends BaseService {
  /** Resolve (or create) the Salary expense category id. */
  private async salaryCategoryId(name: string): Promise<string | null> {
    try {
      const { data } = await this.db
        .from("expense_categories")
        .select("id")
        .eq("type", "expense")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (data?.id) return String(data.id);
      const ins = await this.db
        .from("expense_categories")
        .insert({ name, type: "expense" } as never)
        .select("id")
        .single();
      return ins.data ? String((ins.data as { id: string }).id) : null;
    } catch {
      return null;
    }
  }

  /**
   * Create a Salary expense for a paid payroll run. Returns the new
   * transaction id (or null if finance sync was unavailable).
   */
  async recordRunExpense(args: {
    runId: string;
    title: string;
    amount: number;
    date: string;
    categoryName: string;
    actorId?: string;
    actorName?: string;
  }): Promise<string | null> {
    if (args.amount <= 0) return null;
    const categoryId = await this.salaryCategoryId(args.categoryName);
    try {
      const res = await this.db
        .from("expense_transactions")
        .insert({
          type: "expense",
          title: args.title,
          category: args.categoryName,
          category_id: categoryId,
          amount: args.amount,
          tax_amount: 0,
          net_amount: args.amount,
          date: args.date,
          description: `Payroll run ${args.title}`,
          department: "Payroll",
          status: "paid",
          paid_at: new Date().toISOString(),
          source: "payroll",
          transaction_reference: `PAYROLL-${args.runId.slice(0, 8).toUpperCase()}`,
          entered_by: args.actorId ?? null,
          approved_by: args.actorId ?? null,
          approved_by_name: args.actorName ?? null,
          approved_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      if (res.error) {
        // Legacy projection — minimal columns only.
        const legacy = await this.db
          .from("expense_transactions")
          .insert({
            category: args.categoryName,
            amount: args.amount,
            date: args.date,
            description: `Payroll run ${args.title}`,
            entered_by: args.actorId ?? null,
          } as never)
          .select("id")
          .single();
        return legacy.data ? String((legacy.data as { id: string }).id) : null;
      }
      return String((res.data as { id: string }).id);
    } catch {
      return null;
    }
  }

  /** Best-effort reversal when a paid run is cancelled. */
  async removeRunExpense(txnId: string): Promise<void> {
    try {
      await this.db.from("expense_transactions").delete().eq("id", txnId);
    } catch {
      /* best-effort */
    }
  }
}

export const payrollFinanceService = new PayrollFinanceService();
