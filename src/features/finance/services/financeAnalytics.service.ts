import { BaseService } from "@/shared/services";
import {
  budgetUtilization,
  cashflowSeries,
  categoryBreakdown,
  isOverdue,
  profitLoss,
  round2,
  toAmount,
} from "../utils/financeCalc";
import { financeTransactionService } from "./financeTransaction.service";
import { financeBudgetService } from "./financeBudget.service";
import type {
  BranchSpendItem,
  DepartmentSpendItem,
  FinanceAnalytics,
  FinanceOverview,
  TaxSummaryItem,
} from "../types/finance.types";

// ─────────────────────────────────────────────────────────────────────────────
// Finance analytics — pure read/compose. Loads already-classified rows and
// aggregates them through the centralised calc layer. No tax math, no
// rounding decisions, no reclassification happens here — that lives in
// utils/financeCalc.ts and is invoked on the way in.
// ─────────────────────────────────────────────────────────────────────────────

class FinanceAnalyticsService extends BaseService {
  async overview(): Promise<FinanceOverview> {
    const txns = await financeTransactionService.list();
    const pl = profitLoss(txns);

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRows = txns.filter((t) => {
      const when = t.date ?? t.createdAt;
      const d = when ? new Date(when) : null;
      return d && d.getTime() >= firstOfMonth.getTime();
    });
    const monthPL = profitLoss(monthRows);

    const pendingApprovals = txns.filter(
      (t) => t.status === "pending",
    ).length;
    const overdueExpenses = txns.filter(
      (t) => t.type === "expense" && isOverdue(t.dueDate, t.status),
    ).length;
    const attachmentCount = txns.reduce(
      (s, t) => s + (t.attachmentsCount ?? 0),
      0,
    );

    const { data: vendorRows } = await this.db
      .from("vendors")
      .select("id");
    const vendorCount = ((vendorRows as { id: string }[]) ?? []).length;

    return {
      totalIncome: pl.income,
      totalExpense: pl.expense,
      netProfit: pl.net,
      pendingApprovals,
      overdueExpenses,
      monthIncome: monthPL.income,
      monthExpense: monthPL.expense,
      monthNet: monthPL.net,
      attachmentCount,
      vendorCount,
    };
  }

  async analytics(): Promise<FinanceAnalytics> {
    const [txns, budgets] = await Promise.all([
      financeTransactionService.list(),
      financeBudgetService.list(),
    ]);

    const pl = profitLoss(txns);
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthPL = profitLoss(
      txns.filter((t) => {
        const when = t.date ?? t.createdAt;
        const d = when ? new Date(when) : null;
        return d && d.getTime() >= firstOfMonth.getTime();
      }),
    );

    const trend = cashflowSeries(txns, 6);
    const expByCat = categoryBreakdown(txns.filter((t) => t.type === "expense"));
    const incByCat = categoryBreakdown(txns.filter((t) => t.type === "income"));

    // Department spending (expense only).
    const deptAcc = new Map<string, { amount: number; count: number }>();
    for (const t of txns) {
      if (t.type !== "expense") continue;
      if (t.status === "rejected" || t.status === "cancelled" || t.status === "draft") {
        continue;
      }
      const name = t.department && t.department.trim() ? t.department : "Unspecified";
      const cur = deptAcc.get(name) ?? { amount: 0, count: 0 };
      cur.amount += toAmount(t.amount);
      cur.count += 1;
      deptAcc.set(name, cur);
    }
    const deptTotal = round2(
      Array.from(deptAcc.values()).reduce((s, d) => s + d.amount, 0),
    );
    const departmentSpending: DepartmentSpendItem[] = Array.from(deptAcc.entries())
      .map(([department, v]) => ({
        department,
        amount: round2(v.amount),
        count: v.count,
        share: deptTotal > 0 ? round2((v.amount / deptTotal) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Branch / campus performance (income, expense, net).
    const branchAcc = new Map<
      string,
      { branchId?: string; income: number; expense: number; name: string }
    >();
    for (const t of txns) {
      if (t.status === "rejected" || t.status === "cancelled" || t.status === "draft") {
        continue;
      }
      const key = t.branchId ?? `name:${(t.branchName ?? "Unassigned").toLowerCase()}`;
      const cur =
        branchAcc.get(key) ?? {
          branchId: t.branchId,
          income: 0,
          expense: 0,
          name: t.branchName ?? "Unassigned",
        };
      if (t.type === "income") cur.income += toAmount(t.amount);
      else cur.expense += toAmount(t.amount);
      branchAcc.set(key, cur);
    }
    const branchPerformance: BranchSpendItem[] = Array.from(branchAcc.values())
      .map((b) => ({
        branchId: b.branchId,
        branchName: b.name,
        income: round2(b.income),
        expense: round2(b.expense),
        net: round2(b.income - b.expense),
      }))
      .sort((a, b) => b.income + b.expense - (a.income + a.expense));

    // Budget utilization for each defined budget.
    const utilization = budgets.map((b) => budgetUtilization(b, txns));

    // Tax summary — group by tax name.
    const taxAcc = new Map<string, { taxablePool: number; taxAmount: number }>();
    for (const t of txns) {
      if (t.status === "rejected" || t.status === "cancelled" || t.status === "draft") {
        continue;
      }
      const key = t.taxName ?? "No tax";
      const cur = taxAcc.get(key) ?? { taxablePool: 0, taxAmount: 0 };
      cur.taxablePool += toAmount(t.netAmount);
      cur.taxAmount += toAmount(t.taxAmount);
      taxAcc.set(key, cur);
    }
    const taxSummary: TaxSummaryItem[] = Array.from(taxAcc.entries())
      .map(([taxName, v]) => ({
        taxName,
        taxablePool: round2(v.taxablePool),
        taxAmount: round2(v.taxAmount),
      }))
      .sort((a, b) => b.taxAmount - a.taxAmount);

    const { data: recurringRows } = await this.db
      .from("recurring_transactions")
      .select("id")
      .eq("is_active", true);
    const recurringCount = ((recurringRows as { id: string }[]) ?? []).length;

    const overview: FinanceOverview = {
      totalIncome: pl.income,
      totalExpense: pl.expense,
      netProfit: pl.net,
      pendingApprovals: txns.filter((t) => t.status === "pending").length,
      overdueExpenses: txns.filter(
        (t) => t.type === "expense" && isOverdue(t.dueDate, t.status),
      ).length,
      monthIncome: monthPL.income,
      monthExpense: monthPL.expense,
      monthNet: monthPL.net,
      attachmentCount: txns.reduce((s, t) => s + (t.attachmentsCount ?? 0), 0),
      vendorCount: 0, // filled below if needed
    };

    return {
      overview,
      monthlyTrend: trend,
      expenseByCategory: expByCat,
      incomeByCategory: incByCat,
      departmentSpending,
      branchPerformance,
      budgetUtilization: utilization,
      taxSummary,
      recurringCount,
      recentTransactions: txns.slice(0, 10),
    };
  }
}

export const financeAnalyticsService = new FinanceAnalyticsService();
