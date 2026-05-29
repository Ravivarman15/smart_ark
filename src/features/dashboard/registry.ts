import { type ComponentType } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import type { Role } from "@/core/constants/roles";
import type { WidgetId, WidgetMeta, WidgetSize } from "./types/dashboard.types";

// ──────────────────────────────────────────────────────────────────────────────
// WIDGET REGISTRY
// ──────────────────────────────────────────────────────────────────────────────
// One declarative table maps widget id → metadata + component. Everything that
// renders on the dashboard goes through this:
//   - the page reads the layout (DB or default) which is an *ordered* list of
//     widget ids
//   - the registry turns each id into a component + role gate
//   - the page filters by `usePermissions` and renders what's left
//
// Adding a new widget:
//   1. write the component in `./widgets/`
//   2. add the lazy import below
//   3. add a row to `WIDGET_REGISTRY` with its default size + role gate
//   4. (optional) include it in `DEFAULT_LAYOUTS` for one or more roles
//
// Role gating here is a *first-pass* check. Action-level gating (the granular
// `staff_action_rights` table) is handled at render-time by the page, via
// `usePermissions().canDoAction()`. Keeping both layers means a role override
// or a permission override can independently hide a widget.
// ──────────────────────────────────────────────────────────────────────────────

// Components are lazy so a dashboard that only shows 6 widgets doesn't ship
// the JS for the other 14.
const lazyWidget = (loader: () => Promise<Record<string, ComponentType>>, exportName: string) =>
  lazy(() => loader().then((m) => ({ default: m[exportName] })));

const kpi = (name: string) => lazyWidget(() => import("./widgets/KpiWidgets"), name);

export interface WidgetEntry extends WidgetMeta {
  Component: ComponentType;
}

const E = (
  id: WidgetId,
  label: string,
  Component: ComponentType,
  opts: { roles?: Role[]; action?: string; size?: WidgetSize } = {}
): WidgetEntry => ({
  id,
  label,
  Component,
  roles: opts.roles ?? [],
  action: opts.action,
  defaultSize: opts.size ?? "sm",
});

const ALL_ROLES: Role[] = ["admin", "coordinator", "management", "teacher"];
const MGMT: Role[] = ["management"];
const MGMT_ADMIN: Role[] = ["management", "admin"];

