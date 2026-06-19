import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── Module keys ────────────────────────────────────────────────────────────────
// Each key maps to a top-level sidebar section.
// management role bypasses all checks (always sees everything).
export const MODULE_KEYS = [
  "setup",
  "staff_user",
  "enquiry_leads",
  "student",
  "attendance",
  "tasks",
  "operations",
  "fee",
  "expense_income",
  "payroll",
  "authentication",
  "reports",
] as const;

export type ModuleKey = typeof MODULE_KEYS[number];

// ── Action keys ────────────────────────────────────────────────────────────────
// Each key maps to a specific nav item within a module.
export const ACTION_DEFS: { key: string; module: ModuleKey; label: string }[] = [
  // Setup
  { key: "setup.years",        module: "setup",         label: "Academic Years" },
  { key: "setup.standards",    module: "setup",         label: "Assign Standard" },
  { key: "setup.subjects",     module: "setup",         label: "Assign Subject" },
  { key: "setup.course_types", module: "setup",         label: "Course Types" },
  { key: "setup.batches",      module: "setup",         label: "Class / Batch" },
  { key: "setup.timetable",    module: "setup",         label: "Manage Timetable" },
  { key: "setup.tax",          module: "setup",         label: "Tax" },
  // Staff / User
  { key: "staff.control",      module: "staff_user",    label: "Staff Control" },
  { key: "staff.rights",       module: "staff_user",    label: "Staff Rights" },
  { key: "staff.action_rights",module: "staff_user",    label: "Action Rights" },
  { key: "staff.attendance",   module: "staff_user",    label: "Staff Attendance" },
  // Enquiry
  { key: "enquiry.manage",     module: "enquiry_leads", label: "Enquiries" },
  { key: "bulk_import.view",   module: "enquiry_leads", label: "Bulk Lead Import" },
  // Student
  { key: "student.control",    module: "student",       label: "Student Control" },
  // Attendance (enterprise module)
  { key: "attendance.dashboard",      module: "attendance", label: "Attendance Dashboard" },
  { key: "attendance.student.mark",   module: "attendance", label: "Mark Student Attendance" },
  { key: "attendance.student.edit",   module: "attendance", label: "Edit Student Attendance" },
  { key: "attendance.student.import", module: "attendance", label: "Import Student Attendance" },
  { key: "attendance.student.export", module: "attendance", label: "Export Student Attendance" },
  { key: "attendance.staff.mark",     module: "attendance", label: "Mark Staff Attendance" },
  { key: "attendance.staff.edit",     module: "attendance", label: "Edit Staff Attendance" },
  { key: "attendance.staff.import",   module: "attendance", label: "Import Staff Attendance" },
  { key: "attendance.staff.export",   module: "attendance", label: "Export Staff Attendance" },
  { key: "attendance.analytics",      module: "attendance", label: "Attendance Analytics" },
  { key: "attendance.reports",        module: "attendance", label: "Attendance Reports" },
  { key: "attendance.settings",       module: "attendance", label: "Attendance Settings" },
  // Attendance — governance & automation (Phase 5)
  { key: "attendance.lock",           module: "attendance", label: "Lock Attendance" },
  { key: "attendance.unlock",         module: "attendance", label: "Unlock Attendance" },
  { key: "attendance.close",          module: "attendance", label: "Close Month" },
  { key: "attendance.reopen",         module: "attendance", label: "Reopen Month" },
  { key: "attendance.approve",        module: "attendance", label: "Approve Requests" },
  { key: "attendance.reject",         module: "attendance", label: "Reject Requests" },
  { key: "attendance.audit",          module: "attendance", label: "Attendance Audit Center" },
  { key: "attendance.automation",     module: "attendance", label: "Attendance Automation" },
  { key: "attendance.compliance",     module: "attendance", label: "Attendance Compliance" },
  { key: "attendance.health",         module: "attendance", label: "Attendance Health" },
  // Tasks
  { key: "tasks.create",        module: "tasks", label: "Create Task" },
  { key: "tasks.edit",          module: "tasks", label: "Edit Task" },
  { key: "tasks.delete",        module: "tasks", label: "Delete Task" },
  { key: "tasks.assign",        module: "tasks", label: "Assign Task" },
  { key: "tasks.status_change", module: "tasks", label: "Change Task Status" },
  { key: "tasks.comment",       module: "tasks", label: "Comment On Tasks" },
  { key: "tasks.attach",        module: "tasks", label: "Add Task Attachments" },
  { key: "tasks.view_all",      module: "tasks", label: "View All Tasks" },
  { key: "tasks.view_assigned", module: "tasks", label: "View Assigned Tasks" },
  // Operations
  { key: "ops.daily_control",  module: "operations",    label: "Daily Control" },
  { key: "ops.daily_report",   module: "operations",    label: "Daily Report" },
  { key: "ops.checklist",      module: "operations",    label: "Daily Checklist" },
  { key: "ops.checkins",       module: "operations",    label: "Teacher Check-ins" },
  // Fee
  { key: "fee.structures",     module: "fee",           label: "Fee Structures" },
  { key: "fee.collection",     module: "fee",           label: "Fee Collection" },
  { key: "fee.manage",         module: "fee",           label: "Manage Fees" },
  // Expense & Income
  { key: "expense.categories", module: "expense_income",label: "Expense Types" },
  { key: "expense.manage",     module: "expense_income",label: "Expense & Income" },
  // Payroll
  { key: "payroll.dashboard",        module: "payroll", label: "Payroll Dashboard" },
  { key: "payroll.salary_configure", module: "payroll", label: "Salary Configuration" },
  { key: "payroll.create",           module: "payroll", label: "Generate Payroll" },
  { key: "payroll.approve",          module: "payroll", label: "Approve Payroll" },
  { key: "payroll.process",          module: "payroll", label: "Process Payments" },
  { key: "payroll.salary_view_all",  module: "payroll", label: "View All Salaries" },
  { key: "payroll.salary_view_self", module: "payroll", label: "View Own Salary" },
  { key: "payroll.analytics",        module: "payroll", label: "Payroll Analytics" },
  { key: "payroll.reports",          module: "payroll", label: "Payroll Reports" },
  { key: "payroll.export",           module: "payroll", label: "Export Payroll" },
  { key: "payroll.audit",            module: "payroll", label: "Payroll Audit" },
  { key: "payroll.settings",         module: "payroll", label: "Payroll Settings" },
  // Reports
  { key: "reports.analysis",   module: "reports",       label: "Analysis Reports" },
  { key: "reports.reports",    module: "reports",       label: "Reports" },
  { key: "reports.notifications", module: "reports",    label: "Notifications" },
];

