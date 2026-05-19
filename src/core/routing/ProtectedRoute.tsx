import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { Role } from "@/core/constants/roles";

interface Props {
  children: ReactNode;
  allowedRoles: Role[];
  redirectTo?: string;
}

// Single source of truth for role gating. Replaces the inline component
// previously living in App.tsx. Adds a configurable redirect target so
// future flows (e.g. "no access" page) can drop in without editing this.
export const ProtectedRoute = ({ children, allowedRoles, redirectTo = "/login" }: Props) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user || !allowedRoles.includes(user.role as Role)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
};
