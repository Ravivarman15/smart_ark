// ── Parent Portal — route gate ───────────────────────────────────────────────
//
// Hiding a link is not hiding a page. A parent who bookmarked /parent/fees, or
// followed a link in an old email, reaches the page whatever the sidebar shows
// — so the same resolved answer has to gate the ROUTE as well as the menu.
//
// It wraps the shell's <Outlet/> rather than each route element, which means a
// page added to the registry tomorrow is gated the day it is mounted. Gating
// per-route would have made "forgot to wrap the new one" a silent hole.
//
// ┌── WHAT THIS IS AND IS NOT ─────────────────────────────────────────────┐
// │ This is a PRESENTATION gate: it stops the institution's parents being  │
// │ shown a page the institution chose not to offer. It is not a security  │
// │ boundary and must never be treated as one — a parent's access to data  │
// │ is decided by RLS (`is_parent_of()`), on the server, unchanged by      │
// │ anything here.                                                         │
// │                                                                        │
// │ Which is exactly why this renders an EXPLANATION rather than a 404 or  │
// │ a redirect to Home. A parent following their own bookmark has done     │
// │ nothing wrong; silently teleporting them to the dashboard reads as a   │
// │ broken portal and produces a phone call to the office.                 │
// └────────────────────────────────────────────────────────────────────────┘

import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { EyeOff } from "lucide-react";
import { parentModuleForPath } from "../constants/parentModules";
import { useParentModules } from "../hooks/useParentModules";
import { EmptyState } from "./primitives";

export const ParentModuleGate = ({ children }: { children: ReactNode }) => {
  const loc = useLocation();
  const { map, isLoading } = useParentModules();

  // A path with no registry entry is not this gate's business — the router's
  // own catch-all already handles unknown /parent/* URLs.
  const mod = parentModuleForPath(loc.pathname);
  if (!mod) return <>{children}</>;

  // Hold the page rather than flashing it. Rendering first and withdrawing a
  // moment later would show a parent fee figures their institution had chosen
  // not to publish to them.
  if (isLoading) return null;

  const state = map[mod.id];
  if (state?.enabled) return <>{children}</>;

  return (
    <EmptyState
      icon={<EyeOff className="w-9 h-9" />}
      title={`${mod.label} is not available`}
      hint={
        state?.source === "entitlement"
          ? "This section is not part of your institution's current plan. Please contact the office if you were expecting it."
          : "Your institution does not currently share this section through the parent portal. Please contact the office if you need this information."
      }
    />
  );
};
