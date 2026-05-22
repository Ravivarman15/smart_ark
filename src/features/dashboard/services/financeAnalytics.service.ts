import { BaseService } from "@/shared/services";
import { dateRange, daysAgo, daysAhead, today } from "../utils/dates";
import type { FinanceAnalytics } from "../types/dashboard.types";

// Finance analytics — pure read aggregates. Single source for every rupee on
// the dashboard so a change to "what counts as income" lives in one place.
//
// Data sources:
//   - student_fees: canonical fee ledger (total/discount/received/pending,
//     status, due_date)
//   - fee_installments: per-installment payments (payment_date, amount)
//   - expense_transactions: type='income' | 'expense', date, amount
//
// Resilience: every query degrades independently — a missing table or column
// yields 0 for that slice rather than throwing and blanking the whole finance
// panel (revenue / P&L / fee-due all read this one method).
//
// Refund handling: today's refund is reported as 0 here — the refund audit
// lives in the fee feature module (`fee_refunds`) and is surfaced separately,
// keeping this dashboard roll-up dependency-free.
class FinanceAnalyticsService extends BaseService {
  async finance(): Promise<FinanceAnalytics> {
    const t = today();
    const thirtyAgo = daysAgo(29);
    const sevenAhead = daysAhead(7);

    const [
      installmentsTodayRes,
      expensesTodayRes,
      dueTodayRes,
      sfRes,
      expensesAllRes,
      expensesRangeRes,
      installmentsRangeRes,
    ] = await Promise.all([
      this.db
        .from("fee_installments")
        .select("amount, payment_date")
        .eq("payment_date", t),
      this.db
        .from("expense_transactions")
        .select("amount, type")
        .eq("date", t),
      this.db
        .from("student_fees")
        .select("amount_pending, due_date")
        .eq("due_date", t),
      this.db
        .from("student_fees")
        .select("amount_pending, amount_received, due_date, status"),
      this.db.from("expense_transactions").select("amount, type"),
      this.db
        .from("expense_transactions")
        .select("amount, type, date")
        .gte("date", thirtyAgo)
        .lte("date", t),
      this.db
        .from("fee_installments")
        .select("amount, payment_date")
        .gte("payment_date", thirtyAgo)
        .lte("payment_date", t),
    ]);

    const installmentsToday = rows(installmentsTodayRes, "today payments");
    const expensesToday = rows(expensesTodayRes, "today expenses");
    const dueToday = rows(dueTodayRes, "today fee due");
    const sfRows = rows(sfRes, "student_fees");
    const expensesAll = rows(expensesAllRes, "expense_transactions");
    const expensesRange = rows(expensesRangeRes, "expense range");
    const installmentsRange = rows(installmentsRangeRes, "payment range");

    // ── Today ────────────────────────────────────────────────────────────────
    const todayIncomeFromFees = installmentsToday.reduce(
      (acc, r) => acc + (Number(r.amount) || 0),
      0,
    );
    const todayIncomeFromOther = expensesToday
      .filter((r) => (r.type ?? "expense") === "income")
      .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    const todayIncome = todayIncomeFromFees + todayIncomeFromOther;

    const todayExpense = expensesToday
      .filter((r) => (r.type ?? "expense") === "expense")
      .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

    const todayFeeDue = dueToday.reduce(
      (acc, r) => acc + (Number(r.amount_pending) || 0),
      0,
    );

    // ── Aggregated buckets across student_fees ──────────────────────────────
    let feeOverdue = 0;
    let upcomingFeeDue = 0;
    let totalPendingFee = 0;
    let totalReceivedFromFees = 0;

    for (const r of sfRows) {
      const pending = Number(r.amount_pending) || 0;
      totalReceivedFromFees += Number(r.amount_received) || 0;
      totalPendingFee += pending;
      if (!r.due_date || pending <= 0) continue;
      if (r.due_date < t) feeOverdue += pending;
      else if (r.due_date > t && r.due_date <= sevenAhead)
        upcomingFeeDue += pending;
    }

    // ── Total income / expense / profit ─────────────────────────────────────
    let totalIncomeFromOther = 0;
    let totalExpense = 0;
    for (const r of expensesAll) {
      const amt = Number(r.amount) || 0;
      if ((r.type ?? "expense") === "income") totalIncomeFromOther += amt;
      else totalExpense += amt;
    }
    const totalIncome = totalReceivedFromFees + totalIncomeFromOther;
    const profitLoss = totalIncome - totalExpense;

    // ── 30-day series for the chart widget ──────────────────────────────────
    const days = dateRange(thirtyAgo, t);
    const incomeByDay = new Map<string, number>();
    const expenseByDay = new Map<string, number>();

    for (const r of installmentsRange) {
      if (!r.payment_date) continue;
      incomeByDay.set(
        r.payment_date,
        (incomeByDay.get(r.payment_date) ?? 0) + (Number(r.amount) || 0),
      );
    }
    for (const r of expensesRange) {
      if (!r.date) continue;
      const amt = Number(r.amount) || 0;
      if ((r.type ?? "expense") === "income") {
        incomeByDay.set(r.date, (incomeByDay.get(r.date) ?? 0) + amt);
      } else {
        expenseByDay.set(r.date, (expenseByDay.get(r.date) ?? 0) + amt);
      }
    }
    const series = days.map((date) => ({
      date,
      income: incomeByDay.get(date) ?? 0,
      expense: expenseByDay.get(date) ?? 0,
    }));

    return {
      todayIncome,
      todayExpense,
      todayRefund: 0, // see file-level note
      todayFeeDue,
      feeOverdue,
      upcomingFeeDue,
      totalPendingFee,
      totalIncome,
      totalExpense,
      profitLoss,
      series,
    };
  }
}

/** Rows from a select query; any error degrades to an empty list. */
function rows<T>(
  res: { data: T[] | null; error: unknown },
  label: string,
): T[] {
  if (res.error) {
    console.warn(`[dashboard] finance: ${label} unavailable:`, res.error);
    return [];
  }
  return res.data ?? [];
}

export const financeAnalyticsService = new FinanceAnalyticsService();
