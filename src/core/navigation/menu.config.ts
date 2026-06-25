// ──────────────────────────────────────────────────────────────────────────────
// CENTRALISED NAVIGATION CONFIG
// ──────────────────────────────────────────────────────────────────────────────
// One declarative tree describes the entire app's navigation. `useNavigation`
// filters this by the current user's role and the RBAC layers (module +
// submodule + action), producing the menu the user actually sees.
//
// Why this exists:
//   - Sidebars must not hardcode JSX. Adding a new module means editing
//     this file and *only* this file.
//   - The shape is consumed by `RoleSidebar`, which renders 14 of the 15
//     modules as collapsible cards (Dashboard is a direct link).
//
// Conventions:
//   - `path` is the absolute route (no role prefix duplication; the layout
//     route in App.tsx handles that).
//   - `action` is a permission key from StaffRightsContext.ACTION_DEFS.
//   - `submodule` / `module` are RBAC catalog ids — gated by useSidebarAccess.
//   - Items default to their group's roles unless they override.
//   - Items inside `collapsible: true` groups render as indented children
//     of the module header (no leading icon — the parent module supplies
//     the icon context).
// ──────────────────────────────────────────────────────────────────────────────

import type { Role } from "@/core/constants/roles";

export interface NavItemConfig {
  path: string;
  label: string;
  /** Permission action key (e.g. "student.control"). Optional. */
  action?: string;
  /** Override the group's role gate for this single item. */
  roles?: Role[];
  /** Render an icon — kept as a string id so the consumer picks lucide-react vs. anything else. */
  icon?: string;
  /** Marks dashboard root items so layouts can render them prominently. */
  isHome?: boolean;
  /** RBAC module id — hides the item if the module isn't granted. */
  module?: string;
  /** RBAC submodule id — checked in addition to `module`. */
  submodule?: string;
}

export interface NavGroupConfig {
  /** Stable id used for collapse-state persistence + analytics. */
  key: string;
  label: string;
  /** Icon shown beside the module label in the sidebar. */
  icon?: string;
  /** Group-wide role gate; items can narrow further. */
  roles: Role[];
  items: NavItemConfig[];
  /**
   * When true, the group renders as an expandable module card. Children are
   * hidden behind a chevron until the user clicks. False/unset = the group's
   * items render as a flat list under an uppercase section label.
   */
  collapsible?: boolean;
  /** RBAC module id — hides the whole group when access is revoked. */
  module?: string;
}

// ── Per-role chrome (brand label shown in the sidebar header) ────────────────
export const ROLE_BRAND: Record<Role, { title: string; subtitle: string }> = {
  admin:        { title: "ARK Admin",        subtitle: "Control Panel"     },
  management:   { title: "ARK Intelligence", subtitle: "Executive Portal"  },
  coordinator:  { title: "ARK Coordinator",  subtitle: "Coordinator Portal" },
  teacher:      { title: "ARK Teacher",      subtitle: "Daily Workflow"    },
};

// ── Role shortcuts (read often, define once) ────────────────────────────────
const all: Role[] = ["admin", "coordinator", "management", "teacher"];
const adminMgmt: Role[] = ["admin", "management"];
const adminCoordMgmt: Role[] = ["admin", "coordinator", "management"];
const adminMgmtTeacher: Role[] = ["admin", "management", "teacher"];
const everyoneExceptTeacher: Role[] = ["admin", "coordinator", "management"];

// ── sub() — one submodule, one item per allowed role ─────────────────────────
// Submodules that have a real route per role use it; the rest fall through to
// the role-scoped coming-soon placeholder. Keeps the config readable without
// 4× duplication for every line item.
function sub(
  submoduleId: string,
  label: string,
  routes: Partial<Record<Role, string>>,
  allowedRoles: Role[],
  opts: { action?: string } = {}
): NavItemConfig[] {
  return allowedRoles.map((role) => ({
    path: routes[role] ?? `/${role}/coming-soon/${submoduleId}`,
    label,
    roles: [role],
    submodule: submoduleId,
    ...(opts.action ? { action: opts.action } : {}),
  }));
}

// ── studentPaths() — same Student route under each role layout ───────────────
const studentPaths = (suffix = ""): Partial<Record<Role, string>> => ({
  admin: `/admin/students${suffix}`,
  coordinator: `/coordinator/students${suffix}`,
  management: `/management/students${suffix}`,
});

// ── attendancePaths() — same Attendance route under each role layout ─────────
// Includes teacher (teachers mark students + self check-in/out).
const attendancePaths = (suffix = ""): Partial<Record<Role, string>> => ({
  admin: `/admin/attendance${suffix}`,
  coordinator: `/coordinator/attendance${suffix}`,
  management: `/management/attendance${suffix}`,
  teacher: `/teacher/attendance${suffix}`,
});

