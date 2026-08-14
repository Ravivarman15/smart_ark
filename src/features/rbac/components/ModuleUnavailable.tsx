// ──────────────────────────────────────────────────────────────────────────────
// MODULE UNAVAILABLE — what a customer sees when they reach a module their
// organization does not have.
//
// ┌── WHAT THIS DELIBERATELY DOES NOT SAY ─────────────────────────────────┐
// │ Not "not included in your Starter plan". Not "withdrawn platform-wide".│
// │ Not "a Super Admin revoked this on 12 Aug". The resolver knows all      │
// │ three, and the platform console shows them — to the platform.          │
// │                                                                        │
// │ A tenant-facing screen that names the deciding layer leaks commercial   │
// │ posture to anyone who can type a URL: which plan they are on, what the  │
// │ upsell is, and whether the block is a billing state or an outage. It    │
// │ also invites arguing with the wrong party — the person reading this     │
// │ cannot fix any of those, and their own administrator can.               │
// │                                                                        │
// │ So the message is the one actionable fact: it is not enabled here, and  │
// │ this is who to ask. `explain` stays on the platform side.               │
// └────────────────────────────────────────────────────────────────────────┘
//
// Rendered IN PLACE of the outlet, not as a redirect. A bookmark that bounces
// silently to a dashboard teaches the user their bookmark is broken; this
// tells them what actually happened.
// ──────────────────────────────────────────────────────────────────────────────

import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useHomeRoute } from "@/core/navigation";
import { MODULE_CATALOG } from "../constants/catalog";

const labelOf = (moduleId?: string): string | null =>
  MODULE_CATALOG.find((m) => m.id === moduleId)?.label ?? null;

export const ModuleUnavailable = ({ moduleId }: { moduleId?: string }) => {
  const home = useHomeRoute();
  const label = labelOf(moduleId);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>

        <h1 className="text-lg font-semibold text-foreground">
          {label ? `${label} is not enabled` : "This module is not enabled"}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {label ? `${label} is not` : "This module is not"} part of your
          institution&rsquo;s current setup, so it is unavailable on this account.
        </p>

        {/* The reassurance that matters most to someone who has used the module
            before and suddenly cannot. Revoking access never removes records. */}
        <p className="mt-3 text-xs text-muted-foreground">
          Any information already recorded here is retained and will reappear
          unchanged if the module is switched back on.
        </p>

        <p className="mt-4 text-xs text-muted-foreground">
          Please contact your institution&rsquo;s administrator if you expected
          access to this.
        </p>

        <Link
          to={home}
          className="mt-6 inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
};

export default ModuleUnavailable;
