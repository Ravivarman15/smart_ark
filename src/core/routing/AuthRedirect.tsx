import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useHomeRoute } from "@/core/navigation";
import { usePermissions } from "@/core/permissions";

// Root entry redirector. Sends the authenticated user to the home route
// determined by NAV_CONFIG (the `isHome: true` item in the "dashboard"
// group that matches their role). Replaces the previous hardcoded
// role→route map — adding a new role only requires updating menu.config.ts.
export const AuthRedirect = () => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { isLoading: permissionsLoading } = usePermissions();
  const home = useHomeRoute();

  if (authLoading || permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={home} replace />;
};
