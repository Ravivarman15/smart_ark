import React, { useState, useEffect, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { OrgLogo } from "@/features/branding/components/OrgLogo";
import { useOrganizationBranding } from "@/core/theme/OrganizationThemeProvider";
import {
  LayoutDashboard, Users, GraduationCap, ShieldCheck,
  Bell, LogOut, RotateCcw, BookOpen, ShieldAlert, CalendarDays, PhoneCall, MessageSquare, BarChart2, UserCheck,
  TrendingUp, CreditCard, Receipt, Trophy, PanelLeftClose, PanelLeftOpen,
  Shield, Settings, ClipboardList, ChevronDown, ChevronRight,
  Plus, List, Tag, Calendar,
} from "lucide-react";

// ─── Setup sub-items mirroring the screenshot ──────────────────────────────
const VISIBLE_SETUP_ITEMS = [
  { to: "/management/setup/years",        label: "Add Year",             icon: Plus },
  { to: "/management/setup/years",        label: "Manage Year",          icon: List },
  { to: "/management/setup/batches",      label: "Add Class/Batch",      icon: Plus },
  { to: "/management/setup/batches",      label: "Manage Class/Batch",   icon: List },
  { to: "/management/setup/course-types", label: "Add Course Type",      icon: Plus },
  { to: "/management/setup/course-types", label: "Manage Course Type",   icon: List },
  { to: "/management/setup/standards",    label: "Assign Standard",      icon: BookOpen },
  { to: "/management/setup/subjects",     label: "Assign Subject",       icon: ClipboardList },
  { to: "/management/timetable",          label: "Manage Time Table",    icon: Calendar },
  { to: "/management/setup/taxes",        label: "Add Tax",              icon: Plus },
  { to: "/management/setup/taxes",        label: "Manage Tax",           icon: Tag },
];

// ─── Main nav groups ────────────────────────────────────────────────────────
const navGroups = [
  {
    label: "Overview",
    items: [
      { to: "/management", icon: LayoutDashboard, label: "Executive View", end: true },
      { to: "/management/admin-checkins", icon: UserCheck, label: "Admin Check-ins" },
      { to: "/management/alerts", icon: Bell, label: "Alerts" },
      { to: "/management/compliance", icon: ShieldAlert, label: "Compliance" },
    ],
  },
  {
    label: "Staff / User",
    items: [
      { to: "/management/staff",            icon: Users,    label: "Create / Manage Staff" },
      { to: "/management/staff-rights",     icon: Shield,   label: "Staff Rights" },
      { to: "/management/staff-attendance", icon: UserCheck,label: "Staff Attendance" },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/management/teachers", icon: Trophy, label: "Teacher Ranking" },
      { to: "/management/students", icon: GraduationCap, label: "Student Intelligence" },
      { to: "/management/admin-kpi", icon: ShieldCheck, label: "Admin Performance" },
      { to: "/management/enquiries", icon: PhoneCall, label: "Enquiries" },
    ],
  },
  {
    label: "Academics",
    items: [
      { to: "/management/academic", icon: BookOpen, label: "Academic Execution" },
      { to: "/management/weekly-summary", icon: CalendarDays, label: "Weekly Summary" },
      { to: "/management/retest", icon: RotateCcw, label: "Retest Analytics" },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/management/finance", icon: TrendingUp, label: "Financial View" },
      { to: "/management/fees-management", icon: CreditCard, label: "Fees Management" },
      { to: "/management/expenses", icon: Receipt, label: "Expense & Income" },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/management/analysis", icon: BarChart2, label: "Analysis Reports" },
      { to: "/management/notifications", icon: MessageSquare, label: "Notifications" },
    ],
  },
];

const PREF_KEY = "mgmt_setup_open";

interface Props { collapsed: boolean; onToggle: () => void; onNavigate?: () => void; }

const ManagementSidebar: React.FC<Props> = ({ collapsed, onToggle, onNavigate }) => {
  // The institution this portal belongs to — was a hardcoded "ARK Intelligence".
  const { branding: orgBranding } = useOrganizationBranding();
  const orgTitle = orgBranding?.appName || orgBranding?.portalName || "Smart ARK";
  const { logout, user } = useAuth();
  const location = useLocation();

  // "null" = still loading from backend; true/false = resolved
  const [setupOpen, setSetupOpen] = useState<boolean | null>(null);

  const isOnSetupRoute = location.pathname.includes("/management/setup");

  // ── Persist to Supabase (declared first so effects can reference it) ──────
  const savePref = useCallback(async (value: boolean) => {
    if (!user?.profileId) return;
    await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("user_preferences" as any)
      .upsert(
        { user_id: user.profileId, key: PREF_KEY, value, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      );
  }, [user?.profileId]);

  // ── Load preference from Supabase on mount ──────────────────────────────
  useEffect(() => {
    if (!user?.profileId) return;
    let cancelled = false;
    supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("user_preferences" as any)
      .select("value")
      .eq("user_id", user.profileId)
      .eq("key", PREF_KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setSetupOpen((data as { value: boolean }).value === true);
        } else {
          // No stored pref yet — default open if on a setup route
          setSetupOpen(isOnSetupRoute);
        }
      });
    return () => { cancelled = true; };
  }, [user?.profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-open when navigating into a setup route ─────────────────────────
  useEffect(() => {
    if (isOnSetupRoute && setupOpen === false) {
      setSetupOpen(true);
      savePref(true);
    }
  }, [isOnSetupRoute, savePref]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSetup = () => {
    const next = !(setupOpen ?? false);
    setSetupOpen(next);
    savePref(next);
  };

  const isSetupItemActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <aside className={`h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border min-h-[60px]">
        <OrgLogo className="w-8 h-8 rounded-lg flex-shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <span className="font-display font-bold text-foreground text-sm block truncate">{orgTitle}</span>
            <span className="text-[10px] text-accent uppercase tracking-widest">Executive Portal</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
        {/* Regular nav groups */}
        {navGroups.map((group) => (
          <div key={group.label} className="mb-1">
            {!collapsed && (
              <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
                {group.label}
              </p>
            )}
            {collapsed && <div className="mx-2 my-1 h-px bg-sidebar-border/50" />}
            <div className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const isActive = item.end
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to) && !item.end;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                    }`}
                    onClick={onNavigate}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}

        {/* ── Setup accordion ───────────────────────────────────────── */}
        <div className="mb-1">
          {!collapsed && (
            <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
              Setup
            </p>
          )}
          {collapsed && <div className="mx-2 my-1 h-px bg-sidebar-border/50" />}

          <div className="px-2">
            {/* Accordion trigger */}
            <button
              onClick={toggleSetup}
              title={collapsed ? "Setup" : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all w-full ${
                isOnSetupRoute
                  ? "bg-sidebar-accent text-sidebar-primary font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
              }`}
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate flex-1 text-left">Setup</span>
                  {setupOpen
                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  }
                </>
              )}
            </button>

            {/* Accordion content — only visible when not collapsed */}
            {!collapsed && setupOpen && (
              <div className="mt-1 ml-3 border-l-2 border-sidebar-border/60 pl-2 space-y-0.5">
                {VISIBLE_SETUP_ITEMS.map((item, idx) => {
                  const isActive = isSetupItemActive(item.to);
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={`${item.to}-${item.label}`}
                      to={item.to}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-all ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary font-medium"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                      }`}
                      onClick={onNavigate}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}

            {/* Collapsed: show a single Settings icon that navigates to first setup page */}
            {collapsed && (
              <NavLink
                to="/management/setup/years"
                title="Setup"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all mt-0.5 ${
                  isOnSetupRoute
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                }`}
                onClick={onNavigate}
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
              </NavLink>
            )}

            {/* Fee Structures always in Setup */}
            {!collapsed && setupOpen && (
              <div className="ml-3 border-l-2 border-sidebar-border/60 pl-2 mt-0.5">
                <NavLink
                  to="/management/setup/fee-structures"
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-all ${
                    isSetupItemActive("/management/setup/fee-structures")
                      ? "bg-sidebar-accent text-sidebar-primary font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  }`}
                  onClick={onNavigate}
                >
                  <CreditCard className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">Fee Structures</span>
                </NavLink>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-accent">{user.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
              <p className="text-[10px] text-accent uppercase tracking-wider">Management</p>
            </div>
          </div>
        )}
        <div className="px-2 pb-3 space-y-0.5">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive w-full transition-colors"
            title={collapsed ? "Logout" : undefined}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
          <button
            onClick={onToggle}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground w-full transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4 flex-shrink-0" /> : <PanelLeftClose className="w-4 h-4 flex-shrink-0" />}
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default ManagementSidebar;
