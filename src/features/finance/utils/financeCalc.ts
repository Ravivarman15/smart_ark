// ─────────────────────────────────────────────────────────────────────────────
// CENTRALISED FINANCIAL CALCULATION LAYER
//
// Every rupee figure the Finance module shows or writes flows through here.
// No UI component, no service, no analytics layer may do its own arithmetic
// — that is how a finance system silently drifts out of balance.
//
//   round2()             — the only rounding (matches NUMERIC(12,2))
//   formatINR()          — display formatter
//   computeTax()         — tax base × rate → tax amount
//   netFromGross()       — strip tax out of a gross amount
//   grossFromNet()       — add tax onto a net amount
//   profitLoss()         — income − expense summary
//   cashflowSeries()     — monthly buckets of income / expense / net
//   categoryBreakdown()  — group + share %
//   budgetUtilization()  — spent / remaining / over-budget flags
//   advanceRecurring()   — next-run date for a recurring schedule
//
// Pure functions, no I/O — trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  BudgetUtilization,
  CategoryBreakdownItem,
  FinanceBudget,
  FinanceTransaction,
  MonthlyTrendPoint,
  RecurringFrequency,
} from "../types/finance.types";

/** Round to 2 decimals — the precision of NUMERIC(12,2). The only rounding. */
export const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Coerce a form value to a non-negative number; junk / blank / negative → 0. */
export const toAmount = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
};

/** Indian-rupee display formatting (no decimals when integer). */
export const formatINR = (n: number | null | undefined): string =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Signed display (income green +, expense red −) — used in transaction rows. */
export const formatSignedINR = (n: number, sign: "+" | "-" | null): string =>
  `${sign ?? ""}${formatINR(Math.abs(n))}`;

// ── Tax math ─────────────────────────────────────────────────────────────────
/** taxAmount = round2(amount × rate / 100). amount is the *base* (pre-tax). */
export const computeTax = (
  baseAmount: number | string,
  ratePercent: number | string | null | undefined,
): number => round2(toAmount(baseAmount) * (toAmount(ratePercent) / 100));

/** Tax included in a gross figure (gross = net × (1 + rate/100)). */
export const taxFromGross = (
  grossAmount: number | string,
  ratePercent: number | string | null | undefined,
): number => {
  const gross = toAmount(grossAmount);
  const rate = toAmount(ratePercent);
  if (rate <= 0) return 0;
  return round2(gross - gross / (1 + rate / 100));
};

/** Net (pre-tax) amount when `amount` is the GROSS (tax-inclusive) figure. */
export const netFromGross = (
  grossAmount: number | string,
  ratePercent: number | string | null | undefined,
): number => round2(toAmount(grossAmount) - taxFromGross(grossAmount, ratePercent));

/** Gross (tax-inclusive) when `amount` is the NET (pre-tax) figure. */
export const grossFromNet = (
  netAmount: number | string,
  ratePercent: number | string | null | undefined,
): number => round2(toAmount(netAmount) + computeTax(netAmount, ratePercent));

// ── Transaction-level breakdown ──────────────────────────────────────────────
export interface TransactionAmounts {
  gross: number;
  taxAmount: number;
  net: number;
}

/**
 * Treats the captured `amount` as the GROSS (tax-inclusive) figure. This
 * matches the legacy expense_transactions semantics: the user enters the
 * amount they actually paid; tax is derived from the linked tax rate.
 */
export const splitGross = (
  amount: number | string,
  taxRatePercent: number | string | null | undefined,
): TransactionAmounts => {
  const gross = toAmount(amount);
  const taxAmount = taxFromGross(gross, taxRatePercent);
  return { gross, taxAmount, net: round2(gross - taxAmount) };
};

// ── Profit / loss ────────────────────────────────────────────────────────────
export interface ProfitLoss {
  income: number;
  expense: number;
  net: number;
  margin: number; // (net / income) × 100, 0 when income is 0
}

