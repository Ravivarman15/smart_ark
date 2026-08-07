// ──────────────────────────────────────────────────────────────────────────────
// SETTINGS SHELL
//
// ┌── WHY THIS NOW RENDERS THE ROLE SIDEBAR ───────────────────────────────┐
// │ Settings used to be a STANDALONE shell: its own top bar, its own theme │
// │ toggle, its own "Back to dashboard" button, and no app navigation at   │
// │ all. Opening it felt like leaving the product — every other module     │
// │ keeps the sidebar, so Settings was the one place a user lost their     │
// │ bearings and needed a button to find the way back.                     │
// │                                                                        │
// │ It now uses exactly the chrome every role layout uses: <RoleSidebar>,  │
// │ the same mobile header, the same scroll container. The settings        │
// │ sub-navigation becomes a SECONDARY nav inside the page, which is what  │
// │ it always was conceptually.                                            │
// │                                                                        │
// │ The routes are untouched. /settings/* stays role-agnostic and mounted  │
// │ once — duplicating ten routes across four role layouts would have been │
// │ the other way to get this look, and it would have quadrupled the       │
// │ surface for a purely visual problem.                                   │
// └────────────────────────────────────────────────────────────────────────┘
//
// RoleSidebar reads the role from AuthContext rather than the URL, so it
// renders the correct navigation here even though the path is not /admin/*.
// ──────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, X, Settings as SettingsIcon } from "lucide-react";
import { RoleSidebar } from "@/shared/layouts";
import { ThemeToggle } from "@/core/theme";
import { SettingsSidebar } from "../components/SettingsSidebar";

const SettingsLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar — identical to every role layout. */}
      <div className="hidden md:flex shrink-0">
        <RoleSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile header — same pattern and same breakpoint as the role
            layouts, so the transition between modules is invisible. */}
        <div className="md:hidden shrink-0 bg-sidebar border-b border-sidebar-border px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex flex-col items-center">
            <span className="font-display font-bold text-foreground text-sm">Settings</span>
            <span className="text-[9px] text-accent uppercase tracking-widest">
              Account &amp; preferences
            </span>
          </div>
          <ThemeToggle variant="icon" />
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* Page header, in the same position and weight as other modules'
              own headings — not a separate chrome bar. */}
          <header className="mb-5 flex items-center gap-3">
            <span className="flex w-9 h-9 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0">
              <SettingsIcon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-display font-semibold text-foreground leading-tight">
                Settings
              </h1>
              <p className="text-xs text-muted-foreground">
                Account, preferences &amp; integrations
              </p>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-5">
            {/* Secondary nav. Scrolls horizontally on mobile rather than
                stacking a ten-item list above every page — the settings pages
                are short, and a full-height menu on top of each one is more
                scrolling than the content itself. */}
            <aside className="lg:sticky lg:top-0 lg:self-start min-w-0">
              <SettingsSidebar />
            </aside>
            <div className="min-w-0">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile drawer — same markup as the role layouts. */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 h-full overflow-hidden">
            <RoleSidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
            />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-[-40px] p-2 text-foreground"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsLayout;