// ── Module display labels ──────────────────────────────────────────────────────
export const MODULE_LABELS: Record<ModuleKey, string> = {
  setup:          "Setup",
  staff_user:     "Staff / User",
  enquiry_leads:  "Enquiry / Leads",
  student:        "Student",
  attendance:     "Attendance",
  tasks:          "Tasks",
  operations:     "Operations",
  fee:            "Fee",
  expense_income: "Expense & Income",
  payroll:        "Payroll",
  authentication: "Authentication",
  reports:        "Reports",
};

// ── Context ────────────────────────────────────────────────────────────────────
interface StaffRightsContextType {
  /** Returns true if the current user can see the given module section */
  canViewModule: (key: ModuleKey) => boolean;
  /** Returns true if the current user can perform / see the given action */
  canDoAction: (key: string) => boolean;
  /** Raw module rights map: module_name → can_view */
  moduleRights: Record<string, boolean>;
  /** Raw action rights map: action_key → is_allowed */
  actionRights: Record<string, boolean>;
  loading: boolean;
  /** Re-fetch rights (call after management saves new rights) */
  refresh: () => void;
}

const StaffRightsContext = createContext<StaffRightsContextType>({
  canViewModule: () => true,
  canDoAction: () => true,
  moduleRights: {},
  actionRights: {},
  loading: false,
  refresh: () => {},
});

export const useStaffRights = () => useContext(StaffRightsContext);

export const StaffRightsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [moduleRights, setModuleRights] = useState<Record<string, boolean>>({});
  const [actionRights, setActionRights] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const abortRef = React.useRef<AbortController | null>(null);

  const fetchRights = useCallback(async () => {
    // Management sees everything — skip fetching
    if (!user || user.role === "management") {
      setModuleRights({});
      setActionRights({});
      setLoading(false);
      return;
    }

    const profileId = user.profileId;
    if (!profileId) {
      setModuleRights({});
      setActionRights({});
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    const [{ data: mods }, { data: actions }] = await Promise.all([
      supabase.from("staff_rights").select("module_name, can_view").eq("profile_id", profileId),
      supabase.from("staff_action_rights").select("action_key, is_allowed").eq("profile_id", profileId),
    ]);

    if (abortRef.current.signal.aborted) return;

    // If no rights are configured yet → default to showing everything
    const hasAnyModuleRights = mods && mods.length > 0;
    const modMap: Record<string, boolean> = {};
    if (hasAnyModuleRights) {
      (mods || []).forEach((r: any) => { modMap[r.module_name] = r.can_view; });
      // Modules not explicitly listed → default to visible
      MODULE_KEYS.forEach(k => { if (modMap[k] === undefined) modMap[k] = true; });
    }
    // else: empty map → canViewModule returns true (default allow)

    const hasAnyActionRights = actions && actions.length > 0;
    const actionMap: Record<string, boolean> = {};
    if (hasAnyActionRights) {
      (actions || []).forEach((r: any) => { actionMap[r.action_key] = r.is_allowed; });
      // Actions not explicitly listed → default to allowed
      ACTION_DEFS.forEach(a => { if (actionMap[a.key] === undefined) actionMap[a.key] = true; });
    }
    // else: empty map → canDoAction returns true (default allow)

    setModuleRights(modMap);
    setActionRights(actionMap);
    setLoading(false);
  }, [user]);

  // Re-fetch whenever the affected profile or its role changes. Previously a
  // `fetched` boolean latched after the first run; this prevented live
  // permission updates from propagating until the user logged out and back in.
  // The RbacRealtimeProvider also calls `refresh()` whenever the user's
  // staff_rights / staff_action_rights / profiles row changes upstream.
  useEffect(() => {
    if (!user) {
      setModuleRights({});
      setActionRights({});
      setLoading(true);
      return;
    }
    fetchRights();
  }, [user, user?.profileId, user?.role, fetchRights]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const canViewModule = useCallback((key: ModuleKey): boolean => {
    if (loading) return false;
    if (!user || user.role === "management") return true;
    // If no rights have been configured yet → show everything
    if (Object.keys(moduleRights).length === 0) return true;
    return moduleRights[key] !== false;
  }, [loading, user, moduleRights]);

  const canDoAction = useCallback((key: string): boolean => {
    if (loading) return false;
    if (!user || user.role === "management") return true;
    if (Object.keys(actionRights).length === 0) return true;
    return actionRights[key] !== false;
  }, [loading, user, actionRights]);

  return (
    <StaffRightsContext.Provider value={{
      canViewModule,
      canDoAction,
      moduleRights,
      actionRights,
      loading,
      refresh: fetchRights,
    }}>
      {children}
    </StaffRightsContext.Provider>
  );
};

export default StaffRightsContext;
