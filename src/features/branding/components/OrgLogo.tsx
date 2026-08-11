import React from "react";
import { cn } from "@/lib/utils";
import { useOrganizationBranding } from "@/core/theme/OrganizationThemeProvider";
import { monogramOf } from "../documents/monogram";

// ──────────────────────────────────────────────────────────────────────────────
// ORGANIZATION MARK — the in-app chrome logo
//
// Seven files imported `@/assets/ark-logo.jpeg` directly and rendered it in the
// sidebar or app bar: AdminSidebar, CoordinatorSidebar, ManagementSidebar,
// RoleSidebar, ParentSidebar, ParentShellLayout and TeacherDashboard. Every
// tenant's staff — and every tenant's PARENTS, via the parent portal — saw ARK
// Learning Arena's mark on every screen of the product they pay for.
//
// This resolves the logo from the caller's own organization, and falls back to
// a MONOGRAM of that organization's initials rather than to any default image.
// There is no default image, deliberately: the only one available would be
// another tenant's.
//
// It reads `useOrganizationBranding()` — the provider that already wraps the
// authenticated app and already fetched this row for theming. No new query.
// ──────────────────────────────────────────────────────────────────────────────

export const OrgLogo: React.FC<{
  /** Tailwind sizing/rounding for the tile, matching whatever it replaces. */
  className?: string;
  /**
   * Decorative when the organization name is already rendered beside it —
   * an alt of the name would make a screen reader announce it twice.
   */
  decorative?: boolean;
}> = ({ className, decorative }) => {
  const { branding } = useOrganizationBranding();
  const name = branding?.appName || branding?.portalName || "";
  const logo = branding?.logoUrl || "";

  if (logo) {
    return (
      <img
        src={logo}
        alt={decorative ? "" : name}
        className={cn("object-cover bg-background", className)}
      />
    );
  }

  return (
    <div
      aria-hidden={decorative || !name}
      role={decorative || !name ? undefined : "img"}
      aria-label={decorative || !name ? undefined : name}
      className={cn(
        "flex items-center justify-center bg-primary text-primary-foreground font-bold",
        className,
      )}
    >
      {/* An empty tile reads as a broken image; initials read as "no logo yet".
          `monogramOf("")` returns a bullet, so this is never blank. */}
      <span className="text-[0.7em] leading-none tracking-tight">{monogramOf(name)}</span>
    </div>
  );
};
