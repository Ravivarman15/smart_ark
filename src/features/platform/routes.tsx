// ──────────────────────────────────────────────────────────────────────────────
// PLATFORM ROUTE REGISTRY
//
// One place declaring every /platform route with the capability that guards it.
// Deliberately NOT part of core/routing/sharedRoutes.tsx: that registry mounts
// pages into the four TENANT layouts, and a control-plane page appearing there
// by accident would be a cross-boundary leak of the worst kind.
//
// Every page is lazy-loaded, so a tenant user never downloads the control-plane
// bundle at all.
// ──────────────────────────────────────────────────────────────────────────────

import { Route, Navigate } from "react-router-dom";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { PlatformProtectedRoute, PlatformLayout } from "./components/PlatformShell";
import type { PlatformCapability } from "./context/PlatformAuthContext";

const DashboardPage = lazy(() => import("./pages/PlatformDashboardPage"));
const OrganizationsPage = lazy(() => import("./pages/OrganizationsPage"));
const OrganizationDetailPage = lazy(() => import("./pages/OrganizationDetailPage"));
const ProvisioningPage = lazy(() => import("./pages/ProvisioningPage"));
// Referenced only from DEV_ROUTES below, so this import is dead code in a
// production build and the chunk is never emitted.
const AuthDebugPage = lazy(() => import("./pages/AuthDebugPage"));

const Commerce = {
  Plans: lazy(() => import("./pages/CommercePages").then((m) => ({ default: m.PlansPage }))),
  Pricing: lazy(() => import("./pages/CommercePages").then((m) => ({ default: m.PricingPage }))),
  Subscriptions: lazy(() => import("./pages/CommercePages").then((m) => ({ default: m.SubscriptionsPage }))),
  Coupons: lazy(() => import("./pages/CommercePages").then((m) => ({ default: m.CouponsPage }))),
  Revenue: lazy(() => import("./pages/CommercePages").then((m) => ({ default: m.RevenuePage }))),
  Invoices: lazy(() => import("./pages/CommercePages").then((m) => ({ default: m.InvoicesPage }))),
};

const Ops = {
  Usage: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.UsagePage }))),
  Storage: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.StoragePage }))),
  Health: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.SystemHealthPage }))),
  Audit: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.AuditPage }))),
  Security: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.SecurityPage }))),
  Logs: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.LogsPage }))),
  Support: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.SupportPage }))),
  Backups: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.BackupsPage }))),
  Settings: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.PlatformSettingsPage }))),
  Users: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.PlatformUsersPage }))),
  FeatureFlags: lazy(() => import("./pages/OperationsPages").then((m) => ({ default: m.FeatureFlagsPage }))),
};

interface PlatformRoute {
  path: string;
  element: JSX.Element;
  /** Capability required IN ADDITION to being a platform user. */
  capability?: PlatformCapability;
}

/**
 * Development-only routes.
 *
 * `import.meta.env.DEV` is statically replaced at build time, so Vite drops both
 * this array AND the lazy import below from a production bundle — the chunk is
 * never emitted and the route cannot be reached, regardless of capability. That
 * matters because the page prints JWT claims: capability gating alone would
 * still leave it one compromised platform account away from being readable.
 */
const DEV_ROUTES: PlatformRoute[] = import.meta.env.DEV
  ? [{
      path: "debug/auth",
      element: <AuthDebugPage />,
      // Narrowest capability in the set — this is a diagnostics surface, not an
      // operational one.
      capability: "settings.manage",
    }]
  : [];

export const PLATFORM_ROUTES: PlatformRoute[] = [
  ...DEV_ROUTES,
  { path: "dashboard", element: <DashboardPage /> },
  { path: "organizations", element: <OrganizationsPage />, capability: "organizations.read" },
  { path: "organization/:id", element: <OrganizationDetailPage />, capability: "organizations.read" },
  { path: "provisioning", element: <ProvisioningPage />, capability: "organizations.read" },
  { path: "plans", element: <Commerce.Plans />, capability: "plans.manage" },
  { path: "pricing", element: <Commerce.Pricing />, capability: "plans.manage" },
  { path: "subscriptions", element: <Commerce.Subscriptions />, capability: "billing.read" },
  { path: "coupons", element: <Commerce.Coupons />, capability: "coupons.manage" },
  { path: "invoices", element: <Commerce.Invoices />, capability: "billing.read" },
  { path: "revenue", element: <Commerce.Revenue />, capability: "billing.read" },
  { path: "usage", element: <Ops.Usage />, capability: "usage.read" },
  { path: "storage", element: <Ops.Storage />, capability: "usage.read" },
  { path: "feature-flags", element: <Ops.FeatureFlags />, capability: "feature_flags.manage" },
  { path: "support", element: <Ops.Support />, capability: "support.manage" },
  { path: "system-health", element: <Ops.Health />, capability: "health.read" },
  { path: "backups", element: <Ops.Backups />, capability: "settings.manage" },
  { path: "audit", element: <Ops.Audit />, capability: "audit.read" },
  { path: "security", element: <Ops.Security />, capability: "audit.read" },
  { path: "logs", element: <Ops.Logs />, capability: "audit.read" },
  { path: "platform-settings", element: <Ops.Settings />, capability: "settings.manage" },
  { path: "users", element: <Ops.Users />, capability: "platform.users.manage" },
];

/**
 * Mount the control plane.
 *
 * The layout itself is wrapped in PlatformProtectedRoute with no capability, so
 * merely being an MFA-enrolled platform user gets you the shell; each child then
 * re-checks its own capability. Two layers, because a missing capability on one
 * route should never mean an unauthenticated visitor sees the chrome.
 */
export const renderPlatformRoutes = () => (
  <Route
    path="/platform"
    element={
      <PlatformProtectedRoute>
        <PlatformLayout />
      </PlatformProtectedRoute>
    }
  >
    <Route index element={<Navigate to="/platform/dashboard" replace />} />
    {PLATFORM_ROUTES.map((r) => (
      <Route
        key={r.path}
        path={r.path}
        element={
          <PlatformProtectedRoute capability={r.capability}>
            {r.element}
          </PlatformProtectedRoute>
        }
      />
    ))}
  </Route>
);
