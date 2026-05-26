// ──────────────────────────────────────────────────────────────────────────────
// RouteAccessGuard — submodule/action-level gate for route children.
//
// `ProtectedRoute` only knows about role gates. This guard layers on top:
//   - submodule="fee.collection"  → redirect when the user can't see it
//   - action="fee.collect"        → same, but for fine-grained actions
//   - submodule + action          → both must pass
//
// Use sparingly. Most pages should rely on sidebar/menu filtering (you can't
// click what you can't see). This guard exists for direct-URL access — a
// user typing the path bypasses the menu — and for shared routes that
// multiple roles can reach but only some configurations should expose.
// ──────────────────────────────────────────────────────────────────────────────

import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useEffectiveAccess } from "../hooks/useEffectiveAccess";
import { lookup } from "../resolver/rbacResolver";
import { useHomeRoute } from "@/core/navigation";

interface Props {
  children: ReactNode;
  /** Submodule id the route belongs to. Optional. */
  submodule?: string;
  /** Action id required to render the route. Optional. */
  action?: string;
  /** Where to send denied users. Defaults to the role-home route. */
  redirectTo?: string;
}

export const RouteAccessGuard = ({
  children,
  submodule,
  action,
  redirectTo,
}: Props) => {
  const { data, isLoading } = useEffectiveAccess();
  const home = useHomeRoute();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Checking access…</p>
      </div>
    );
  }

  // Super-role bypass — short-circuit before touching the maps.
  if (data.isSuper) return <>{children}</>;

  const submoduleOk = submodule ? (lookup(data, submodule)?.allowed ?? true) : true;
  const actionOk = action ? (lookup(data, action)?.allowed ?? true) : true;

  if (!submoduleOk || !actionOk) {
    return <Navigate to={redirectTo ?? home} replace />;
  }
  return <>{children}</>;
};
