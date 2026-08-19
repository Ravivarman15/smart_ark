// ── Parent Portal — application shell ────────────────────────────────────────
//
// Deliberately NOT RoleSidebar. That component renders NAV_CONFIG filtered by
// staff RBAC (`usePermissions` → role permissions keyed on a `profiles` row) —
// machinery a parent has no row in. Feeding a parent through it would mean
// inventing a fake staff role purely to draw a menu.
//
// The portal's navigation is instead a small, purpose-built list built from
// `constants/parentModules` (see components/ParentSidebar).
//
// That list is configurable PER INSTITUTION — an organization decides which
// pages its own parents are offered, at /settings/parent-portal. What it is
// NOT is a permission system: RLS still decides what a parent may read, and
// hiding a page changes what is presented, never what is protected. The two
// answer different questions and are kept deliberately separate.
//
// LAYOUT — one navigation surface, not two.
// Desktop docks the sidebar; mobile opens the SAME list as a slide-in drawer
// from a hamburger. An earlier version ran bottom tabs alongside a "More"
// sheet, which meant ten of the fourteen pages lived behind an unlabelled
// button and a parent had to learn which mechanism owned which page. One list
// in one order is easier to learn than two.

import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/core/theme";
import { OrgLogo } from "@/features/branding/components/OrgLogo";
import { ActiveChildProvider, useActiveChild } from "../providers/ActiveChildProvider";
import { ParentRealtimeProvider } from "../providers/ParentRealtimeProvider";
import { ChildSwitcher } from "../components/ChildSwitcher";
import { ParentSidebarDocked, ParentSidebarDrawer } from "../components/ParentSidebar";
import { ParentModuleGate } from "../components/ParentModuleGate";
import { useParentModules } from "../hooks/useParentModules";
import { parentModuleForPath } from "../constants/parentModules";
import { parentAuditService } from "../services/parentAudit.service";
import { EmptyState } from "../components/primitives";

/**
 * Page title for the mobile header — parents lose their place without it.
 *
 * Resolved from the registry rather than by walking the rendered menu: the menu
 * is now filtered per organization, and reading the label out of it would leave
 * a hidden-but-reachable page titled "Parent Portal".
 */
const useCurrentPageLabel = (): string => {
  const loc = useLocation();
  return parentModuleForPath(loc.pathname)?.label ?? "Parent Portal";
};

/** Inner shell — needs ActiveChildProvider mounted, hence the split. */
const Shell = () => {
  const { parent, logout } = useAuth();
  const loc = useLocation();
  const { children: kids, isLoading, activeChild } = useActiveChild();
  const [menuOpen, setMenuOpen] = useState(false);
  const pageLabel = useCurrentPageLabel();
  const { portalEntitled, isLoading: modulesLoading } = useParentModules();

  // Close on navigation so a back-gesture never leaves the drawer stuck open.
  useEffect(() => setMenuOpen(false), [loc.pathname]);

  // One audit row per portal session, not per navigation.
  useEffect(() => {
    if (!parent) return;
    void parentAuditService.log({ parentAccountId: parent.accountId, event: "login" });
  }, [parent?.accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record which child is being viewed — the brief's "audit … profile changes"
  // is only meaningful alongside a record of whose record was opened.
  useEffect(() => {
    if (!parent || !activeChild) return;
    void parentAuditService.log({
      parentAccountId: parent.accountId,
      event: "view_child",
      studentId: activeChild.student.id,
    });
  }, [parent?.accountId, activeChild?.student.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    if (parent) {
      await parentAuditService.log({ parentAccountId: parent.accountId, event: "logout" });
    }
    await logout();
  };

  // A provisioned parent with zero links would otherwise land on a dashboard of
  // empty cards and conclude the portal is broken. Name the actual situation.
  const noChildren = !isLoading && kids.length === 0;

  // ── The whole portal is not on this organization's plan ───────────────────
  //
  // Replaces the application rather than rendering a chrome of empty menus
  // around a notice: an institution that has not bought the portal should not
  // have one drawn for their parents, and a sidebar of fourteen unreachable
  // links is a worse answer than no sidebar. Sign-out stays, because a parent
  // who cannot leave a screen has been trapped by a billing decision.
  if (!modulesLoading && !portalEntitled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <OrgLogo className="mx-auto mb-4 h-12 w-12 rounded-xl" decorative />
          <h1 className="text-lg font-semibold text-foreground">
            The parent portal is not available
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your institution's plan does not currently include the parent portal. Please contact
            the office — they can enable it from their subscription.
          </p>
          <button
            onClick={handleLogout}
            className="mt-6 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ParentSidebarDocked
        parentName={parent?.name}
        parentEmail={parent?.email}
        onLogout={handleLogout}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* ── Header ──────────────────────────────────────────────────────
            Mobile: hamburger + current page name, with the child switcher
            beneath it. Stacking them keeps both readable on a narrow screen —
            squeezing a menu button, a page title and a child picker onto one
            line is what made the old layout feel cramped. */}
        <header className="shrink-0 border-b border-border bg-card/60 backdrop-blur">
          <div className="h-16 px-3 md:px-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                className="md:hidden p-2 -ml-1 rounded-lg hover:bg-muted/60 transition-colors"
              >
                <Menu className="w-5 h-5 text-foreground" />
              </button>

              {/* Mobile shows the page name; desktop's sidebar already
                  highlights it, so there it yields to the child switcher. */}
              <div className="md:hidden flex items-center gap-2 min-w-0">
                <OrgLogo className="w-7 h-7 rounded-lg shrink-0" decorative />
                <span className="text-sm font-semibold text-foreground truncate">{pageLabel}</span>
              </div>

              <div className="hidden md:block">
                <ChildSwitcher />
              </div>
            </div>

            <ThemeToggle variant="icon" />
          </div>

          {/* Child switcher gets its own full-width row on mobile. */}
          {kids.length > 0 && (
            <div className="md:hidden px-3 pb-2.5 -mt-1">
              <ChildSwitcher />
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {noChildren ? (
            <EmptyState
              title="No student linked to this account yet"
              hint="Your portal account is active but has not been linked to a student. Please contact the institution office — they can link your child from Staff → Authentication → Parent Accounts."
            />
          ) : (
            <ParentModuleGate>
              <Outlet />
            </ParentModuleGate>
          )}
        </main>
      </div>

      <ParentSidebarDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        parentName={parent?.name}
        parentEmail={parent?.email}
        onLogout={handleLogout}
      />
    </div>
  );
};

export const ParentShellLayout = () => (
  <ActiveChildProvider>
    <ParentRealtimeProvider>
      <Shell />
    </ParentRealtimeProvider>
  </ActiveChildProvider>
);

export default ParentShellLayout;