export const profitLoss = (
  transactions: Pick<FinanceTransaction, "type" | "amount" | "status">[],
  countDraft = false,
): ProfitLoss => {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.status === "rejected" || t.status === "cancelled") continue;
    if (!countDraft && t.status === "draft") continue;
    const amt = toAmount(t.amount);
    if (t.type === "income") income += amt;
    else expense += amt;
  }
  income = round2(income);
  expense = round2(expense);
  const net = round2(income - expense);
  const margin = income > 0 ? round2((net / income) * 100) : 0;
  return { income, expense, net, margin };
};

// ── Source-tagged splits (fee / salary vs other) ─────────────────────────────
export interface FinanceSplits {
  studentFeeIncome: number;
  otherIncome: number;
  salaryExpense: number;
  otherExpense: number;
  todayIncome: number;
  todayExpense: number;
}

/**
 * Split classified transactions by their ERP `source` — the enterprise auto-sync
 * tags (`fee` / `payroll`) let us separate student-fee income and salary expense
 * from manually-entered "other" income/expense WITHOUT any extra query or table.
 * Draft / rejected / cancelled rows are excluded (same rule as profitLoss).
 */
export const financeSplits = (
  transactions: Pick<
    FinanceTransaction,
    "type" | "amount" | "status" | "source" | "date" | "createdAt"
  >[],
  today = new Date().toISOString().slice(0, 10),
): FinanceSplits => {
  const s: FinanceSplits = {
    studentFeeIncome: 0,
    otherIncome: 0,
    salaryExpense: 0,
    otherExpense: 0,
    todayIncome: 0,
    todayExpense: 0,
  };
  for (const t of transactions) {
    if (t.status === "rejected" || t.status === "cancelled" || t.status === "draft") {
      continue;
    }
    const amt = toAmount(t.amount);
    if (t.type === "income") {
      if (t.source === "fee") s.studentFeeIncome += amt;
      else s.otherIncome += amt;
      if ((t.date ?? t.createdAt ?? "").slice(0, 10) === today) s.todayIncome += amt;
    } else {
      if (t.source === "payroll") s.salaryExpense += amt;
      else s.otherExpense += amt;
      if ((t.date ?? t.createdAt ?? "").slice(0, 10) === today) s.todayExpense += amt;
    }
  }
  return {
    studentFeeIncome: round2(s.studentFeeIncome),
    otherIncome: round2(s.otherIncome),
    salaryExpense: round2(s.salaryExpense),
    otherExpense: round2(s.otherExpense),
    todayIncome: round2(s.todayIncome),
    todayExpense: round2(s.todayExpense),
  };
};

// ── Monthly cashflow buckets (12 months back from `endMonth`) ────────────────
const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", {
    month: "short",
    year: "2-digit",
  });
};

export const cashflowSeries = (
  transactions: Pick<FinanceTransaction, "type" | "amount" | "status" | "date" | "createdAt">[],
  months = 6,
): MonthlyTrendPoint[] => {
  const buckets = new Map<string, { income: number; expense: number }>();
  const now = new Date();
  // Seed N buckets ending with current month.
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(monthKey(d), { income: 0, expense: 0 });
  }
  const firstKey = buckets.keys().next().value as string | undefined;
  if (!firstKey) return [];

  for (const t of transactions) {
    if (t.status === "rejected" || t.status === "cancelled" || t.status === "draft") {
      continue;
    }
    const when = t.date ?? t.createdAt;
    if (!when) continue;
    const d = new Date(when);
    if (!Number.isFinite(d.getTime())) continue;
    const key = monthKey(d);
    if (!buckets.has(key)) continue;
    const cur = buckets.get(key)!;
    if (t.type === "income") cur.income += toAmount(t.amount);
    else cur.expense += toAmount(t.amount);
  }

  return Array.from(buckets.entries()).map(([key, b]) => ({
    month: monthLabel(key),
    income: round2(b.income),
    expense: round2(b.expense),
    net: round2(b.income - b.expense),
  }));
};

