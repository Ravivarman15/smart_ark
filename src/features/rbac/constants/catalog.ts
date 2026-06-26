// ──────────────────────────────────────────────────────────────────────────────
// RBAC MODULE CATALOG
// ──────────────────────────────────────────────────────────────────────────────
// The complete list of modules + submodules the RBAC system can grant or
// revoke. This is the **catalog** — the union of every feature the product
// can expose — not "what's wired up today". Submodules without a `route` or
// `legacyAction` are aspirational features the UI doesn't render yet; they
// stay in the catalog so management can pre-configure permissions and so the
// surface evolves predictably.
//
// Why TypeScript and not a DB table:
//   - Adding a module shouldn't require a migration.
//   - The catalog is read everywhere (permission matrix, sidebar resolver,
//     widget gates) — a single typed constant gives us autocomplete and
//     compile-time safety.
//   - Per-deployment overrides go in `rbac_role_permissions` and
//     `rbac_user_permission_overrides`, not here.
//
// `legacyAction` maps a submodule to the existing `ACTION_DEFS` key in
// `StaffRightsContext`. When set, the legacy `staff_action_rights` table is
// consulted as a fallback, preserving every check that was wired up before
// this feature shipped.
// ──────────────────────────────────────────────────────────────────────────────

import type { Role } from "@/core/constants/roles";

export type ModuleId =
  | "settings"
  | "setup"
  | "staff_user"
  | "enquiry_leads"
  | "student"
  | "attendance"
  | "tasks"
  | "live_class"
  | "fee"
  | "exam"
  | "estudy"
  | "certificate"
  | "whatsapp"
  | "authentication"
  | "expense_income"
  | "payroll"
  | "reports"
  | "help";

export interface SubmoduleDef {
  /** Stable id, namespaced under the module. e.g. "settings.change_password". */
  id: string;
  label: string;
  /** App route, if one exists. Empty for catalog-only items. */
  route?: string;
  /** Legacy `ACTION_DEFS` key — kept for backward-compat reads. */
  legacyAction?: string;
}

export interface ModuleDef {
  id: ModuleId;
  label: string;
  icon: string;
  /** Roles that *may* see this module by default. Permission rows can override. */
  defaultRoles: Role[];
  submodules: SubmoduleDef[];
}

const all: Role[] = ["admin", "coordinator", "management", "teacher"];
const mgmtAdmin: Role[] = ["management", "admin"];
const mgmt: Role[] = ["management"];

