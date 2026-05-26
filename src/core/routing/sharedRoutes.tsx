// ──────────────────────────────────────────────────────────────────────────────
// Shared route registry — single source of truth for any route that's
// available to more than one role. Each entry lists:
//
//   - the path relative to the role layout root (e.g. "setup/years")
//   - the lazy-loaded element to render
//   - the RBAC submodule + optional action key (so LayoutAccessGate can
//     enforce per-role access without duplicating role-list checks)
//   - which role layouts the route should mount under (defaults to all four)
//
// Why a registry: before this file existed, each shared page was declared
// 2-3 times in App.tsx (once per role layout). RBAC could grant a module
// to a fourth role (e.g. teacher gets Setup) but the route literally didn't
// exist under /teacher/ — clicking the sidebar item just landed on
// coming-soon. The registry collapses every shared declaration into one
// row and lets us mount it under any layout without duplication.
// ──────────────────────────────────────────────────────────────────────────────

import { lazy, type ReactNode } from "react";
import { Route } from "react-router-dom";
import type { Role } from "@/core/constants/roles";

// ── Lazy imports ────────────────────────────────────────────────────────────
// Setup module
const ManageYearsPage = lazy(() => import("@/features/setup/pages/ManageYearsPage"));
const ManageStandardsPage = lazy(() => import("@/features/setup/pages/ManageStandardsPage"));
const ManageSubjectsPage = lazy(() => import("@/features/setup/pages/ManageSubjectsPage"));
const ManageCourseTypesPage = lazy(() => import("@/features/setup/pages/ManageCourseTypesPage"));
const ManageBatchesPage = lazy(() => import("@/features/setup/pages/ManageBatchesPage"));
const ManageTimetablePage = lazy(() => import("@/features/setup/pages/ManageTimetablePage"));
const ManageTaxesPage = lazy(() => import("@/features/setup/pages/ManageTaxesPage"));
const ExpenseCategories = lazy(() => import("@/pages/setup/ExpenseCategories"));
const FeeStructurePage = lazy(() => import("@/pages/setup/FeeStructure"));

// Help module (already shared across all four roles in App.tsx; we mirror
// the existing wiring here so the registry stays the single source).
const HelpSupportRequest = lazy(() => import("@/features/help/pages/SupportRequestPage"));
const HelpSupportHistory = lazy(() => import("@/features/help/pages/SupportHistoryPage"));
const HelpFeedback = lazy(() => import("@/features/help/pages/FeedbackPage"));
const HelpManagementTriage = lazy(() => import("@/features/help/pages/ManagementTriagePage"));
const HelpTicketAnalytics = lazy(() => import("@/features/help/pages/TicketAnalyticsPage"));
const HelpPublicFeedbackBoard = lazy(() => import("@/features/help/pages/PublicFeedbackBoardPage"));

const ComingSoon = lazy(() => import("@/pages/shared/ComingSoon"));
const LeaveManagement = lazy(() => import("@/pages/shared/LeaveManagement"));

export interface SharedRouteDef {
  /** Path relative to the role layout root. No leading slash. */
  path: string;
  element: ReactNode;
  /** RBAC submodule key — paired with menu config + LayoutAccessGate. */
  submodule?: string;
  /** RBAC action key. */
  action?: string;
  /** Restrict mounting to these layouts. Empty/undefined → mount everywhere. */
  layouts?: Role[];
  /** Human label for diagnostics ("Manage Year"). */
  label: string;
}

