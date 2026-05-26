import React, { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { RoleSidebar } from "@/shared/layouts";
import { ThemeToggle } from "@/core/theme";
import { LayoutAccessGate } from "@/features/rbac";

// ──────────────────────────────────────────────────────────────────────────────
// TeacherShellLayout — wraps every /teacher/* route.
//
// Two modes, picked from the current pathname:
//
//   1. **Standalone**: the existing teacher pages (dashboard, leave, help,
//      coming-soon) render with no sidebar so their bottom-tab UX stays
//      intact. This preserves the experience teachers already have.
//
//   2. **Shell**: any other /teacher/* route (the new shared modules:
//      Setup, etc.) renders inside the standard sidebar shell with
//      LayoutAccessGate enforcing per-pathname RBAC.
//
// This lets the registry mount Setup pages at /teacher/setup/* without
// regressing the dashboard's full-screen look.
// ──────────────────────────────────────────────────────────────────────────────

const STANDALONE_EXACT = new Set(["/teacher", "/teacher/"]);
const STANDALONE_PREFIXES = [
  "/teacher/leave",
  "/teacher/help",
  "/teacher/coming-soon",
];

const isStandalonePath = (pathname: string): boolean => {
  if (STANDALONE_EXACT.has(pathname)) return true;
  return STANDALONE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
};

export const TeacherShellLayout: React.FC = () => {
  const loc = useLocation();
  const standalone = useMemo(() => isStandalonePath(loc.pathname), [loc.pathname]);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (standalone) {
    // Pre-existing teacher pages keep their bare layout.
    return <Outlet />;
  }

  // Shared-module routes get the sidebar shell. LayoutAccessGate enforces
  // RBAC per pathname — a teacher who hasn't been granted Setup will get
  // bounced back to their home route before the page renders.
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:flex shrink-0">
        <RoleSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="md:hidden shrink-0 bg-sidebar border-b border-sidebar-border px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex flex-col items-center">
            <span className="font-display font-bold text-foreground text-sm">
              ARK Teacher
            </span>
            <span className="text-[9px] text-accent uppercase tracking-widest">
              Daily Workflow
            </span>
          </div>
          <ThemeToggle variant="icon" />
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <LayoutAccessGate>
            <Outlet />
          </LayoutAccessGate>
        </main>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 h-full overflow-hidden">
            <RoleSidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
            />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-[-40px] p-2 text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherShellLayout;
