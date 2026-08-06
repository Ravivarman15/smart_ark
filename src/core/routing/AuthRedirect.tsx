import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useHomeRoute } from "@/core/navigation";
import { usePermissions } from "@/core/permissions";

const Splash = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <p className="text-muted-foreground">Loading...</p>
  </div>
);

// Root entry redirector. Sends the authenticated user to the home route
// determined by NAV_CONFIG (the `isHome: true` item in the "dashboard"
// group that matches their role). Replaces the previous hardcoded
// role→route map — adding a new role only requires updating menu.config.ts.
export const AuthRedirect = () => {
  const { isAuthenticated, isParentAuthenticated, loading: authLoading } = useAuth();
  const { isLoading: permissionsLoading } = usePermissions();
  const home = useHomeRoute();

  if (authLoading) return <Splash />;

  // Parents resolve BEFORE the RBAC gate. Staff RBAC is keyed on a `profiles`
  // row, which a parent does not have — waiting on `permissionsLoading` here
  // would stall the portal behind a permission set that can never arrive.
  // Parent authorisation is row-level (parent_student_links), not menu-level.
  if (isParentAuthenticated) return <Navigate to="/parent" replace />;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (permissionsLoading) return <Splash />;

  // A signed-in user with NO role has no home: useHomeRoute() falls back to
  // "/", and "/" renders RootRoute → AuthRedirect → "/" again. An infinite
  // redirect loop, not merely a dead end.
  //
  // Exactly one person is ever in that state: someone who signed up, confirmed
  // their email, and never finished naming their organization. Phase 0's
  // handle_new_user() deliberately creates NO profile for a signup that carries
  // no staff role, so they have no role, no membership and nowhere to land.
  // Before this, closing the tab mid-signup and logging back in later stranded
  // them permanently.
  //
  // Safe for every existing user by construction: ROLE_HOME_ROUTE is a
  // Record<Role, string> covering all four roles, so anyone WITH a role gets a
  // real route and never reaches this line.
  if (home === "/") return <Navigate to="/signup" replace />;

  return <Navigate to={home} replace />;
};
