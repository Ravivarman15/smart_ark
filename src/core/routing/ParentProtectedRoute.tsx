import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Gate for `/parent/*`.
 *
 * The mirror image of ProtectedRoute: that one admits a STAFF principal whose
 * `profiles.role` is in an allow-list; this one admits a PARENT principal —
 * an active `parent_auth_accounts` row behind the session.
 *
 * Deliberately NOT expressed as `ProtectedRoute allowedRoles={["parent"]}`.
 * Adding "parent" to the staff Role union would have made every staff-role
 * switch in the app structurally capable of matching a parent, and would have
 * dragged parents into the RBAC menu/permission catalogs where they have no
 * business. Keeping the two guards separate means a staff session can never
 * satisfy this check and a parent session can never satisfy ProtectedRoute —
 * the portals cannot leak into each other by omission.
 *
 * This is a UX gate only. The real access boundary is RLS: even a forged
 * client-side route change reaches a database where every table is scoped by
 * `is_parent_of()`.
 */
export const ParentProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isParentAuthenticated, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // A staff member who navigates to /parent is sent to their own portal via the
  // root redirector rather than to /login — bouncing an already-authenticated
  // user to a login form reads as a session failure.
  if (isAuthenticated) return <Navigate to="/" replace />;

  if (!isParentAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
};
