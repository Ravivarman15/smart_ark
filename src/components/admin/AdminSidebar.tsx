import React, { useState, useEffect, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffRights, ModuleKey } from "@/contexts/StaffRightsContext";
import arkLogo from "@/assets/ark-logo.jpeg";
import {
  LayoutDashboard, Users, GraduationCap,
  LogOut, ClipboardCheck, PhoneCall, Calendar, ClipboardList, UserCheck,
  Bell, BarChart3, FileBarChart2, CreditCard, Wallet, Receipt, PanelLeftClose, PanelLeftOpen,
  CalendarRange, BookOpen, Layers, Tag, DollarSign, Shield, ShieldCheck,
  FolderOpen, ListChecks, Settings, Plus, List, ChevronDown, ChevronRight
} from "lucide-react";

const PREF_KEY = "admin_setup_open";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  actionKey?: string;
}

interface NavGroup {
  label: string;
  moduleKey: string;
  items: NavItem[];
}

// Full nav definition — filtered at render time by rights (excluding Setup which has custom accordion)
const ALL_GROUPS: NavGroup[] = [
  {
    label: "Staff / User",
    moduleKey: "staff_user",
    items: [
      { to: "/admin/staff",                 icon: Users,         label: "Staff Control",    actionKey: "staff.control" },
      { to: "/admin/teacher-checkins",      icon: UserCheck,     label: "Staff Attendance", actionKey: "staff.attendance" },
    ],
  },
  {
    label: "Enquiry / Leads",
    moduleKey: "enquiry_leads",
    items: [
      { to: "/admin/enquiries",             icon: PhoneCall,     label: "Enquiries",        actionKey: "enquiry.manage" },
    ],
  },
  {
    label: "Student",
    moduleKey: "student",
    items: [
      { to: "/admin/students",              icon: GraduationCap, label: "Student Control",  actionKey: "student.control" },
    ],
  },
  {
    label: "Operations",
    moduleKey: "operations",
    items: [
      { to: "/admin",                       icon: LayoutDashboard, label: "Daily Control",  end: true, actionKey: "ops.daily_control" },
      { to: "/admin/daily-report",          icon: ClipboardCheck,  label: "Daily Report",   actionKey: "ops.daily_report" },
      { to: "/admin/checklist",             icon: ClipboardList,   label: "Daily Checklist",actionKey: "ops.checklist" },
    ],
  },
  {
    label: "Fee",
    moduleKey: "fee",
    items: [
      { to: "/admin/fees",                  icon: CreditCard,    label: "Fee Collection",   actionKey: "fee.collection" },
      { to: "/admin/fees-management",       icon: Wallet,        label: "Manage Fees",      actionKey: "fee.manage" },
    ],
  },
  {
    label: "Expense & Income",
    moduleKey: "expense_income",
    items: [
      { to: "/admin/setup/expense-categories", icon: Tag,        label: "Expense Types",    actionKey: "expense.categories" },
      { to: "/admin/expenses",              icon: Receipt,       label: "Expense & Income", actionKey: "expense.manage" },
    ],
  },
  {
    label: "Reports",
    moduleKey: "reports",
    items: [
      { to: "/admin/analysis",              icon: BarChart3,     label: "Analysis Reports", actionKey: "reports.analysis" },
      { to: "/admin/reports",               icon: FileBarChart2, label: "Reports",          actionKey: "reports.reports" },
      { to: "/admin/notifications",         icon: Bell,          label: "Notifications",    actionKey: "reports.notifications" },
    ],
  },
];

