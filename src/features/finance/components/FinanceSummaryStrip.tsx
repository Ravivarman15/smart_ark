import {
  Banknote,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { FinanceKpiCard } from "./FinanceKpiCard";
import { useFinanceOverview } from "../hooks/useFinanceAnalytics";
import { formatINR } from "../utils/financeCalc";

// ─────────────────────────────────────────────────────────────────────────────
// Enterprise finance snapshot (Phase 3 summary cards). Reads the extended
// financeAnalytics overview — which separates auto-synced Student-Fee income and
// Salary expense from manual "other" income/expense via the source tags — and
// renders it as a KPI strip. Live via FinanceRealtimeProvider (any
// expense_transactions change busts finance.overview).
// ─────────────────────────────────────────────────────────────────────────────

export const FinanceSummaryStrip = () => {
  const { data: o, isLoading } = useFinanceOverview();
  if (isLoading || !o) return null;

  const cards: {
    label: string;
    value: string;
    tone: "default" | "positive" | "negative" | "warning" | "info";
    icon?: JSX.Element;
  }[] = [
    { label: "Today's Income", value: formatINR(o.todayIncome), tone: "positive", icon: <TrendingUp className="w-4 h-4" /> },
    { label: "Today's Expense", value: formatINR(o.todayExpense), tone: "negative", icon: <Receipt className="w-4 h-4" /> },
    { label: "Monthly Income", value: formatINR(o.monthIncome), tone: "positive" },
    { label: "Monthly Expense", value: formatINR(o.monthExpense), tone: "negative" },
    { label: "Net Profit", value: formatINR(o.netProfit), tone: o.netProfit >= 0 ? "positive" : "negative", icon: <Banknote className="w-4 h-4" /> },
    { label: "Student Fee Income", value: formatINR(o.studentFeeIncome), tone: "info", icon: <PiggyBank className="w-4 h-4" /> },
    { label: "Salary Expense", value: formatINR(o.salaryExpense), tone: "warning", icon: <Wallet className="w-4 h-4" /> },
    { label: "Other Income", value: formatINR(o.otherIncome), tone: "default" },
    { label: "Other Expense", value: formatINR(o.otherExpense), tone: "default" },
    { label: "Outstanding Fees", value: formatINR(o.outstandingFees), tone: "warning" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {cards.map((c) => (
        <FinanceKpiCard key={c.label} label={c.label} value={c.value} tone={c.tone} icon={c.icon} />
      ))}
    </div>
  );
};