// ── Registry ────────────────────────────────────────────────────────────────
// Setup is the first module driven entirely off the registry. Everything
// else can be migrated incrementally — App.tsx still declares the role-
// specific blocks directly for now.
export const SHARED_ROUTES: SharedRouteDef[] = [
  // ── Setup ─────────────────────────────────────────────────────────────
  {
    path: "setup/years",
    element: <ManageYearsPage />,
    submodule: "setup.manage_year",
    label: "Manage Year",
  },
  {
    path: "setup/standards",
    element: <ManageStandardsPage />,
    submodule: "setup.assign_standard",
    label: "Assign Standard",
  },
  {
    path: "setup/subjects",
    element: <ManageSubjectsPage />,
    submodule: "setup.assign_subject",
    label: "Assign Subject",
  },
  {
    path: "setup/course-types",
    element: <ManageCourseTypesPage />,
    submodule: "setup.manage_course_type",
    label: "Manage Course Type",
  },
  {
    path: "setup/batches",
    element: <ManageBatchesPage />,
    submodule: "setup.manage_batch",
    label: "Manage Class / Batch",
  },
  {
    path: "setup/timetable",
    element: <ManageTimetablePage />,
    submodule: "setup.timetable",
    label: "Manage Time Table",
  },
  {
    path: "setup/taxes",
    element: <ManageTaxesPage />,
    submodule: "setup.manage_tax",
    label: "Manage Tax",
  },
  {
    path: "setup/expense-categories",
    element: <ExpenseCategories />,
    submodule: "expense.manage_type",
    label: "Manage Expense Type",
  },
  {
    path: "setup/fee-structures",
    element: <FeeStructurePage />,
    submodule: "fee.manage_structure",
    label: "Manage Fee Structure",
  },

  // ── Help (mirrors existing per-role wiring) ──────────────────────────
  {
    path: "help",
    element: <HelpSupportRequest />,
    submodule: "help.support_request",
    label: "Help support request",
  },
  {
    path: "help/new",
    element: <HelpSupportRequest />,
    submodule: "help.support_request",
    label: "Help new request",
  },
  {
    path: "help/history",
    element: <HelpSupportHistory />,
    submodule: "help.support_history",
    label: "Help history",
  },
  {
    path: "help/history/:id",
    element: <HelpSupportHistory />,
    submodule: "help.support_history",
    label: "Help ticket detail",
  },
  {
    path: "help/feedback",
    element: <HelpPublicFeedbackBoard />,
    submodule: "help.feedback",
    label: "Feedback board",
  },
  {
    path: "help/feedback/new",
    element: <HelpFeedback />,
    submodule: "help.feedback_new",
    label: "Share feedback",
  },
  {
    path: "help/triage",
    element: <HelpManagementTriage />,
    submodule: "help.triage",
    label: "Triage inbox",
    // Triage is admin/coordinator/management responsibility; teachers don't
    // need an inbox for their own tickets.
    layouts: ["admin", "management", "coordinator"],
  },
  {
    path: "help/triage/:id",
    element: <HelpManagementTriage />,
    submodule: "help.triage",
    label: "Triage detail",
    layouts: ["admin", "management", "coordinator"],
  },
  {
    path: "help/analytics",
    element: <HelpTicketAnalytics />,
    submodule: "help.analytics",
    label: "Ticket analytics",
    layouts: ["admin", "management"],
  },

  // ── Catch-alls ───────────────────────────────────────────────────────
  {
    path: "coming-soon/:slug",
    element: <ComingSoon />,
    label: "Coming soon",
  },
  // Teacher historically had a standalone /teacher/leave route — keep it
  // available through the registry so the new teacher shell mounts it too.
  {
    path: "leave",
    element: <LeaveManagement />,
    label: "Leave management",
    layouts: ["teacher"],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const matchesLayout = (def: SharedRouteDef, layout: Role): boolean =>
  !def.layouts || def.layouts.includes(layout);

/**
 * Returns the registered route for a (layout, submodule) pair or null. Used
 * by useNavigation to synthesize real paths instead of coming-soon stubs.
 *
 * Multiple routes can share a submodule (e.g. help/history and
 * help/history/:id both target help.support_history). The first match wins
 * — registry authors order entries with the most useful "menu landing"
 * variant first.
 */
export const findRouteForSubmodule = (
  layout: Role,
  submodule: string,
): SharedRouteDef | null =>
  SHARED_ROUTES.find(
    (r) => r.submodule === submodule && matchesLayout(r, layout),
  ) ?? null;

/** Absolute route path or null when no registered route serves this role. */
export const getRoutePath = (layout: Role, submodule: string): string | null => {
  const def = findRouteForSubmodule(layout, submodule);
  return def ? `/${layout}/${def.path}` : null;
};

/**
 * JSX renderer used by App.tsx to mount the registry under a role layout.
 * Returns an array of `<Route>` elements suitable for spreading inside a
 * parent `<Route>`'s children.
 */
export const renderSharedRoutes = (layout: Role): ReactNode[] =>
  SHARED_ROUTES.filter((r) => matchesLayout(r, layout)).map((r) => (
    <Route key={`${layout}:${r.path}`} path={r.path} element={r.element} />
  ));

/**
 * Diagnostics helper — full registry rows visible to a given layout. Used
 * by the route-ownership inspector on the Permission Diagnostics page.
 */
export const listRoutesForLayout = (layout: Role): SharedRouteDef[] =>
  SHARED_ROUTES.filter((r) => matchesLayout(r, layout));