// ── Category breakdown (with % share) ────────────────────────────────────────
export const categoryBreakdown = (
  rows: Pick<FinanceTransaction, "amount" | "status" | "categoryId" | "categoryName" | "category" | "categoryColor">[],
): CategoryBreakdownItem[] => {
  const acc = new Map<
    string,
    {
      categoryId?: string;
      categoryName: string;
      amount: number;
      color?: string;
    }
  >();
  for (const r of rows) {
    if (r.status === "rejected" || r.status === "cancelled" || r.status === "draft") {
      continue;
    }
    const name = r.categoryName || r.category || "Uncategorised";
    const id = r.categoryId ?? `name:${name.toLowerCase()}`;
    const cur =
      acc.get(id) ?? { categoryId: r.categoryId, categoryName: name, amount: 0, color: r.categoryColor };
    cur.amount += toAmount(r.amount);
    acc.set(id, cur);
  }
  const total = round2(
    Array.from(acc.values()).reduce((s, c) => s + c.amount, 0),
  );
  return Array.from(acc.values())
    .map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      amount: round2(c.amount),
      share: total > 0 ? round2((c.amount / total) * 100) : 0,
      color: c.color,
    }))
    .sort((a, b) => b.amount - a.amount);
};

// ── Budget utilisation ───────────────────────────────────────────────────────
export const budgetUtilization = (
  budget: FinanceBudget,
  transactions: Pick<FinanceTransaction, "categoryId" | "amount" | "status" | "type" | "date" | "createdAt">[],
): BudgetUtilization => {
  const start = new Date(`${budget.periodStart}T00:00:00`).getTime();
  const end = new Date(`${budget.periodEnd}T23:59:59`).getTime();
  let spent = 0;
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (t.status === "rejected" || t.status === "cancelled" || t.status === "draft") {
      continue;
    }
    if (t.categoryId !== budget.categoryId) continue;
    const when = new Date(t.date ?? t.createdAt).getTime();
    if (!Number.isFinite(when) || when < start || when > end) continue;
    spent += toAmount(t.amount);
  }
  spent = round2(spent);
  const remaining = round2(Math.max(0, budget.amount - spent));
  const utilizationPct =
    budget.amount > 0 ? round2((spent / budget.amount) * 100) : 0;
  return {
    budget,
    spent,
    remaining,
    utilizationPct,
    isOverBudget: spent > budget.amount && budget.amount > 0,
    isNearLimit:
      budget.amount > 0 && utilizationPct >= budget.alertThreshold && spent <= budget.amount,
  };
};

// ── Recurring scheduling ─────────────────────────────────────────────────────
export const advanceRecurring = (
  current: Date,
  frequency: RecurringFrequency,
): Date => {
  const d = new Date(current);
  switch (frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
};

/** Period end date inferred from start + period kind — used by budgets. */
export const periodEnd = (
  start: string,
  period: "monthly" | "quarterly" | "yearly",
): string => {
  const d = new Date(`${start}T00:00:00`);
  if (period === "monthly") d.setMonth(d.getMonth() + 1);
  else if (period === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

// ── Misc helpers ─────────────────────────────────────────────────────────────
export const isOverdue = (
  dueDate: string | null | undefined,
  status: string,
): boolean => {
  if (!dueDate) return false;
  if (status === "paid" || status === "rejected" || status === "cancelled") return false;
  const due = new Date(`${dueDate}T23:59:59`);
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
};

export const daysUntilDue = (dueDate: string | null | undefined): number => {
  if (!dueDate) return Infinity;
  const due = new Date(`${dueDate}T23:59:59`).getTime();
  if (!Number.isFinite(due)) return Infinity;
  return Math.ceil((due - Date.now()) / 86_400_000);
};

/** Stable, sortable, short reference for a manually created income / expense. */
export const generateTxnReference = (kind: "expense" | "income"): string =>
  `${kind === "income" ? "INC" : "EXP"}-${Date.now().toString(36).toUpperCase()}`;
