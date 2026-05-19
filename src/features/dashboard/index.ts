// Public API of the dashboard feature.
// External code should import from "@/features/dashboard" — never reach into
// subfolders.

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  TrendDirection,
  TrendPoint,
  TrendSummary,
  DashboardAnalytics,
  FinanceAnalytics,
  AttendanceAnalytics,
  PendingApprovalsSummary,
  EnquiryAnalytics,
  WidgetId,
  WidgetSize,
  WidgetMeta,
  WidgetLayoutItem,
  DashboardLayout,
} from "./types";

// ── Utils ───────────────────────────────────────────────────────────────────
export { today, daysAgo, daysAhead, dateRange, monthStart, summariseTrend, formatChangePct } from "./utils";

// ── Services ────────────────────────────────────────────────────────────────
export { analyticsService, financeAnalyticsService, dashboardService } from "./services";

// ── Hooks ───────────────────────────────────────────────────────────────────
export {
  useDashboardAnalytics,
  useRevenueAnalytics,
  useAttendanceAnalytics,
  usePendingApprovals,
  useEnquiryAnalytics,
  useDashboardLayout,
  useSaveDashboardLayout,
  useDashboardConfig,
  type ResolvedWidget,
} from "./hooks";

// ── Components ──────────────────────────────────────────────────────────────
export {
  TrendBadge,
  DashboardWidgetContainer,
  KPIStatCard,
  DashboardGrid,
} from "./components";

// ── Widgets ─────────────────────────────────────────────────────────────────
// Direct widget exports are optional — most consumers should let the grid
// resolve them via the registry. Exposed here for tests and one-off pages.
export {
  RevenueAnalyticsCard,
  AttendanceAnalyticsCard,
  FeeDueCard,
  ProfitLossCard,
  InquiryAnalyticsCard,
  PendingApprovalCard,
} from "./widgets";

// ── Registry ────────────────────────────────────────────────────────────────
export { WIDGET_REGISTRY, DEFAULT_LAYOUTS, DASHBOARD_ENABLED_ROLES, type WidgetEntry } from "./registry";