export const MODULE_CATALOG: ModuleDef[] = [
  {
    id: "settings",
    label: "Settings",
    icon: "Settings",
    defaultRoles: all,
    submodules: [
      { id: "settings.change_password", label: "Change Password" },
      { id: "settings.profile", label: "Profile Setting" },
      { id: "settings.auto_sms", label: "Auto SMS Settings" },
      { id: "settings.auto_notifications", label: "Auto Notifications Settings" },
      { id: "settings.auto_whatsapp", label: "Auto WhatsApp Settings" },
      { id: "settings.my_plan", label: "My Plan" },
      { id: "settings.sms_plan", label: "SMS Plan" },
      { id: "settings.my_referral", label: "My Referral" },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    icon: "ListChecks",
    defaultRoles: mgmtAdmin,
    submodules: [
      { id: "setup.add_year",        label: "Add Year" },
      { id: "setup.manage_year",     label: "Manage Year",       route: "/admin/setup/years",         legacyAction: "setup.years" },
      { id: "setup.assign_standard", label: "Assign Standard",   route: "/admin/setup/standards",     legacyAction: "setup.standards" },
      { id: "setup.assign_subject",  label: "Assign Subject",    route: "/admin/setup/subjects",      legacyAction: "setup.subjects" },
      { id: "setup.add_course_type", label: "Add Course Type" },
      { id: "setup.manage_course_type", label: "Manage Course Type", route: "/admin/setup/course-types", legacyAction: "setup.course_types" },
      { id: "setup.add_batch",       label: "Add Class / Batch" },
      { id: "setup.manage_batch",    label: "Manage Class / Batch", route: "/admin/setup/batches",    legacyAction: "setup.batches" },
      { id: "setup.timetable",       label: "Manage Time Table", route: "/admin/timetable",           legacyAction: "setup.timetable" },
      { id: "setup.add_tax",         label: "Add Tax" },
      { id: "setup.manage_tax",      label: "Manage Tax",        route: "/admin/setup/taxes",         legacyAction: "setup.tax" },
    ],
  },
  {
    id: "staff_user",
    label: "Staff / User",
    icon: "Users",
    defaultRoles: mgmtAdmin,
    submodules: [
      { id: "staff.create",          label: "Create Staff",          route: "/admin/staff-manage",       legacyAction: "staff.control" },
      { id: "staff.manage",          label: "Manage Staff",          route: "/admin/staff-manage",       legacyAction: "staff.control" },
      { id: "staff.rights",          label: "Manage Staff Rights",   route: "/management/permissions",   legacyAction: "staff.rights" },
      { id: "staff.action_rights",   label: "Manage Staff Action Rights", legacyAction: "staff.action_rights" },
      { id: "staff.attendance",      label: "Staff Attendance",      route: "/admin/teacher-checkins",   legacyAction: "staff.attendance" },
    ],
  },
  {
    id: "enquiry_leads",
    label: "Enquiry / Leads",
    icon: "PhoneCall",
    defaultRoles: ["admin", "coordinator", "management"],
    submodules: [
      { id: "enquiry.add",    label: "Add Student Enquiry",    route: "/admin/enquiries",  legacyAction: "enquiry.manage" },
      { id: "enquiry.assign", label: "Assign Enquiry",         route: "/admin/enquiries",  legacyAction: "enquiry.manage" },
      { id: "enquiry.manage", label: "Manage Enquiry",         route: "/admin/enquiries",  legacyAction: "enquiry.manage" },
      // ── Lead CRM (routes wired with the pages in a later phase) ───────────
      { id: "lead.counselor_board", label: "My Leads (Counselor Board)" },
      { id: "lead.pipeline",        label: "Lead Pipeline" },
      { id: "lead.management",      label: "Lead Management Dashboard" },
      { id: "lead.demos",           label: "Demo Classes" },
      { id: "lead.admissions",      label: "Lead Admissions" },
      { id: "lead.analytics",       label: "Lead Analytics" },
      { id: "lead.whatsapp",        label: "WhatsApp Delivery Dashboard" },
      { id: "lead.config",          label: "Lead Automation Config" },
      { id: "lead.bulk_import",     label: "Bulk Import",          route: "/admin/leads/bulk-import" },
    ],
  },
  {
    id: "student",
    label: "Student",
    icon: "GraduationCap",
    defaultRoles: mgmtAdmin,
    submodules: [
      { id: "student.import",        label: "Students Import" },
      { id: "student.add",           label: "Add Student Registration", route: "/admin/students",  legacyAction: "student.control" },
      { id: "student.manage",        label: "Manage Student",           route: "/admin/students",  legacyAction: "student.control" },
      { id: "student.assign_batch",  label: "Assign Class / Batch" },
      { id: "student.attendance",    label: "Student Attendance" },
      { id: "student.share_docs",    label: "Share Documents" },
      { id: "student.manage_shared_docs", label: "Manage Shared Documents" },
      { id: "student.leave_request", label: "Manage Leave Request" },
      { id: "student.year_transfer", label: "Student Year Transfer" },
      { id: "student.untransfer",    label: "Student Untransfer" },
      { id: "student.chat",          label: "Chat With Students" },
      { id: "student.feedback",      label: "Student Feedback" },
      { id: "student.rights",        label: "Student Rights" },
      { id: "student.app_access",    label: "App. Access Rights" },
      { id: "student.attendance_history", label: "Attendance History" },
    ],
  },
  {
    id: "attendance",
    label: "Attendance",
    icon: "UserCheck",
    defaultRoles: all,
    submodules: [
      { id: "attendance.dashboard",          label: "Attendance Dashboard",        route: "/admin/attendance/dashboard" },
      { id: "attendance.student_mark",       label: "Mark Student Attendance",     route: "/admin/attendance/students/mark" },
      { id: "attendance.student_register",   label: "Student Attendance Register", route: "/admin/attendance/students/register" },
      { id: "attendance.student_backdated",  label: "Backdated Attendance",        route: "/admin/attendance/students/backdated" },
      { id: "attendance.student_corrections",label: "Attendance Corrections",      route: "/admin/attendance/students/corrections" },
      { id: "attendance.student_import",     label: "Import Student Attendance",   route: "/admin/attendance/students/import" },
      { id: "attendance.staff_manual",       label: "Staff Manual Attendance",     route: "/admin/attendance/staff/manual" },
      { id: "attendance.staff_checkin",      label: "Check In / Check Out",        route: "/admin/attendance/staff/check-in" },
      { id: "attendance.staff_hours",        label: "Work Hours Dashboard",        route: "/admin/attendance/staff/work-hours" },
      { id: "attendance.staff_register",     label: "Staff Attendance Register",   route: "/admin/attendance/staff/register" },
      { id: "attendance.staff_corrections",  label: "Staff Corrections",           route: "/admin/attendance/staff/corrections" },
      { id: "attendance.staff_import",       label: "Import Staff Attendance",     route: "/admin/attendance/staff/import" },
      { id: "attendance.analytics_students", label: "Student Analytics",           route: "/admin/attendance/analytics/students" },
      { id: "attendance.analytics_staff",    label: "Staff Analytics",             route: "/admin/attendance/analytics/staff" },
      { id: "attendance.analytics_trends",   label: "Attendance Trends",           route: "/admin/attendance/analytics/trends" },
      { id: "attendance.analytics_risk",     label: "Risk Analysis",               route: "/admin/attendance/analytics/risk" },
      { id: "attendance.analytics_hours",    label: "Work Hours Analytics",        route: "/admin/attendance/analytics/work-hours" },
      { id: "attendance.reports",            label: "Attendance Reports",          route: "/admin/attendance/reports" },
      { id: "attendance.gov_compliance",     label: "Compliance Dashboard",        route: "/admin/attendance/governance/compliance" },
      { id: "attendance.gov_locks",          label: "Lock Periods",                route: "/admin/attendance/governance/locks" },
      { id: "attendance.gov_closing",        label: "Monthly Closing",             route: "/admin/attendance/governance/closing" },
      { id: "attendance.gov_reopen",         label: "Reopen Requests",             route: "/admin/attendance/governance/reopen" },
      { id: "attendance.gov_approvals",      label: "Approval Queue",              route: "/admin/attendance/governance/approvals" },
      { id: "attendance.gov_audit",          label: "Audit Center",                route: "/admin/attendance/governance/audit" },
      { id: "attendance.gov_health",         label: "Attendance Health",           route: "/admin/attendance/governance/health" },
      { id: "attendance.auto_center",        label: "Automation Center",           route: "/admin/attendance/automation" },
      { id: "attendance.auto_students",      label: "Attendance Alerts",           route: "/admin/attendance/automation/students" },
      { id: "attendance.auto_staff",         label: "Staff Alerts",                route: "/admin/attendance/automation/staff" },
      { id: "attendance.settings",           label: "Attendance Settings",         route: "/admin/attendance/settings" },
    ],
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "ListTodo",
    defaultRoles: all,
    submodules: [
      { id: "tasks.dashboard", label: "Task Dashboard", route: "/admin/tasks/dashboard" },
      { id: "tasks.my",        label: "My Tasks",        route: "/admin/tasks/my" },
      { id: "tasks.team",      label: "Team Tasks",      route: "/admin/tasks/team" },
      { id: "tasks.board",     label: "Kanban Board",    route: "/admin/tasks/board" },
      { id: "tasks.workload",  label: "Team Workload",   route: "/admin/tasks/workload" },
      // Future-ready (catalog only — no Phase-1 route/UI). Pre-configurable so
      // permissions exist before Phase 2/3 ships the surfaces.
      { id: "tasks.analytics", label: "Task Analytics" },
      { id: "tasks.reports",   label: "Task Reports" },
      { id: "tasks.templates", label: "Task Templates" },
      { id: "tasks.settings",  label: "Task Settings" },
    ],
  },
  {
    id: "live_class",
    label: "Live Class",
    icon: "BookOpen",
    defaultRoles: ["admin", "coordinator", "management", "teacher"],
    submodules: [
      { id: "live.add",    label: "Add Class" },
      { id: "live.manage", label: "Manage Class" },
      { id: "live.my",     label: "My Class" },
    ],
  },
  {
    id: "fee",
    label: "Fee",
    icon: "Wallet",
    defaultRoles: mgmtAdmin,
    submodules: [
      { id: "fee.create_structure", label: "Create Fee Structure" },
      { id: "fee.manage_structure", label: "Manage Fee Structure", route: "/admin/setup/fee-structures", legacyAction: "fee.structures" },
      { id: "fee.collection",       label: "Fee Collection",        route: "/admin/fees",                 legacyAction: "fee.collection" },
      { id: "fee.manage",           label: "Manage Fees",           route: "/admin/fees-management",      legacyAction: "fee.manage" },
    ],
  },
  {
    id: "exam",
    label: "Exam",
    icon: "ClipboardCheck",
    defaultRoles: ["admin", "coordinator", "management", "teacher"],
    submodules: [
      { id: "exam.create_manual",   label: "Create Manual Exam" },
      { id: "exam.manage_manual",   label: "Manage Manual Exam" },
      { id: "exam.create_mcq_paper", label: "Create MCQ Paper" },
      { id: "exam.manage_mcq_paper", label: "Manage MCQ Paper" },
      { id: "exam.create_mcq_exam", label: "Create MCQ Exam" },
      { id: "exam.manage_mcq_exam", label: "Manage MCQ Exam" },
    ],
  },
  {
    id: "estudy",
    label: "eStudy",
    icon: "BookOpen",
    defaultRoles: ["admin", "coordinator", "management", "teacher"],
    submodules: [
      { id: "estudy.create",  label: "Create Study Material" },
      { id: "estudy.manage",  label: "Manage Study Material" },
      { id: "estudy.shared",  label: "Manage Shared Study Material" },
    ],
  },
  {
    id: "certificate",
    label: "Certificate",
    icon: "ShieldCheck",
    defaultRoles: mgmtAdmin,
    submodules: [
      { id: "certificate.add",    label: "Add Certificate" },
      { id: "certificate.manage", label: "Manage Certificate" },
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp SMS",
    icon: "Bell",
    defaultRoles: mgmtAdmin,
    submodules: [
      { id: "whatsapp.send_inquiry",    label: "Send SMS To Inquiry" },
      { id: "whatsapp.send_student",    label: "Send SMS To Student" },
      { id: "whatsapp.send_staff",      label: "Send SMS To Staff" },
      { id: "whatsapp.send_staff_creds",   label: "Send Staff ID / Password" },
      { id: "whatsapp.send_student_creds", label: "Send Student ID / Password" },
      { id: "whatsapp.send_upcoming_exam", label: "Send Upcoming Exam SMS" },
      { id: "whatsapp.send_exam_marks",    label: "Send Exam Marks SMS" },
      { id: "whatsapp.send_fee_status",    label: "Send Fee Status SMS" },
      { id: "whatsapp.send_fee_due",       label: "Send Fee Due Reminder SMS" },
      { id: "whatsapp.send_absent",        label: "Send Today Absent Attendance SMS" },
      { id: "whatsapp.send_birthday",      label: "Send Student Birthday SMS" },
      { id: "whatsapp.credential_health",  label: "Credential Health" },
      { id: "whatsapp.deployment_manager", label: "Deployment Manager" },
    ],
  },
  {
    id: "authentication",
    label: "Authentication",
    icon: "ShieldCheck",
    defaultRoles: mgmtAdmin,
    submodules: [
      { id: "authentication.account_health",  label: "Account Health" },
      { id: "authentication.student_accounts", label: "Student Accounts" },
      { id: "authentication.parent_accounts",  label: "Parent Accounts" },
      { id: "authentication.credential_repair", label: "Credential Repair" },
      { id: "authentication.login_audit",      label: "Login Audit" },
    ],
  },
  {
    id: "expense_income",
    label: "Expense & Income",
    icon: "Receipt",
    defaultRoles: mgmtAdmin,
    submodules: [
      { id: "expense.add_type",     label: "Add Expense Type" },
      { id: "expense.manage_type",  label: "Manage Expense Type", route: "/admin/setup/expense-categories", legacyAction: "expense.categories" },
      { id: "expense.add",          label: "Add Expense",         route: "/admin/expenses",                 legacyAction: "expense.manage" },
      { id: "expense.manage",       label: "Manage Expense",      route: "/admin/expenses",                 legacyAction: "expense.manage" },
      { id: "income.add_type",      label: "Add Income Type" },
      { id: "income.manage_type",   label: "Manage Income Type" },
      { id: "income.add",           label: "Add Income",          route: "/admin/expenses",                 legacyAction: "expense.manage" },
      { id: "income.manage",        label: "Manage Income",       route: "/admin/expenses",                 legacyAction: "expense.manage" },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    icon: "Wallet",
    defaultRoles: mgmtAdmin,
    submodules: [
      { id: "payroll.dashboard",   label: "Payroll Dashboard", route: "/admin/payroll/dashboard",          legacyAction: "payroll.dashboard" },
      { id: "payroll.approval",    label: "Approval Center",   route: "/admin/payroll/approval",           legacyAction: "payroll.approve" },
      { id: "payroll.role_rates",  label: "Role Wise Salary",  route: "/admin/payroll/config/role-rates",  legacyAction: "payroll.salary_configure" },
      { id: "payroll.staff_rates", label: "Staff Wise Salary", route: "/admin/payroll/config/staff-rates", legacyAction: "payroll.salary_configure" },
      { id: "payroll.shifts",      label: "Shift Assignment",  route: "/admin/payroll/config/shifts",      legacyAction: "payroll.salary_configure" },
      { id: "payroll.rules",       label: "Overtime & Rules",  route: "/admin/payroll/config/rules",       legacyAction: "payroll.salary_configure" },
      { id: "payroll.processing",  label: "Salary Processing", route: "/admin/payroll/processing",         legacyAction: "payroll.create" },
      { id: "payroll.register",    label: "Salary Register",   route: "/admin/payroll/register",           legacyAction: "payroll.salary_view_all" },
      { id: "payroll.analytics",   label: "Payroll Analytics", route: "/admin/payroll/analytics",          legacyAction: "payroll.analytics" },
      { id: "payroll.audit",       label: "Payroll Audit",     route: "/admin/payroll/audit",              legacyAction: "payroll.audit" },
      { id: "payroll.settings",    label: "Payroll Settings",  route: "/admin/payroll/settings",           legacyAction: "payroll.settings" },
      { id: "payroll.my_salary",   label: "My Salary",         route: "/admin/payroll/my-salary",          legacyAction: "payroll.salary_view_self" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "FileBarChart2",
    defaultRoles: mgmtAdmin,
    submodules: [
      { id: "reports.timetable",            label: "Time Table Report" },
      { id: "reports.student_inquiry",      label: "Student Inquiry Report" },
      { id: "reports.student_detail",       label: "Student Detail Report" },
      { id: "reports.mobile_status",        label: "Mobile App. Status Report" },
      { id: "reports.id_card",              label: "Student ID Card Report" },
      { id: "reports.qrcode_card",          label: "Student QRCode Card" },
      { id: "reports.student_attendance",   label: "Student Attendance Report" },
      { id: "reports.fee_due_reminder",     label: "Fee Due Reminder Report" },
      { id: "reports.pending_fee",          label: "Pending Fee Report" },
      { id: "reports.fee_status",           label: "Fee Status Report" },
      { id: "reports.fee_collection",       label: "Fee Collection Report" },
      { id: "reports.fee_collection_tax",   label: "Fee Collection With Tax Report" },
      { id: "reports.fee_refund",           label: "Fee Refund Report" },
      { id: "reports.exam_status",          label: "Exam Status Report" },
      { id: "reports.student_exam_summary", label: "Student Exam Summary Report" },
      { id: "reports.student_performance",  label: "Student Performance Report" },
      { id: "reports.expense",              label: "Expense Report" },
      { id: "reports.income",               label: "Income Report" },
      { id: "reports.profit_loss",          label: "Profit / Loss Report" },
      { id: "reports.staff_attendance",     label: "Staff Attendance Report" },
      { id: "reports.sms_status",           label: "SMS Status Report" },
      { id: "reports.inquiry_analysis",     label: "Student Inquiry Analysis Report",     route: "/admin/analysis", legacyAction: "reports.analysis" },
      { id: "reports.admission_analysis",   label: "Student Admission Analysis Report",   route: "/admin/analysis", legacyAction: "reports.analysis" },
      { id: "reports.fee_analysis",         label: "Fee Analysis Report",                 route: "/admin/analysis", legacyAction: "reports.analysis" },
      { id: "reports.profit_loss_analysis", label: "Profit Loss Analysis Report",         route: "/admin/analysis", legacyAction: "reports.analysis" },
    ],
  },
  {
    id: "help",
    label: "Help",
    icon: "Shield",
    defaultRoles: all,
    submodules: [
      { id: "help.support_request", label: "Support Request" },
      { id: "help.support_history", label: "Support History" },
      { id: "help.feedback",        label: "Feedback Board" },
      { id: "help.feedback_new",    label: "Share Feedback" },
      { id: "help.triage",          label: "Triage Inbox" },
      { id: "help.analytics",       label: "Ticket Analytics" },
    ],
  },
];

void mgmt;

// ── Convenience lookups ─────────────────────────────────────────────────────
export const MODULES_BY_ID: Record<ModuleId, ModuleDef> = MODULE_CATALOG.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<ModuleId, ModuleDef>
);

export const SUBMODULES_BY_ID: Record<string, SubmoduleDef & { moduleId: ModuleId }> =
  MODULE_CATALOG.reduce(
    (acc, m) => {
      for (const s of m.submodules) acc[s.id] = { ...s, moduleId: m.id };
      return acc;
    },
    {} as Record<string, SubmoduleDef & { moduleId: ModuleId }>
  );

/** Quick membership check used by the legacy bridge. */
export const isCatalogModule = (id: string): id is ModuleId =>
  id in MODULES_BY_ID;
