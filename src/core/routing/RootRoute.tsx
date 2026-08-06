// ──────────────────────────────────────────────────────────────────────────────
// ROOT ROUTE — decides what "/" is.
//
// Before Phase 3, "/" was AuthRedirect: signed-in users went to their portal,
// everyone else was bounced to /login. That is correct for an internal ERP and
// wrong for a product with a public website — a prospect arriving at
// smartark.ai would be shown a login form for a system they have never used.
//
// So "/" now resolves by identity:
//
//   signed in  → AuthRedirect (unchanged behaviour, byte for byte)
//   signed out → the marketing home page
//
// AuthRedirect itself is untouched. This wrapper only chooses whether to
// invoke it, which keeps the existing role→home logic in exactly one place.
// ──────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthRedirect } from "./AuthRedirect";

const Splash = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <p className="text-muted-foreground">Loading...</p>
  </div>
);

export const RootRoute = ({ marketingHome }: { marketingHome: ReactNode }) => {
  const { isAuthenticated, isParentAuthenticated, loading } = useAuth();

  // Wait rather than flashing the marketing page at a signed-in user on every
  // hard refresh — the session resolves asynchronously, and a visible flash of
  // "Start free trial" to an existing customer looks broken.
  if (loading) return <Splash />;

  if (isAuthenticated || isParentAuthenticated) return <AuthRedirect />;

  return <>{marketingHome}</>;
};
