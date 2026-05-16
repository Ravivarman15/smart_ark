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
  "operations",
  "fee",
  "expense_income",
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
  // Student
  { key: "student.control",    module: "student",       label: "Student Control" },
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
  operations:     "Operations",
  fee:            "Fee",
  expense_income: "Expense & Income",
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
  const [fetched, setFetched] = useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const fetchRights = useCallback(async () => {
    // Management sees everything — skip fetching
    if (!user || user.role === "management") {
      setLoading(false);
      setFetched(true);
      return;
    }

    const profileId = user.profileId;
    if (!profileId) { setLoading(false); setFetched(true); return; }

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
    setFetched(true);
  }, [user]);

  useEffect(() => {
    if (user && !fetched) fetchRights();
    if (!user) {
      setModuleRights({});
      setActionRights({});
      setLoading(true);
      setFetched(false);
    }
  }, [user, fetched, fetchRights]);

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
