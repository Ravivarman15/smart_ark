// ── Parent Portal — application shell ────────────────────────────────────────
//
// Deliberately NOT RoleSidebar. That component renders NAV_CONFIG filtered by
// staff RBAC (`usePermissions` → role permissions keyed on a `profiles` row) —
// machinery a parent has no row in. Feeding a parent through it would mean
// inventing a fake staff role purely to draw a menu.
//
// The portal's navigation is instead a fixed, small, purpose-built list (see
// components/ParentSidebar). A parent's menu is not configurable by design:
// what they may see is decided by RLS, not by a menu, so there is nothing for
// an administrator to toggle.
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
import arkLogo from "@/assets/ark-logo.jpeg";
import { ActiveChildProvider, useActiveChild } from "../providers/ActiveChildProvider";
import { ParentRealtimeProvider } from "../providers/ParentRealtimeProvider";
import { ChildSwitcher } from "../components/ChildSwitcher";
import {
  PARENT_NAV,
  ParentSidebarDocked,
  ParentSidebarDrawer,
  isActivePath,
} from "../components/ParentSidebar";
import { parentAuditService } from "../services/parentAudit.service";
import { EmptyState } from "../components/primitives";

/** Page title for the mobile header — parents lose their place without it. */
const useCurrentPageLabel = (): string => {
  const loc = useLocation();
  for (const group of PARENT_NAV) {
    for (const item of group.items) {
      if (isActivePath(loc.pathname, item.to)) return item.label;
    }
  }
  return "Parent Portal";
};

/** Inner shell — needs ActiveChildProvider mounted, hence the split. */
const Shell = () => {
  const { parent, logout } = useAuth();
  const loc = useLocation();
  const { children: kids, isLoading, activeChild } = useActiveChild();
  const [menuOpen, setMenuOpen] = useState(false);
  const pageLabel = useCurrentPageLabel();

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
                <img src={arkLogo} alt="" className="w-7 h-7 rounded-lg shrink-0" />
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
            <Outlet />
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
