// Dashboard domain types. UI-only types live with widget components.
// All money values are paise/rupees (whole units) — see fees/utils/calculations.

import type { Role } from "@/core/constants/roles";

// ── Trend helpers ────────────────────────────────────────────────────────────
export type TrendDirection = "up" | "down" | "flat";

export interface TrendPoint {
  /** YYYY-MM-DD or "Mon", "Week 1", etc. depending on the granularity. */
  label: string;
  value: number;
}

export interface TrendSummary {
  current: number;
  previous: number;
  /** (current - previous) / previous, rounded to 2 decimals. null if previous is 0. */
  changePct: number | null;
  direction: TrendDirection;
}

// ── Core analytics payloads (1 service call → 1 payload) ─────────────────────

export interface DashboardAnalytics {
  totalStudents: number;
  activeStudents: number;
  todayEnquiries: number;
  todayAbsentStaff: number;
  enquiryConversionPct: number;
  attendancePct: number;
}

export interface FinanceAnalytics {
  // Today
  todayIncome: number;
  todayExpense: number;
  todayRefund: number;
  todayFeeDue: number;

  // Aggregated
  feeOverdue: number;
  upcomingFeeDue: number;
  totalPendingFee: number;
  totalIncome: number;
  totalExpense: number;
  profitLoss: number;

  /** Optional 30-day income/expense series used by the chart widget. */
  series: { date: string; income: number; expense: number }[];
}

export interface AttendanceAnalytics {
  presentToday: number;
  absentToday: number;
  pendingApproval: number;
  attendancePct: number;
}

export interface PendingApprovalsSummary {
  pendingAdmissions: number;
  pendingLeaves: number;
  pendingCheckIns: number;
  pendingCheckOuts: number;
  pendingOverrides: number;
  /** Sum of every counter above — convenient for a single KPI tile. */
  total: number;
}

export interface EnquiryAnalytics {
  todayEnquiries: number;
  weekEnquiries: number;
  monthEnquiries: number;
  conversionPct: number;
  byStatus: { status: string; count: number }[];
}

// ── Widget registry & layout ────────────────────────────────────────────────
// Widgets are addressed by a stable string id. The registry is the only place
// that maps id → component, so the layout config can live in the DB without
// React knowing about it.

export type WidgetId =
  | "kpi.totalStudents"
  | "kpi.activeStudents"
  | "kpi.todayEnquiries"
  | "kpi.todayAbsent"
  | "kpi.todayIncome"
  | "kpi.todayExpense"
  | "kpi.todayRefund"
  | "kpi.todayFeeDue"
  | "kpi.feeOverdue"
  | "kpi.upcomingFeeDue"
  | "kpi.totalPendingFee"
  | "kpi.totalIncome"
  | "kpi.totalExpense"
  | "kpi.profitLoss"
  | "card.revenue"
  | "card.attendance"
  | "card.feeDue"
  | "card.profitLoss"
  | "card.inquiryAnalytics"
  | "card.pendingApprovals";

export type WidgetSize = "sm" | "md" | "lg" | "xl";

export interface WidgetMeta {
  id: WidgetId;
  /** Default human label — DB layout can override. */
  label: string;
  /** Role gate. Empty array = all authenticated roles. */
  roles: Role[];
  /** Optional fine-grained permission key (matches ACTION_DEFS). */
  action?: string;
  /** Used by the grid renderer to pick a column span. */
  defaultSize: WidgetSize;
}

export interface WidgetLayoutItem {
  widgetId: WidgetId;
  /** Lower numbers render first. */
  order: number;
  hidden?: boolean;
  /** Override the default size. */
  size?: WidgetSize;
}

export interface DashboardLayout {
  /** "management" | "admin" | "coordinator" | "teacher" or a custom slug. */
  scope: string;
  items: WidgetLayoutItem[];
  /** ISO timestamp of last update — used for cache busting. */
  updatedAt?: string;
}