export const WIDGET_REGISTRY: Record<WidgetId, WidgetEntry> = {
  // ── KPI tiles ──────────────────────────────────────────────────────────────
  "kpi.totalStudents":  E("kpi.totalStudents",  "Total Students",  kpi("TotalStudentsWidget"),  { roles: MGMT_ADMIN }),
  "kpi.activeStudents": E("kpi.activeStudents", "Active Students", kpi("ActiveStudentsWidget"), { roles: MGMT_ADMIN }),
  "kpi.todayEnquiries": E("kpi.todayEnquiries", "Today Enquiries", kpi("TodayEnquiriesWidget"), { roles: ["management", "admin", "coordinator"], action: "enquiry.manage" }),
  "kpi.todayAbsent":    E("kpi.todayAbsent",    "Today Absent",    kpi("TodayAbsentWidget"),    { roles: MGMT_ADMIN, action: "staff.attendance" }),

  "kpi.todayIncome":    E("kpi.todayIncome",    "Today Income",    kpi("TodayIncomeWidget"),    { roles: MGMT, action: "expense.manage" }),
  "kpi.todayExpense":   E("kpi.todayExpense",   "Today Expense",   kpi("TodayExpenseWidget"),   { roles: MGMT, action: "expense.manage" }),
  "kpi.todayRefund":    E("kpi.todayRefund",    "Today Refund",    kpi("TodayRefundWidget"),    { roles: MGMT, action: "fee.manage" }),
  "kpi.todayFeeDue":    E("kpi.todayFeeDue",    "Today Fee Due",   kpi("TodayFeeDueWidget"),    { roles: MGMT_ADMIN, action: "fee.collection" }),

  "kpi.feeOverdue":     E("kpi.feeOverdue",     "Fee Overdue",     kpi("FeeOverdueWidget"),     { roles: MGMT_ADMIN, action: "fee.collection" }),
  "kpi.upcomingFeeDue": E("kpi.upcomingFeeDue", "Upcoming Fee Due", kpi("UpcomingFeeDueWidget"), { roles: MGMT_ADMIN, action: "fee.collection" }),
  "kpi.totalPendingFee": E("kpi.totalPendingFee", "Total Pending Fee", kpi("TotalPendingFeeWidget"), { roles: MGMT, action: "fee.manage" }),

  "kpi.totalIncome":    E("kpi.totalIncome",    "Total Income",    kpi("TotalIncomeWidget"),    { roles: MGMT }),
  "kpi.totalExpense":   E("kpi.totalExpense",   "Total Expense",   kpi("TotalExpenseWidget"),   { roles: MGMT }),
  "kpi.profitLoss":     E("kpi.profitLoss",     "Profit / Loss",   kpi("ProfitLossKpiWidget"),  { roles: MGMT }),

  // ── Larger card widgets ────────────────────────────────────────────────────
  "card.revenue":           E("card.revenue",           "Revenue Trend",      lazyWidget(() => import("./widgets/RevenueAnalyticsCard"),    "RevenueAnalyticsCard"),    { roles: MGMT, size: "lg" }),
  "card.attendance":        E("card.attendance",        "Staff Attendance",   lazyWidget(() => import("./widgets/AttendanceAnalyticsCard"), "AttendanceAnalyticsCard"), { roles: MGMT_ADMIN, action: "staff.attendance", size: "md" }),
  "card.studentAttendance": E("card.studentAttendance", "Student Attendance", lazyWidget(() => import("./widgets/StudentAttendanceCard"),   "StudentAttendanceCard"),   { roles: MGMT_ADMIN, size: "md" }),
  "card.feeDue":            E("card.feeDue",            "Fee Receivables",    lazyWidget(() => import("./widgets/FeeDueCard"),              "FeeDueCard"),              { roles: MGMT_ADMIN, action: "fee.collection", size: "md" }),
  "card.profitLoss":        E("card.profitLoss",        "Profit / Loss",      lazyWidget(() => import("./widgets/ProfitLossCard"),          "ProfitLossCard"),          { roles: MGMT, size: "md" }),
  "card.inquiryAnalytics":  E("card.inquiryAnalytics",  "Enquiry Funnel",     lazyWidget(() => import("./widgets/InquiryAnalyticsCard"),    "InquiryAnalyticsCard"),    { roles: ["management", "admin", "coordinator"], action: "enquiry.manage", size: "md" }),
  "card.pendingApprovals":  E("card.pendingApprovals",  "Pending Approvals",  lazyWidget(() => import("./widgets/PendingApprovalCard"),     "PendingApprovalCard"),     { roles: MGMT_ADMIN, size: "md" }),
};

// ── Default per-role layouts ──────────────────────────────────────────────────
// Used when no DB-backed layout exists. Lists are *ordered* — the renderer
// preserves order.
const ord = (ids: WidgetId[]): { widgetId: WidgetId; order: number }[] =>
  ids.map((widgetId, i) => ({ widgetId, order: i }));

export const DEFAULT_LAYOUTS: Record<Role | "default", { widgetId: WidgetId; order: number }[]> = {
  management: ord([
    "kpi.totalStudents",
    "kpi.todayEnquiries",
    "kpi.todayAbsent",
    "kpi.todayIncome",
    "kpi.todayExpense",
    "kpi.todayRefund",
    "kpi.todayFeeDue",
    "kpi.feeOverdue",
    "kpi.upcomingFeeDue",
    "kpi.totalPendingFee",
    "kpi.totalIncome",
    "kpi.totalExpense",
    "kpi.profitLoss",
    "card.revenue",
    "card.profitLoss",
    "card.feeDue",
    "card.pendingApprovals",
    "card.studentAttendance",
    "card.attendance",
    "card.inquiryAnalytics",
  ]),
  admin: ord([
    "kpi.totalStudents",
    "kpi.todayEnquiries",
    "kpi.todayAbsent",
    "kpi.todayFeeDue",
    "kpi.feeOverdue",
    "kpi.upcomingFeeDue",
    "card.studentAttendance",
    "card.attendance",
    "card.feeDue",
    "card.pendingApprovals",
    "card.inquiryAnalytics",
  ]),
  coordinator: ord([
    "kpi.todayEnquiries",
    "card.inquiryAnalytics",
  ]),
  teacher: ord([]),
  default: ord([]),
};

// Roles allowed to see a dashboard at all. Teachers get their existing
// TeacherDashboard page, not the management-style grid.
export const DASHBOARD_ENABLED_ROLES: Role[] = ["management", "admin", "coordinator"];

void ALL_ROLES; // kept for future "show me everything" admin mode
