import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  ChevronDown,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigation, ROLE_BRAND } from "@/core/navigation";
import { useOrganizationBranding } from "@/core/theme/OrganizationThemeProvider";
import type { Role } from "@/core/constants/roles";
import { useTheme } from "@/core/theme";
import { AccessSyncIndicator } from "@/features/rbac";
import { resolveIcon } from "@/shared/icons";
import { OrgLogo } from "@/features/branding/components/OrgLogo";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  /** Called on every navigation link click (used to auto-close mobile drawer). */
  onNavigate?: () => void;
}

// localStorage key — per-role + per-group so admin's expanded modules
// don't bleed into management's saved state.
const ACCORDION_KEY = (role: string, groupKey: string) =>
  `nav:${role}:group:${groupKey}:open`;

// ──────────────────────────────────────────────────────────────────────────────
// RoleSidebar
// ──────────────────────────────────────────────────────────────────────────────
// One sidebar to serve every role. Drives entirely off `useNavigation()` →
// `menu.config.ts`. The 15-module design renders Dashboard as a flat direct
// link and the other 14 as collapsible module cards. RBAC, role gates, and
// catalog membership are resolved by the hook — the component just renders.
//
// Mini mode (collapsed=true): icons only with `title` tooltip. Clicking a
// collapsible module both expands the sidebar and opens that module's
// accordion, so the user lands inside the right group immediately.
// ──────────────────────────────────────────────────────────────────────────────
export const RoleSidebar = ({ collapsed, onToggle, onNavigate }: Props) => {
  const { user, logout } = useAuth();
  const { themeDef, toggleTheme } = useTheme();
  const groups = useNavigation();
  const location = useLocation();
  const role = user?.role as Role | undefined;
  const brand = role ? ROLE_BRAND[role] : null;
  // The institution this portal belongs to. Was a hardcoded "ARK Intelligence",
  // shown to every tenant's staff on every screen.
  const { branding: orgBranding } = useOrganizationBranding();
  const orgTitle = orgBranding?.appName || orgBranding?.portalName || "Smart ARK";

  // Accordion open-state map, per group key.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  // Hydrate from localStorage on first load (or fall back to "open if on a
  // child route"). Re-running on every pathname change would clobber user
  // toggles, so we only key off role + group count.
  useEffect(() => {
    if (!role) return;
    const next: Record<string, boolean> = {};
    for (const g of groups) {
      if (!g.collapsible) continue;
      const stored = localStorage.getItem(ACCORDION_KEY(role, g.key));
      if (stored !== null) {
        next[g.key] = stored === "true";
      } else {
        next[g.key] = g.items.some((it) => location.pathname.startsWith(it.path));
      }
    }
    setOpenMap(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, groups.length]);

  // Auto-open the parent group when the active route lives inside it.
  useEffect(() => {
    if (!role) return;
    for (const g of groups) {
      if (!g.collapsible) continue;
      const onChild = g.items.some((it) => location.pathname.startsWith(it.path));
      if (onChild && !openMap[g.key]) {
        setOpenMap((m) => ({ ...m, [g.key]: true }));
        localStorage.setItem(ACCORDION_KEY(role, g.key), "true");
      }
    }
  }, [location.pathname, groups, role, openMap]);

  const toggleGroup = useCallback(
    (groupKey: string, force?: boolean) => {
      if (!role) return;
      setOpenMap((m) => {
        const next = force ?? !m[groupKey];
        localStorage.setItem(ACCORDION_KEY(role, groupKey), String(next));
        return { ...m, [groupKey]: next };
      });
    },
    [role]
  );

  // Active-route helper. Direct links match exactly; submodule items match
  // by prefix so /admin/setup/years stays active on tab swaps inside the page.
  const isActive = useMemo(
    () =>
      (path: string, isHome?: boolean) =>
        isHome ? location.pathname === path : location.pathname.startsWith(path),
    [location.pathname]
  );

  // Mini-mode click on a collapsible module: expand the sidebar AND open
  // the group, so the user sees their items immediately.
  const handleMiniModuleClick = useCallback(
    (groupKey: string) => {
      onToggle();
      toggleGroup(groupKey, true);
    },
    [onToggle, toggleGroup]
  );

  return (
    <aside
      className={`h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-[width] duration-300 ease-out ${
        collapsed ? "w-16" : "w-64"
      }`}
      aria-label="Primary navigation"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border min-h-[60px]">
        <OrgLogo className="w-8 h-8 rounded-lg flex-shrink-0" />
        {!collapsed && brand && (
          <div className="min-w-0">
            <span className="font-display font-bold text-foreground text-sm block truncate">
              {orgTitle}
            </span>
            <span className="text-[10px] text-accent uppercase tracking-widest">
              {brand.subtitle}
            </span>
          </div>
        )}
      </div>

      {/* Navigation tree */}
      <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
        {groups.map((group) => {
          const isCollapsible = !!group.collapsible;
          const open = openMap[group.key] ?? !isCollapsible;
          const ModuleIcon = resolveIcon(group.icon);
          const groupActive = group.items.some((it) => isActive(it.path, it.isHome));

          // ── Direct module (e.g. Dashboard) ─────────────────────────────────
          // Renders each item as a full row with its own icon.
          if (!isCollapsible) {
            return (
              <div key={group.key} className="mb-1 px-2">
                {group.items.map((item) => {
                  const Icon = resolveIcon(item.icon);
                  const active = isActive(item.path, item.isHome);
                  return (
                    <NavLink
                      key={`${group.key}-${item.path}`}
                      to={item.path}
                      end={item.isHome}
                      title={collapsed ? item.label : undefined}
                      onClick={onNavigate}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-sidebar-accent text-sidebar-primary font-medium"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            );
          }

          // ── Collapsible module card ─────────────────────────────────────────
          // Mini mode: render as a single icon button. Clicking expands the
          // whole sidebar and opens the module so children show immediately.
          if (collapsed) {
            return (
              <div key={group.key} className="mb-0.5 px-2">
                <button
                  onClick={() => handleMiniModuleClick(group.key)}
                  title={group.label}
                  aria-label={group.label}
                  className={`flex items-center justify-center w-full p-2 rounded-lg transition-colors ${
                    groupActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  }`}
                >
                  <ModuleIcon className="w-4 h-4" />
                </button>
              </div>
            );
          }

          // Expanded: module-row header + accordion children using the
          // grid-rows-[0fr|1fr] trick for smooth height animation without
          // measuring the DOM.
          return (
            <div key={group.key} className="mb-0.5 px-2">
              <button
                onClick={() => toggleGroup(group.key)}
                aria-expanded={open}
                aria-controls={`nav-group-${group.key}`}
                className={`group/header w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  groupActive
                    ? "bg-sidebar-accent/70 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                }`}
              >
                <ModuleIcon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate flex-1 text-left">{group.label}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
                    open ? "rotate-0" : "-rotate-90"
                  }`}
                  aria-hidden
                />
              </button>

              <div
                id={`nav-group-${group.key}`}
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <ul className="mt-0.5 mb-1 pl-3 border-l border-sidebar-border/60 ml-4 space-y-px">
                    {group.items.map((item) => {
                      const active = isActive(item.path, item.isHome);
                      return (
                        <li key={`${group.key}-${item.path}-${item.label}`}>
                          <NavLink
                            to={item.path}
                            end={item.isHome}
                            onClick={onNavigate}
                            className={`block pl-3 pr-2 py-1.5 rounded-md text-[13px] transition-colors ${
                              active
                                ? "bg-sidebar-accent text-sidebar-primary font-medium"
                                : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground"
                            }`}
                          >
                            <span className="truncate block">{item.label}</span>
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}

        {groups.length === 0 && !collapsed && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            No accessible modules. Contact your administrator.
          </p>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-accent">
                {user.name?.[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {user.campus ?? user.role}
              </p>
            </div>
          </div>
        )}
        {/* RBAC propagation indicator — surfaces when permissions are
            refetching cross-tab, so users see why the sidebar just shifted. */}
        {!collapsed && (
          <div className="px-3 pb-2 flex justify-end">
            <AccessSyncIndicator />
          </div>
        )}
        {collapsed && (
          <div className="px-2 pb-2 flex justify-center">
            <AccessSyncIndicator variant="compact" />
          </div>
        )}
        <div className="px-2 pb-3 space-y-0.5">
          <button
            onClick={toggleTheme}
            title={collapsed ? `Theme: ${themeDef.label}` : undefined}
            aria-label={`Switch theme — current ${themeDef.label}`}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground w-full transition-colors"
          >
            {themeDef.mode === "dark" ? (
              <Sun className="w-4 h-4 flex-shrink-0" />
            ) : (
              <Moon className="w-4 h-4 flex-shrink-0" />
            )}
            {!collapsed && (
              <span className="flex-1 text-left">
                {themeDef.mode === "dark" ? "Light theme" : "Dark theme"}
              </span>
            )}
          </button>
          <button
            onClick={logout}
            title={collapsed ? "Logout" : undefined}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive w-full transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
          <button
            onClick={onToggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground w-full transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4 flex-shrink-0" />
            ) : (
              <PanelLeftClose className="w-4 h-4 flex-shrink-0" />
            )}
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default RoleSidebar;
