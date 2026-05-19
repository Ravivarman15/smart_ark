import { formatINR } from "@/features/fees";
import { KPIStatCard } from "../components/KPIStatCard";
import { useDashboardAnalytics } from "../hooks/useDashboardAnalytics";
import { useRevenueAnalytics } from "../hooks/useRevenueAnalytics";

// Single-purpose KPI widgets — each one binds a hook to a tile. Kept here as
// a single file because they share the same pattern: one hook, one tile, no
// extra logic. Splitting into 14 files would be noise.

const fmt = (v: number) => formatINR(v);

export const TotalStudentsWidget = () => {
  const { data } = useDashboardAnalytics();
  return (
    <KPIStatCard
      label="Total Students"
      icon="GraduationCap"
      tone="info"
      value={data?.totalStudents ?? "—"}
      hint={data ? `${data.activeStudents} active` : undefined}
    />
  );
};

export const ActiveStudentsWidget = () => {
  const { data } = useDashboardAnalytics();
  return (
    <KPIStatCard
      label="Active Students"
      icon="Users"
      tone="info"
      value={data?.activeStudents ?? "—"}
    />
  );
};

export const TodayEnquiriesWidget = () => {
  const { data } = useDashboardAnalytics();
  return (
    <KPIStatCard
      label="Today's Enquiries"
      icon="PhoneCall"
      tone="info"
      value={data?.todayEnquiries ?? "—"}
      hint={data ? `${data.enquiryConversionPct}% lifetime conversion` : undefined}
    />
  );
};

export const TodayAbsentWidget = () => {
  const { data } = useDashboardAnalytics();
  return (
    <KPIStatCard
      label="Today Absent"
      icon="UserCheck"
      tone={data && data.todayAbsentStaff > 0 ? "warning" : "success"}
      value={data?.todayAbsentStaff ?? "—"}
      hint={data ? `${data.attendancePct}% attendance` : undefined}
    />
  );
};

// ── Finance tiles ────────────────────────────────────────────────────────────

export const TodayIncomeWidget = () => {
  const { data } = useRevenueAnalytics();
  return (
    <KPIStatCard
      label="Today Income"
      icon="DollarSign"
      tone="success"
      value={data ? fmt(data.todayIncome) : "—"}
    />
  );
};

export const TodayExpenseWidget = () => {
  const { data } = useRevenueAnalytics();
  return (
    <KPIStatCard
      label="Today Expense"
      icon="Receipt"
      tone="danger"
      value={data ? fmt(data.todayExpense) : "—"}
      invertSentiment
    />
  );
};

export const TodayRefundWidget = () => {
  const { data } = useRevenueAnalytics();
  return (
    <KPIStatCard
      label="Today Refund"
      icon="RotateCcw"
      tone="warning"
      value={data ? fmt(data.todayRefund) : "—"}
      invertSentiment
    />
  );
};

export const TodayFeeDueWidget = () => {
  const { data } = useRevenueAnalytics();
  return (
    <KPIStatCard
      label="Today Fee Due"
      icon="CreditCard"
      tone="warning"
      value={data ? fmt(data.todayFeeDue) : "—"}
    />
  );
};

export const FeeOverdueWidget = () => {
  const { data } = useRevenueAnalytics();
  return (
    <KPIStatCard
      label="Fee Overdue"
      icon="AlertTriangle"
      tone="danger"
      value={data ? fmt(data.feeOverdue) : "—"}
      invertSentiment
    />
  );
};

export const UpcomingFeeDueWidget = () => {
  const { data } = useRevenueAnalytics();
  return (
    <KPIStatCard
      label="Upcoming Fee Due"
      icon="Calendar"
      tone="info"
      value={data ? fmt(data.upcomingFeeDue) : "—"}
      hint="next 7 days"
    />
  );
};

export const TotalPendingFeeWidget = () => {
  const { data } = useRevenueAnalytics();
  return (
    <KPIStatCard
      label="Total Pending Fee"
      icon="Wallet"
      tone="warning"
      value={data ? fmt(data.totalPendingFee) : "—"}
    />
  );
};

export const TotalIncomeWidget = () => {
  const { data } = useRevenueAnalytics();
  return (
    <KPIStatCard
      label="Total Income"
      icon="TrendingUp"
      tone="success"
      value={data ? fmt(data.totalIncome) : "—"}
    />
  );
};

export const TotalExpenseWidget = () => {
  const { data } = useRevenueAnalytics();
  return (
    <KPIStatCard
      label="Total Expense"
      icon="Receipt"
      tone="danger"
      value={data ? fmt(data.totalExpense) : "—"}
      invertSentiment
    />
  );
};

export const ProfitLossKpiWidget = () => {
  const { data } = useRevenueAnalytics();
  const positive = (data?.profitLoss ?? 0) >= 0;
  return (
    <KPIStatCard
      label="Profit / Loss"
      icon="BarChart3"
      tone={positive ? "success" : "danger"}
      value={data ? fmt(data.profitLoss) : "—"}
      hint={positive ? "Profit" : "Loss"}
    />
  );
};
