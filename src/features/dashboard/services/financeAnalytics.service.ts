import { BaseService, AppError } from "@/shared/services";
import { dateRange, daysAgo, today } from "../utils/dates";
import type { FinanceAnalytics } from "../types/dashboard.types";

// Finance analytics — pure read aggregates. Single source for every rupee on
// the dashboard so a change to "what counts as income" lives in one place.
//
// Data sources:
//   - student_fees: canonical fee ledger (total/discount/received/pending,
//     status, due_date, updated_at)
//   - fee_installments: per-installment payments (paid_on, amount)
//   - expense_transactions: type='income' | 'expense'
//
// Refund handling: there's no `refunds` table yet — refunds are surfaced as a
// decrement to amount_received on a student_fees row (see refunds.service).
// Until an audit table exists we approximate "today refund" as 0; this method
// returns the field for future-compat. Refund delta will land here when the
// audit table is added — bumping the version of this method is not needed.
class FinanceAnalyticsService extends BaseService {
  async finance(): Promise<FinanceAnalytics> {
    const t = today();
    const thirtyAgo = daysAgo(29);

    const [installmentsTodayRes, expensesTodayRes, dueTodayRes, sfRes, expensesAllRes, expensesRangeRes, installmentsRangeRes] =
      await Promise.all([
        this.db
          .from("fee_installments")
          .select("amount, paid_on")
          .eq("paid_on", t),
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
          .select("amount, paid_on")
          .gte("paid_on", thirtyAgo)
          .lte("paid_on", t),
      ]);

    if (installmentsTodayRes.error)
      throw AppError.fromSupabase(installmentsTodayRes.error, "fee_installments");
    if (expensesTodayRes.error)
      throw AppError.fromSupabase(expensesTodayRes.error, "expense_transactions");
    if (dueTodayRes.error) throw AppError.fromSupabase(dueTodayRes.error, "student_fees");
    if (sfRes.error) throw AppError.fromSupabase(sfRes.error, "student_fees");
    if (expensesAllRes.error)
      throw AppError.fromSupabase(expensesAllRes.error, "expense_transactions");
    if (expensesRangeRes.error)
      throw AppError.fromSupabase(expensesRangeRes.error, "expense_transactions");
    if (installmentsRangeRes.error)
      throw AppError.fromSupabase(installmentsRangeRes.error, "fee_installments");

    // ── Today ──────────────────────────────────────────────────────────────
    const todayIncomeFromFees = (installmentsTodayRes.data ?? []).reduce(
      (acc, r) => acc + (Number(r.amount) || 0),
      0
    );
    const todayIncomeFromOther = (expensesTodayRes.data ?? [])
      .filter((r) => (r.type ?? "expense") === "income")
      .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    const todayIncome = todayIncomeFromFees + todayIncomeFromOther;

    const todayExpense = (expensesTodayRes.data ?? [])
      .filter((r) => (r.type ?? "expense") === "expense")
      .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

    const todayFeeDue = (dueTodayRes.data ?? []).reduce(
      (acc, r) => acc + (Number(r.amount_pending) || 0),
      0
    );

    // ── Aggregated buckets across student_fees ────────────────────────────
    const sfRows = sfRes.data ?? [];
    let feeOverdue = 0;
    let upcomingFeeDue = 0;
    let totalPendingFee = 0;
    let totalReceivedFromFees = 0;

    const sevenAhead = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split("T")[0];
    })();

    for (const r of sfRows) {
      const pending = Number(r.amount_pending) || 0;
      const received = Number(r.amount_received) || 0;
      totalReceivedFromFees += received;
      totalPendingFee += pending;
      if (!r.due_date || pending <= 0) continue;
      if (r.due_date < t) feeOverdue += pending;
      else if (r.due_date > t && r.due_date <= sevenAhead) upcomingFeeDue += pending;
    }

    // ── Total income / expense / profit ───────────────────────────────────
    let totalIncomeFromOther = 0;
    let totalExpense = 0;
    for (const r of expensesAllRes.data ?? []) {
      const amt = Number(r.amount) || 0;
      if ((r.type ?? "expense") === "income") totalIncomeFromOther += amt;
      else totalExpense += amt;
    }
    const totalIncome = totalReceivedFromFees + totalIncomeFromOther;
    const profitLoss = totalIncome - totalExpense;

    // ── 30-day series for the chart widget ────────────────────────────────
    const days = dateRange(thirtyAgo, t);
    const incomeByDay = new Map<string, number>();
    const expenseByDay = new Map<string, number>();

    for (const r of installmentsRangeRes.data ?? []) {
      if (!r.paid_on) continue;
      incomeByDay.set(r.paid_on, (incomeByDay.get(r.paid_on) ?? 0) + (Number(r.amount) || 0));
    }
    for (const r of expensesRangeRes.data ?? []) {
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

export const financeAnalyticsService = new FinanceAnalyticsService();