// ── payrollPaths() — same Payroll route under admin + management layouts ──────
const payrollPaths = (suffix = ""): Partial<Record<Role, string>> => ({
  admin: `/admin/payroll${suffix}`,
  management: `/management/payroll${suffix}`,
});

// ── taskPaths() — same Tasks route under every role layout ───────────────────
const taskPaths = (suffix = ""): Partial<Record<Role, string>> => ({
  admin: `/admin/tasks${suffix}`,
  coordinator: `/coordinator/tasks${suffix}`,
  management: `/management/tasks${suffix}`,
  teacher: `/teacher/tasks${suffix}`,
});

// ── examPaths() — same Exam route under admin, coordinator, management, teacher
const examPaths = (suffix = ""): Partial<Record<Role, string>> => ({
  admin: `/admin/exams${suffix}`,
  coordinator: `/coordinator/exams${suffix}`,
  management: `/management/exams${suffix}`,
  teacher: `/teacher/exams${suffix}`,
});

// ── The 15-module navigation tree ───────────────────────────────────────────
export const NAV_CONFIG: NavGroupConfig[] = [
  // 1. Dashboard — direct link to each role's home (NOT collapsible)
  {
    key: "dashboard",
    label: "Dashboard",
    icon: "LayoutDashboard",
    roles: all,
    items: [
      { path: "/admin",        label: "Daily Control",        icon: "LayoutDashboard", roles: ["admin"],       isHome: true, action: "ops.daily_control" },
      { path: "/management",   label: "Management Dashboard", icon: "LayoutDashboard", roles: ["management"],  isHome: true },
      { path: "/coordinator",  label: "Coordinator Dashboard", icon: "LayoutDashboard", roles: ["coordinator"], isHome: true },
      { path: "/teacher",      label: "Teacher Dashboard",    icon: "LayoutDashboard", roles: ["teacher"],     isHome: true },
    ],
  },

  // 2. Settings — every role lands on the shared /settings/* shell. One
  //    item per submodule (NOT per-role) since the URL is identical and
  //    the SettingsLayout is role-agnostic.
  {
    key: "settings",
    label: "Settings",
    icon: "Settings",
    module: "settings",
    collapsible: true,
    roles: all,
    items: [
      { path: "/settings/change-password",    label: "Change Password",             roles: all, submodule: "settings.change_password" },
      { path: "/settings/profile",            label: "Profile Setting",             roles: all, submodule: "settings.profile" },
      { path: "/settings/auto-sms",           label: "Auto SMS Settings",           roles: adminMgmt, submodule: "settings.auto_sms" },
      { path: "/settings/auto-notifications", label: "Auto Notifications Settings", roles: all, submodule: "settings.auto_notifications" },
      { path: "/settings/auto-whatsapp",      label: "Auto WhatsApp Settings",      roles: adminMgmt, submodule: "settings.auto_whatsapp" },
      { path: "/settings/my-plan",            label: "My Plan",                     roles: ["management"], submodule: "settings.my_plan" },
      { path: "/settings/sms-plan",           label: "SMS Plan",                    roles: adminMgmt, submodule: "settings.sms_plan" },
      { path: "/settings/my-referral",        label: "My Referral",                 roles: all, submodule: "settings.my_referral" },
    ],
  },

  // 3. Setup
  {
    key: "setup",
    label: "Setup",
    icon: "ListChecks",
    module: "setup",
    collapsible: true,
    roles: adminMgmt,
    items: [
      // "Add X" links deep-link to the matching Manage page with ?new=1,
      // which auto-opens the create slide-over (see useNewParam).
      ...sub("setup.add_year",          "Add Year",              { admin: "/admin/setup/years?new=1",        management: "/management/setup/years?new=1" },        adminMgmt),
      ...sub("setup.manage_year",       "Manage Year",           { admin: "/admin/setup/years",              management: "/management/setup/years" },              adminMgmt),
      ...sub("setup.assign_standard",   "Assign Standard",       { admin: "/admin/setup/standards",          management: "/management/setup/standards" },          adminMgmt),
      ...sub("setup.assign_subject",    "Assign Subject",        { admin: "/admin/setup/subjects",           management: "/management/setup/subjects" },           adminMgmt),
      ...sub("setup.add_course_type",   "Add Course Type",       { admin: "/admin/setup/course-types?new=1", management: "/management/setup/course-types?new=1" }, adminMgmt),
      ...sub("setup.manage_course_type","Manage Course Type",    { admin: "/admin/setup/course-types",       management: "/management/setup/course-types" },       adminMgmt),
      ...sub("setup.add_batch",         "Add Class / Batch",     { admin: "/admin/setup/batches?new=1",      management: "/management/setup/batches?new=1" },      adminMgmt),
      ...sub("setup.manage_batch",      "Manage Class / Batch",  { admin: "/admin/setup/batches",            management: "/management/setup/batches" },            adminMgmt),
      ...sub("setup.timetable",         "Manage Time Table",     { admin: "/admin/setup/timetable",          management: "/management/setup/timetable" },          adminMgmt),
      ...sub("setup.add_tax",           "Add Tax",               { admin: "/admin/setup/taxes?new=1",        management: "/management/setup/taxes?new=1" },        adminMgmt),
      ...sub("setup.manage_tax",        "Manage Tax",            { admin: "/admin/setup/taxes",              management: "/management/setup/taxes" },              adminMgmt),
    ],
  },

  // 4. Staff / User
  {
    key: "staff_user",
    label: "Staff / User",
    icon: "Users",
    module: "staff_user",
    collapsible: true,
    roles: adminMgmt,
    items: [
      ...sub("staff.create",         "Create Staff",         { admin: "/admin/staff-manage",     management: "/management/staff-manage" },     adminMgmt),
      ...sub("staff.manage",         "Manage Staff",         { admin: "/admin/staff-manage",     management: "/management/staff-manage" },     adminMgmt),
      // Unified Role Center — replaces the old "Manage Staff Rights" + "Manage
      // Staff Action Rights" pair with role-first creation and management.
      ...sub("staff.rights",         "Create Staff Role",        { management: "/management/roles/new" },           ["management"]),
      ...sub("staff.rights",         "Manage Staff Role",        { management: "/management/roles" },               ["management"]),
      ...sub("staff.rights",         "Permission Diagnostics",   { management: "/management/permissions/diagnostics" }, ["management"]),
      ...sub("staff.rights",         "System Health",            { management: "/management/system-health" }, ["management"]),
      ...sub("staff.attendance",     "Staff Attendance",     { admin: "/admin/teacher-checkins", management: "/management/staff-attendance" }, adminMgmt),
    ],
  },

  // 5. Enquiry / Leads
  {
    key: "enquiry_leads",
    label: "Enquiry / Leads",
    icon: "PhoneCall",
    module: "enquiry_leads",
    collapsible: true,
    roles: adminCoordMgmt,
    items: [
      ...sub("enquiry.add",    "Add Student Enquiry",   { admin: "/admin/enquiries",       coordinator: "/coordinator/enquiries", management: "/management/enquiries" }, adminCoordMgmt),
      ...sub("enquiry.assign", "Assign Enquiry",        { admin: "/admin/enquiries",       coordinator: "/coordinator/enquiries", management: "/management/enquiries" }, adminCoordMgmt),
      ...sub("enquiry.manage", "Manage Enquiry",        { admin: "/admin/enquiries",       coordinator: "/coordinator/enquiries", management: "/management/enquiries" }, adminCoordMgmt),
      // ── Lead Management + Automation CRM ──────────────────────────────────
      ...sub("lead.counselor_board", "My Leads",            { admin: "/admin/leads",            coordinator: "/coordinator/leads",            management: "/management/leads" },            adminCoordMgmt),
      ...sub("lead.pipeline",        "Lead Pipeline",       { admin: "/admin/leads/pipeline",   coordinator: "/coordinator/leads/pipeline",   management: "/management/leads/pipeline" },   adminCoordMgmt),
      ...sub("lead.management",      "Lead Management",     { admin: "/admin/leads/management", management: "/management/leads/management" },   adminMgmt),
      ...sub("lead.demos",           "Demo Classes",        { admin: "/admin/leads/demos",      coordinator: "/coordinator/leads/demos",      management: "/management/leads/demos" },      adminCoordMgmt),
      ...sub("lead.admissions",      "Lead Admissions",     { admin: "/admin/leads/admissions", coordinator: "/coordinator/leads/admissions", management: "/management/leads/admissions" }, adminCoordMgmt),
      ...sub("lead.analytics",       "Lead Analytics",      { admin: "/admin/leads/analytics",  coordinator: "/coordinator/leads/analytics",  management: "/management/leads/analytics" },  adminCoordMgmt),
      ...sub("lead.whatsapp",        "WhatsApp Delivery",   { admin: "/admin/leads/whatsapp",   coordinator: "/coordinator/leads/whatsapp",   management: "/management/leads/whatsapp" },   adminCoordMgmt),
      ...sub("lead.config",          "Automation Config",   { admin: "/admin/leads/config",     management: "/management/leads/config" },      adminMgmt),
      ...sub("lead.bulk_import",     "Bulk Import",         { admin: "/admin/leads/bulk-import", management: "/management/leads/bulk-import" }, adminMgmt, { action: "bulk_import.view" }),
    ],
  },

  // 6. Student
  {
    key: "student",
    label: "Student",
    icon: "GraduationCap",
    module: "student",
    collapsible: true,
    roles: everyoneExceptTeacher,
    items: [
      ...sub("student.import",            "Students Import",            studentPaths("/import"),           adminMgmt),
      ...sub("student.add",               "Add Student Registration",   studentPaths("/registration"),     adminCoordMgmt),
      ...sub("student.manage",            "Manage Student",             studentPaths(""),                  everyoneExceptTeacher),
      ...sub("student.assign_batch",      "Assign Class / Batch",       studentPaths("/assign-batch"),     adminMgmt),
      ...sub("student.attendance",        "Student Attendance",         studentPaths("/attendance"),       everyoneExceptTeacher),
      ...sub("student.share_docs",        "Share Documents",            studentPaths("/documents"),        everyoneExceptTeacher),
      ...sub("student.manage_shared_docs","Manage Shared Documents",    studentPaths("/shared-documents"), adminMgmt),
      ...sub("student.leave_request",     "Manage Leave Request",       studentPaths("/leave"),            adminCoordMgmt),
      ...sub("student.year_transfer",     "Student Year Transfer",      studentPaths("/year-transfer"),    adminMgmt),
      ...sub("student.untransfer",        "Student Untransfer",         studentPaths("/untransfer"),       adminMgmt),
      ...sub("student.chat",              "Chat With Students",         studentPaths("/chat"),             everyoneExceptTeacher),
      ...sub("student.feedback",          "Student Feedback",           studentPaths("/feedback"),         everyoneExceptTeacher),
      ...sub("student.rights",            "Student Rights",             studentPaths("/rights"),           adminMgmt),
      ...sub("student.app_access",        "App. Access Rights",         studentPaths("/app-access"),       adminMgmt),
      ...sub("student.attendance_history","Attendance History",         {
        admin: "/admin/students/attendance-history",
        coordinator: "/coordinator/students/attendance-history",
        management: "/management/students/attendance-history",
        teacher: "/teacher/students/attendance-history",
      }, all),
    ],
  },

  // 6b. Attendance (enterprise module)
  {
    key: "attendance",
    label: "Attendance",
    icon: "CalendarCheck",
    module: "attendance",
    collapsible: true,
    roles: all,
    items: [
      ...sub("attendance.dashboard",     "Attendance Dashboard",       attendancePaths("/dashboard"),          adminCoordMgmt),
      ...sub("attendance.student_mark",  "Mark Student Attendance",    attendancePaths("/students/mark"),      all),
      ...sub("attendance.student_register","Student Attendance Register", attendancePaths("/students/register"), all),
      ...sub("attendance.student_backdated","Backdated Attendance",     attendancePaths("/students/backdated"), adminCoordMgmt),
      ...sub("attendance.student_corrections","Attendance Corrections", attendancePaths("/students/corrections"), adminCoordMgmt),
      ...sub("attendance.student_import","Import Student Attendance",   attendancePaths("/students/import"),     adminMgmt),
      ...sub("attendance.staff_manual",  "Staff Manual Attendance",    attendancePaths("/staff/manual"),       adminMgmt),
      ...sub("attendance.staff_checkin", "Check In / Check Out",       attendancePaths("/staff/check-in"),     all),
      ...sub("attendance.staff_hours",   "Work Hours Dashboard",       attendancePaths("/staff/work-hours"),   adminMgmt),
      ...sub("attendance.staff_register","Staff Attendance Register",  attendancePaths("/staff/register"),     adminMgmt),
      ...sub("attendance.staff_corrections","Staff Corrections",       attendancePaths("/staff/corrections"),  adminMgmt),
      ...sub("attendance.staff_import",  "Import Staff Attendance",    attendancePaths("/staff/import"),       adminMgmt),
      ...sub("attendance.analytics_students","Student Analytics",      attendancePaths("/analytics/students"), adminCoordMgmt),
      ...sub("attendance.analytics_staff","Staff Analytics",           attendancePaths("/analytics/staff"),    adminMgmt),
      ...sub("attendance.analytics_trends","Attendance Trends",        attendancePaths("/analytics/trends"),   adminCoordMgmt),
      ...sub("attendance.analytics_risk","Risk Analysis",              attendancePaths("/analytics/risk"),     adminCoordMgmt),
      ...sub("attendance.analytics_hours","Work Hours Analytics",      attendancePaths("/analytics/work-hours"), adminMgmt),
      ...sub("attendance.reports",       "Attendance Reports",         attendancePaths("/reports"),            adminCoordMgmt),
      // Governance (Phase 5)
      ...sub("attendance.gov_compliance","Compliance Dashboard",       attendancePaths("/governance/compliance"), adminCoordMgmt),
      ...sub("attendance.gov_locks",     "Lock Periods",               attendancePaths("/governance/locks"),      adminMgmt),
      ...sub("attendance.gov_closing",   "Monthly Closing",            attendancePaths("/governance/closing"),    adminMgmt),
      ...sub("attendance.gov_reopen",    "Reopen Requests",            attendancePaths("/governance/reopen"),     adminCoordMgmt),
      ...sub("attendance.gov_approvals", "Approval Queue",             attendancePaths("/governance/approvals"),  adminCoordMgmt),
      ...sub("attendance.gov_audit",     "Audit Center",               attendancePaths("/governance/audit"),      adminCoordMgmt),
      ...sub("attendance.gov_health",    "Attendance Health",          attendancePaths("/governance/health"),     adminMgmt),
      // Automation Center (Phase 5)
      ...sub("attendance.auto_center",   "Automation Center",          attendancePaths("/automation"),            adminMgmt),
      ...sub("attendance.auto_students", "Attendance Alerts",          attendancePaths("/automation/students"),   adminCoordMgmt),
      ...sub("attendance.auto_staff",    "Staff Alerts",               attendancePaths("/automation/staff"),      adminMgmt),
      ...sub("attendance.settings",      "Attendance Settings",        attendancePaths("/settings"),           adminMgmt),
    ],
  },

  // 6c. Tasks (enterprise task management — institute-wide)
  {
    key: "tasks",
    label: "Tasks",
    icon: "ListTodo",
    module: "tasks",
    collapsible: true,
    roles: all,
    items: [
      ...sub("tasks.dashboard", "Task Dashboard", taskPaths("/dashboard"), all),
      ...sub("tasks.my",        "My Tasks",       taskPaths("/my"),        all),
      ...sub("tasks.team",      "Team Tasks",     taskPaths("/team"),      adminCoordMgmt, { action: "tasks.view_all" }),
      ...sub("tasks.board",     "Kanban Board",   taskPaths("/board"),     all),
      ...sub("tasks.workload",  "Team Workload",  taskPaths("/workload"),  adminCoordMgmt, { action: "tasks.view_all" }),
    ],
  },

  // 7. Live Class
  {
    key: "live_class",
    label: "Live Class",
    icon: "BookOpen",
    module: "live_class",
    collapsible: true,
    roles: all,
    items: [
      ...sub("live.add",    "Add Class",    {
        admin: "/admin/live-classes/add",
        management: "/management/live-classes/add",
        teacher: "/teacher/live-classes/add",
      }, ["admin", "management", "teacher"]),
      ...sub("live.manage", "Manage Class", {
        admin: "/admin/live-classes",
        management: "/management/live-classes",
        coordinator: "/coordinator/live-classes",
        teacher: "/teacher/live-classes",
      }, ["admin", "management", "coordinator", "teacher"]),
      ...sub("live.my",     "My Class",     {
        admin: "/admin/live-classes/my",
        management: "/management/live-classes/my",
        coordinator: "/coordinator/live-classes/my",
        teacher: "/teacher/live-classes/my",
      }, all),
    ],
  },

  // 8. Fee — teacher excluded per spec
  {
    key: "fee",
    label: "Fee",
    icon: "Wallet",
    module: "fee",
    collapsible: true,
    roles: adminMgmt,
    items: [
      // No standalone "Create Fee Structure" entry — structures are created
      // from the "+ Create Fee Structure" button inside Manage Fee Structure.
      ...sub("fee.manage_structure", "Manage Fee Structure", { admin: "/admin/setup/fee-structures", management: "/management/setup/fee-structures" }, adminMgmt),
      ...sub("fee.collection",       "Fee Collection",       { admin: "/admin/fees",            management: "/management/fees" },            adminMgmt),
      ...sub("fee.manage",           "Manage Fees",          { admin: "/admin/fees-management", management: "/management/fees-management" }, adminMgmt),
    ],
  },

  // 9. Exam
  {
    key: "exam",
    label: "Exam",
    icon: "ClipboardCheck",
    module: "exam",
    collapsible: true,
    roles: all,
    items: [
      ...sub("exam.create_manual",    "Create Manual Exam",  examPaths("/manual/create"),       adminMgmtTeacher, { action: "exam.create" }),
      ...sub("exam.manage_manual",    "Manage Manual Exam",  examPaths("/manual"),              all),
      ...sub("exam.create_mcq_paper", "Create MCQ Paper",    examPaths("/mcq-papers/create"),   adminMgmtTeacher, { action: "exam.mcq.paper_create" }),
      ...sub("exam.manage_mcq_paper", "Manage MCQ Paper",    examPaths("/mcq-papers"),          all),
      ...sub("exam.create_mcq_exam",  "Create MCQ Exam",     examPaths("/mcq-exams/create"),    adminMgmtTeacher, { action: "exam.mcq.create" }),
      ...sub("exam.manage_mcq_exam",  "Manage MCQ Exam",     examPaths("/mcq-exams"),           all),
    ],
  },

  // 10. eStudy
  {
    key: "estudy",
    label: "eStudy",
    icon: "BookOpen",
    module: "estudy",
    collapsible: true,
    roles: all,
    items: [
      ...sub("estudy.create", "Create Study Material", {
        admin: "/admin/estudy/create",
        management: "/management/estudy/create",
        teacher: "/teacher/estudy/create",
      }, adminMgmtTeacher),
      ...sub("estudy.manage", "Manage Study Material", {
        admin: "/admin/estudy",
        management: "/management/estudy",
        coordinator: "/coordinator/estudy",
        teacher: "/teacher/estudy",
      }, all),
      ...sub("estudy.shared", "Manage Shared Study Material", {
        admin: "/admin/estudy/shared",
        management: "/management/estudy/shared",
      }, adminMgmt),
    ],
  },

  // 11. Certificate
  {
    key: "certificate",
    label: "Certificate",
    icon: "ShieldCheck",
    module: "certificate",
    collapsible: true,
    roles: adminMgmt,
    items: [
      ...sub("certificate.add",    "Add Certificate", {
        admin: "/admin/certificates/add",
        management: "/management/certificates/add",
      }, adminMgmt),
      ...sub("certificate.manage", "Manage Certificate", {
        admin: "/admin/certificates",
        management: "/management/certificates",
      }, adminMgmt),
    ],
  },

  // 12. WhatsApp SMS
  {
    key: "whatsapp",
    label: "WhatsApp SMS",
    icon: "Bell",
    module: "whatsapp",
    collapsible: true,
    roles: adminMgmt,
    items: [
      ...sub("whatsapp.send_inquiry",        "Send SMS To Inquiry",             { admin: "/admin/communication/send-inquiry",             management: "/management/communication/send-inquiry" },             adminMgmt),
      ...sub("whatsapp.send_student",        "Send SMS To Student",             { admin: "/admin/communication/send-student",             management: "/management/communication/send-student" },             adminMgmt),
      ...sub("whatsapp.send_staff",          "Send SMS To Staff",               { admin: "/admin/communication/send-staff",               management: "/management/communication/send-staff" },               adminMgmt),
      ...sub("whatsapp.send_staff_creds",    "Send Staff ID / Password",        { admin: "/admin/communication/send-staff-credentials",   management: "/management/communication/send-staff-credentials" },   adminMgmt),
      ...sub("whatsapp.send_student_creds",  "Send Student ID / Password",      { admin: "/admin/communication/send-student-credentials", management: "/management/communication/send-student-credentials" }, adminMgmt),
      ...sub("whatsapp.send_upcoming_exam",  "Send Upcoming Exam SMS",          { admin: "/admin/communication/send-exam-reminder",       management: "/management/communication/send-exam-reminder" },       adminMgmt),
      ...sub("whatsapp.send_exam_marks",     "Send Exam Marks SMS",             { admin: "/admin/communication/send-exam-marks",          management: "/management/communication/send-exam-marks" },          adminMgmt),
      ...sub("whatsapp.send_fee_status",     "Send Fee Status SMS",             { admin: "/admin/communication/send-fee-status",          management: "/management/communication/send-fee-status" },          adminMgmt),
      ...sub("whatsapp.send_fee_due",        "Send Fee Due Reminder SMS",       { admin: "/admin/communication/send-fee-due-reminder",    management: "/management/communication/send-fee-due-reminder" },    adminMgmt),
      ...sub("whatsapp.send_absent",         "Send Today Absent Attendance SMS",{ admin: "/admin/communication/send-absent-attendance",   management: "/management/communication/send-absent-attendance" },   adminMgmt),
      ...sub("whatsapp.send_birthday",       "Send Student Birthday SMS",       { admin: "/admin/communication/send-birthday",            management: "/management/communication/send-birthday" },            adminMgmt),
      ...sub("whatsapp.credential_health",   "Credential Health",               { admin: "/admin/communication/credential-health",        management: "/management/communication/credential-health" },        adminMgmt),
    ],
  },

  // 13. Authentication (student & parent accounts)
  {
    key: "authentication",
    label: "Authentication",
    icon: "ShieldCheck",
    module: "authentication",
    collapsible: true,
    roles: adminMgmt,
    items: [
      ...sub("authentication.account_health", "Account Health", { admin: "/admin/authentication/account-health", management: "/management/authentication/account-health" }, adminMgmt),
    ],
  },

  // 13. Expense & Income
  {
    key: "expense_income",
    label: "Expense & Income",
    icon: "Receipt",
    module: "expense_income",
    collapsible: true,
    roles: adminMgmt,
    items: [
      ...sub("expense.add_type",    "Add Expense Type",    { admin: "/admin/finance/add-expense-type",    management: "/management/finance/add-expense-type" },    adminMgmt),
      ...sub("expense.manage_type", "Manage Expense Type", { admin: "/admin/finance/manage-expense-type", management: "/management/finance/manage-expense-type" }, adminMgmt),
      ...sub("expense.add",         "Add Expense",         { admin: "/admin/finance/add-expense",         management: "/management/finance/add-expense" },         adminMgmt),
      ...sub("expense.manage",      "Manage Expense",      { admin: "/admin/finance/manage-expense",      management: "/management/finance/manage-expense" },      adminMgmt),
      ...sub("income.add_type",     "Add Income Type",     { admin: "/admin/finance/add-income-type",     management: "/management/finance/add-income-type" },     adminMgmt),
      ...sub("income.manage_type",  "Manage Income Type",  { admin: "/admin/finance/manage-income-type",  management: "/management/finance/manage-income-type" },  adminMgmt),
      ...sub("income.add",          "Add Income",          { admin: "/admin/finance/add-income",          management: "/management/finance/add-income" },          adminMgmt),
      ...sub("income.manage",       "Manage Income",       { admin: "/admin/finance/manage-income",       management: "/management/finance/manage-income" },       adminMgmt),
    ],
  },

  // 13b. Payroll — Enterprise Payroll & Compensation
  {
    key: "payroll",
    label: "Payroll",
    icon: "Wallet",
    module: "payroll",
    collapsible: true,
    roles: all,
    items: [
      ...sub("payroll.dashboard",   "Payroll Dashboard",   payrollPaths("/dashboard"),            adminMgmt, { action: "payroll.dashboard" }),
      ...sub("payroll.approval",    "Approval Center",     payrollPaths("/approval"),             adminMgmt, { action: "payroll.approve" }),
      ...sub("payroll.role_rates",  "Role Wise Salary",    payrollPaths("/config/role-rates"),    adminMgmt, { action: "payroll.salary_configure" }),
      ...sub("payroll.staff_rates", "Staff Wise Salary",   payrollPaths("/config/staff-rates"),   adminMgmt, { action: "payroll.salary_configure" }),
      ...sub("payroll.shifts",      "Shift Assignment",    payrollPaths("/config/shifts"),        adminMgmt, { action: "payroll.salary_configure" }),
      ...sub("payroll.rules",       "Overtime & Rules",    payrollPaths("/config/rules"),         adminMgmt, { action: "payroll.salary_configure" }),
      ...sub("payroll.processing",  "Salary Processing",   payrollPaths("/processing"),           adminMgmt, { action: "payroll.create" }),
      ...sub("payroll.register",    "Salary Register",     payrollPaths("/register"),             adminMgmt, { action: "payroll.salary_view_all" }),
      ...sub("payroll.analytics",   "Payroll Analytics",   payrollPaths("/analytics"),            adminMgmt, { action: "payroll.analytics" }),
      ...sub("payroll.audit",       "Payroll Audit",       payrollPaths("/audit"),                adminMgmt, { action: "payroll.audit" }),
      ...sub("payroll.settings",    "Payroll Settings",    payrollPaths("/settings"),             adminMgmt, { action: "payroll.settings" }),
      // My Salary — every role (staff self-service)
      ...sub("payroll.my_salary",   "My Salary",           {
        admin: "/admin/payroll/my-salary",
        management: "/management/payroll/my-salary",
        coordinator: "/coordinator/payroll/my-salary",
        teacher: "/teacher/payroll/my-salary",
      }, all, { action: "payroll.salary_view_self" }),
    ],
  },

  // 14. Report — coordinator excluded per spec
  {
    key: "reports",
    label: "Report",
    icon: "FileBarChart2",
    module: "reports",
    collapsible: true,
    roles: adminMgmt,
    items: [
      ...sub("reports.timetable",            "Time Table Report",                 { admin: "/admin/reports/timetable",            management: "/management/reports/timetable" },            adminMgmt),
      ...sub("reports.student_inquiry",      "Student Inquiry Report",            { admin: "/admin/reports/student-inquiry",      management: "/management/reports/student-inquiry" },      adminMgmt),
      ...sub("reports.student_detail",       "Student Detail Report",             { admin: "/admin/reports/student-detail",       management: "/management/reports/student-detail" },       adminMgmt),
      ...sub("reports.mobile_status",        "Mobile App. Status Report",         { admin: "/admin/reports/mobile-status",        management: "/management/reports/mobile-status" },        adminMgmt),
      ...sub("reports.id_card",              "Student ID Card Report",            { admin: "/admin/reports/id-card",              management: "/management/reports/id-card" },              adminMgmt),
      ...sub("reports.qrcode_card",          "Student QRCode Card",               { admin: "/admin/reports/qrcode-card",          management: "/management/reports/qrcode-card" },          adminMgmt),
      ...sub("reports.student_attendance",   "Student Attendance Report",         { admin: "/admin/reports/student-attendance",   management: "/management/reports/student-attendance" },   adminMgmt),
      ...sub("reports.fee_due_reminder",     "Fee Due Reminder Report",           { admin: "/admin/reports/fee-due-reminder",     management: "/management/reports/fee-due-reminder" },     adminMgmt),
      ...sub("reports.pending_fee",          "Pending Fee Report",                { admin: "/admin/reports/pending-fee",          management: "/management/reports/pending-fee" },          adminMgmt),
      ...sub("reports.fee_status",           "Fee Status Report",                 { admin: "/admin/reports/fee-status",           management: "/management/reports/fee-status" },           adminMgmt),
      ...sub("reports.fee_collection",       "Fee Collection Report",             { admin: "/admin/reports/fee-collection",       management: "/management/reports/fee-collection" },       adminMgmt),
      ...sub("reports.fee_collection_tax",   "Fee Collection With Tax Report",    { admin: "/admin/reports/fee-collection-tax",   management: "/management/reports/fee-collection-tax" },   adminMgmt),
      ...sub("reports.fee_refund",           "Fee Refund Report",                 { admin: "/admin/reports/fee-refund",           management: "/management/reports/fee-refund" },           adminMgmt),
      ...sub("reports.exam_status",          "Exam Status Report",                { admin: "/admin/reports/exam-status",          management: "/management/reports/exam-status" },          adminMgmt),
      ...sub("reports.student_exam_summary", "Student Exam Summary Report",       { admin: "/admin/reports/student-exam-summary", management: "/management/reports/student-exam-summary" }, adminMgmt),
      ...sub("reports.student_performance",  "Student Performance Report",        { admin: "/admin/reports/student-performance",  management: "/management/reports/student-performance" },  adminMgmt),
      ...sub("reports.expense",              "Expense Report",                    { admin: "/admin/reports/expense",              management: "/management/reports/expense" },              adminMgmt),
      ...sub("reports.income",               "Income Report",                     { admin: "/admin/reports/income",               management: "/management/reports/income" },               adminMgmt),
      ...sub("reports.profit_loss",          "Profit / Loss Report",              { admin: "/admin/reports/profit-loss",          management: "/management/reports/profit-loss" },          adminMgmt),
      ...sub("reports.staff_attendance",     "Staff Attendance Report",           { admin: "/admin/reports/staff-attendance",     management: "/management/reports/staff-attendance" },     adminMgmt),
      ...sub("reports.sms_status",           "SMS Status Report",                 { admin: "/admin/reports/sms-status",           management: "/management/reports/sms-status" },           adminMgmt),
      ...sub("reports.inquiry_analysis",     "Student Inquiry Analysis Report",   { admin: "/admin/reports/inquiry-analysis",     management: "/management/reports/inquiry-analysis" },     adminMgmt, { action: "reports.analysis" }),
      ...sub("reports.admission_analysis",   "Student Admission Analysis Report", { admin: "/admin/reports/admission-analysis",   management: "/management/reports/admission-analysis" },   adminMgmt, { action: "reports.analysis" }),
      ...sub("reports.fee_analysis",         "Fee Analysis Report",               { admin: "/admin/reports/fee-analysis",         management: "/management/reports/fee-analysis" },         adminMgmt, { action: "reports.analysis" }),
      ...sub("reports.profit_loss_analysis", "Profit Loss Analysis Report",       { admin: "/admin/reports/profit-loss-analysis", management: "/management/reports/profit-loss-analysis" }, adminMgmt, { action: "reports.analysis" }),
    ],
  },

  // 15. Help
  {
    key: "help",
    label: "Help",
    icon: "LifeBuoy",
    module: "help",
    collapsible: true,
    roles: all,
    items: [
      ...sub("help.support_request", "Support Request", {
        admin: "/admin/help/new",
        management: "/management/help/new",
        coordinator: "/coordinator/help/new",
        teacher: "/teacher/help/new",
      }, all, { action: "help.ticket.create" }),
      ...sub("help.support_history", "Support History", {
        admin: "/admin/help/history",
        management: "/management/help/history",
        coordinator: "/coordinator/help/history",
        teacher: "/teacher/help/history",
      }, all),
      ...sub("help.feedback", "Feedback Board", {
        admin: "/admin/help/feedback",
        management: "/management/help/feedback",
        coordinator: "/coordinator/help/feedback",
        teacher: "/teacher/help/feedback",
      }, all),
      ...sub("help.feedback_new", "Share Feedback", {
        admin: "/admin/help/feedback/new",
        management: "/management/help/feedback/new",
        coordinator: "/coordinator/help/feedback/new",
        teacher: "/teacher/help/feedback/new",
      }, all, { action: "help.feedback.create" }),
      ...sub("help.triage", "Triage Inbox", {
        admin: "/admin/help/triage",
        management: "/management/help/triage",
        coordinator: "/coordinator/help/triage",
      }, everyoneExceptTeacher, { action: "help.ticket.assign" }),
      ...sub("help.analytics", "Ticket Analytics", {
        admin: "/admin/help/analytics",
        management: "/management/help/analytics",
      }, adminMgmt, { action: "help.analytics.view" }),
    ],
  },
];