// Setup accordion sub-items natively structured like management
const ADMIN_SETUP_ITEMS = [
  { to: "/admin/setup/years",        label: "Add Year",             icon: Plus,          actionKey: "setup.years" },
  { to: "/admin/setup/years",        label: "Manage Year",          icon: List,          actionKey: "setup.years" },
  { to: "/admin/setup/batches",      label: "Add Class/Batch",      icon: Plus,          actionKey: "setup.batches" },
  { to: "/admin/setup/batches",      label: "Manage Class/Batch",   icon: List,          actionKey: "setup.batches" },
  { to: "/admin/setup/course-types", label: "Add Course Type",      icon: Plus,          actionKey: "setup.course_types" },
  { to: "/admin/setup/course-types", label: "Manage Course Type",   icon: List,          actionKey: "setup.course_types" },
  { to: "/admin/setup/standards",    label: "Assign Standard",      icon: BookOpen,      actionKey: "setup.standards" },
  { to: "/admin/setup/subjects",     label: "Assign Subject",       icon: ClipboardList, actionKey: "setup.subjects" },
  { to: "/admin/timetable",          label: "Manage Time Table",    icon: Calendar,      actionKey: "setup.timetable" },
  { to: "/admin/setup/taxes",        label: "Add Tax",              icon: Plus,          actionKey: "setup.tax" },
  { to: "/admin/setup/taxes",        label: "Manage Tax",           icon: Tag,           actionKey: "setup.tax" },
];

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ collapsed, onToggle, onNavigate }) => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const { canViewModule, canDoAction } = useStaffRights();

  const [setupOpen, setSetupOpen] = useState<boolean | null>(null);
  const isOnSetupRoute = location.pathname.includes("/admin/setup") || location.pathname.includes("/admin/timetable");

  // ── Persist to Supabase ───────────────────────────────────────────────────
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

  // ── Load preference ───────────────────────────────────────────────────────
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
          setSetupOpen(isOnSetupRoute);
        }
      });
    return () => { cancelled = true; };
  }, [user?.profileId, isOnSetupRoute]);

  // ── Auto-open when navigating into a setup route ─────────────────────────
  useEffect(() => {
    if (isOnSetupRoute && setupOpen === false) {
      setSetupOpen(true);
      savePref(true);
    }
  }, [isOnSetupRoute, savePref, setupOpen]);

  const toggleSetup = () => {
    const next = !(setupOpen ?? false);
    setSetupOpen(next);
    savePref(next);
  };

  const isSetupItemActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + "/");

  // Filter groups and items based on rights
  const visibleGroups = ALL_GROUPS
    .filter(g => canViewModule(g.moduleKey as ModuleKey))
    .map(g => ({
      ...g,
      items: g.items.filter(item => !item.actionKey || canDoAction(item.actionKey)),
    }))
    .filter(g => g.items.length > 0);

  // Filter setup accordion items based on rights
  const visibleSetupItems = ADMIN_SETUP_ITEMS.filter(item => !item.actionKey || canDoAction(item.actionKey));
  const canViewSetupModule = canViewModule("setup" as ModuleKey);

  return (
    <aside className={`h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border min-h-[60px]">
        <img src={arkLogo} alt="ARK" className="w-8 h-8 rounded-lg flex-shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <span className="font-display font-bold text-foreground text-sm block truncate">ARK Admin</span>
            <span className="text-[10px] text-accent uppercase tracking-widest">Control Panel</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
        {visibleGroups.map((group) => (
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
                  : location.pathname.startsWith(item.to);
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
        {canViewSetupModule && visibleSetupItems.length > 0 && (
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
                  {visibleSetupItems.map((item) => {
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
                  
                  {/* Fee Structures always in Setup (only if rights allow) */}
                  {canDoAction("fee.structures") && (
                     <NavLink
                       to="/admin/setup/fee-structures"
                       className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-all ${
                         isSetupItemActive("/admin/setup/fee-structures")
                           ? "bg-sidebar-accent text-sidebar-primary font-medium"
                           : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                       }`}
                       onClick={onNavigate}
                     >
                       <CreditCard className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                       <span className="truncate">Fee Structures</span>
                     </NavLink>
                  )}
                </div>
              )}

              {/* Collapsed: show a single Settings icon that navigates to first available setup page */}
              {collapsed && (
                <NavLink
                  to={visibleSetupItems[0]?.to || "/admin/setup"}
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
            </div>
          </div>
        )}
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
              <p className="text-[10px] text-muted-foreground truncate">{user.campus}</p>
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

export default AdminSidebar;
