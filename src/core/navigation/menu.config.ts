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
      { path: "/coordinator",  label: "Task Management",      icon: "LayoutDashboard", roles: ["coordinator"], isHome: true },
      { path: "/teacher",      label: "Teacher Dashboard",    icon: "LayoutDashboard", roles: ["teacher"],     isHome: true },
    ],
  },

  // 2. Settings
  {
    key: "settings",
    label: "Settings",
    icon: "Settings",
    module: "settings",
    collapsible: true,
    roles: all,
    items: [
      ...sub("settings.change_password",     "Change Password",            {}, all),
      ...sub("settings.profile",             "Profile Setting",            {}, all),
      ...sub("settings.auto_sms",            "Auto SMS Settings",          {}, all),
      ...sub("settings.auto_notifications",  "Auto Notifications Settings",{
        admin: "/admin/notifications",
        management: "/management/notifications",
      }, all),
      ...sub("settings.auto_whatsapp",       "Auto WhatsApp Settings",     {}, all),
      ...sub("settings.my_plan",             "My Plan",                    {}, all),
      ...sub("settings.sms_plan",            "SMS Plan",                   {}, all),
      ...sub("settings.my_referral",         "My Referral",                {}, all),
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
      ...sub("setup.add_year",          "Add Year",              {}, adminMgmt),
      ...sub("setup.manage_year",       "Manage Year",           { admin: "/admin/setup/years",        management: "/management/setup/years" },        adminMgmt),
      ...sub("setup.assign_standard",   "Assign Standard",       { admin: "/admin/setup/standards",    management: "/management/setup/standards" },    adminMgmt),
      ...sub("setup.assign_subject",    "Assign Subject",        { admin: "/admin/setup/subjects",     management: "/management/setup/subjects" },     adminMgmt),
      ...sub("setup.add_course_type",   "Add Course Type",       {}, adminMgmt),
      ...sub("setup.manage_course_type","Manage Course Type",    { admin: "/admin/setup/course-types", management: "/management/setup/course-types" }, adminMgmt),
      ...sub("setup.add_batch",         "Add Class / Batch",     {}, adminMgmt),
      ...sub("setup.manage_batch",      "Manage Class / Batch",  { admin: "/admin/setup/batches",      management: "/management/setup/batches" },      adminMgmt),
      ...sub("setup.timetable",         "Manage Time Table",     { admin: "/admin/timetable",          management: "/management/timetable" },          adminMgmt),
      ...sub("setup.add_tax",           "Add Tax",               {}, adminMgmt),
      ...sub("setup.manage_tax",        "Manage Tax",            { admin: "/admin/setup/taxes",        management: "/management/setup/taxes" },        adminMgmt),
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
      ...sub("staff.rights",         "Manage Staff Rights",  { management: "/management/permissions" },   ["management"]),
      ...sub("staff.action_rights",  "Manage Staff Action Rights", { management: "/management/action-rights" }, ["management"]),
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
      ...sub("student.import",            "Students Import",            {}, adminMgmt),
      ...sub("student.add",               "Add Student Registration",   { admin: "/admin/students",          management: "/management/students" },          adminMgmt),
      ...sub("student.manage",            "Manage Student",             { admin: "/admin/students",          management: "/management/students" },          everyoneExceptTeacher),
      ...sub("student.assign_batch",      "Assign Class / Batch",       {}, adminMgmt),
      ...sub("student.attendance",        "Student Attendance",         {}, everyoneExceptTeacher),
      ...sub("student.share_docs",        "Share Documents",            {}, everyoneExceptTeacher),
      ...sub("student.manage_shared_docs","Manage Shared Documents",    {}, adminMgmt),
      ...sub("student.leave_request",     "Manage Leave Request",       { admin: "/admin/leave-management",  management: "/management/leave-management" },  adminMgmt),
      ...sub("student.year_transfer",     "Student Year Transfer",      {}, adminMgmt),
      ...sub("student.untransfer",        "Student Untransfer",         {}, adminMgmt),
      ...sub("student.chat",              "Chat With Students",         {}, everyoneExceptTeacher),
      ...sub("student.feedback",          "Student Feedback",           {}, everyoneExceptTeacher),
      ...sub("student.rights",            "Student Rights",             {}, adminMgmt),
      ...sub("student.app_access",        "App. Access Rights",         {}, adminMgmt),
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
      ...sub("live.add",    "Add Class",    {}, ["admin", "management", "teacher"]),
      ...sub("live.manage", "Manage Class", {}, ["admin", "management", "coordinator", "teacher"]),
      ...sub("live.my",     "My Class",     {}, all),
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
      ...sub("fee.create_structure", "Create Fee Structure", {}, adminMgmt),
      ...sub("fee.manage_structure", "Manage Fee Structure", { admin: "/admin/setup/fee-structures", management: "/management/setup/fee-structures" }, adminMgmt),
      ...sub("fee.collection",       "Fee Collection",       { admin: "/admin/fees" }, adminMgmt),
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
      ...sub("exam.create_manual",    "Create Manual Exam",  {}, adminMgmtTeacher),
      ...sub("exam.manage_manual",    "Manage Manual Exam",  {}, all),
      ...sub("exam.create_mcq_paper", "Create MCQ Paper",    {}, adminMgmtTeacher),
      ...sub("exam.manage_mcq_paper", "Manage MCQ Paper",    {}, all),
      ...sub("exam.create_mcq_exam",  "Create MCQ Exam",     {}, adminMgmtTeacher),
      ...sub("exam.manage_mcq_exam",  "Manage MCQ Exam",     {}, all),
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
      ...sub("estudy.create", "Create Study Material",         {}, adminMgmtTeacher),
      ...sub("estudy.manage", "Manage Study Material",         {}, all),
      ...sub("estudy.shared", "Manage Shared Study Material",  {}, adminMgmt),
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
      ...sub("certificate.add",    "Add Certificate",    {}, adminMgmt),
      ...sub("certificate.manage", "Manage Certificate", {}, adminMgmt),
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
      ...sub("whatsapp.send_inquiry",        "Send SMS To Inquiry",             {}, adminMgmt),
      ...sub("whatsapp.send_student",        "Send SMS To Student",             {}, adminMgmt),
      ...sub("whatsapp.send_staff",          "Send SMS To Staff",               {}, adminMgmt),
      ...sub("whatsapp.send_staff_creds",    "Send Staff ID / Password",        {}, adminMgmt),
      ...sub("whatsapp.send_student_creds",  "Send Student ID / Password",      {}, adminMgmt),
      ...sub("whatsapp.send_upcoming_exam",  "Send Upcoming Exam SMS",          {}, adminMgmt),
      ...sub("whatsapp.send_exam_marks",     "Send Exam Marks SMS",             {}, adminMgmt),
      ...sub("whatsapp.send_fee_status",     "Send Fee Status SMS",             {}, adminMgmt),
      ...sub("whatsapp.send_fee_due",        "Send Fee Due Reminder SMS",       {}, adminMgmt),
      ...sub("whatsapp.send_absent",         "Send Today Absent Attendance SMS",{}, adminMgmt),
      ...sub("whatsapp.send_birthday",       "Send Student Birthday SMS",       {}, adminMgmt),
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
      ...sub("expense.add_type",    "Add Expense Type",    {}, adminMgmt),
      ...sub("expense.manage_type", "Manage Expense Type", { admin: "/admin/setup/expense-categories", management: "/management/setup/expense-categories" }, adminMgmt),
      ...sub("expense.add",         "Add Expense",         { admin: "/admin/expenses",                 management: "/management/expenses" },                 adminMgmt),
      ...sub("expense.manage",      "Manage Expense",      { admin: "/admin/expenses",                 management: "/management/expenses" },                 adminMgmt),
      ...sub("income.add_type",     "Add Income Type",     {}, adminMgmt),
      ...sub("income.manage_type",  "Manage Income Type",  {}, adminMgmt),
      ...sub("income.add",          "Add Income",          { admin: "/admin/expenses",                 management: "/management/expenses" },                 adminMgmt),
      ...sub("income.manage",       "Manage Income",       { admin: "/admin/expenses",                 management: "/management/expenses" },                 adminMgmt),
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
      ...sub("reports.timetable",            "Time Table Report",                 {}, adminMgmt),
      ...sub("reports.student_inquiry",      "Student Inquiry Report",            {}, adminMgmt),
      ...sub("reports.student_detail",       "Student Detail Report",             {}, adminMgmt),
      ...sub("reports.mobile_status",        "Mobile App. Status Report",         {}, adminMgmt),
      ...sub("reports.id_card",              "Student ID Card Report",            {}, adminMgmt),
      ...sub("reports.qrcode_card",          "Student QRCode Card",               {}, adminMgmt),
      ...sub("reports.student_attendance",   "Student Attendance Report",         {}, adminMgmt),
      ...sub("reports.fee_due_reminder",     "Fee Due Reminder Report",           {}, adminMgmt),
      ...sub("reports.pending_fee",          "Pending Fee Report",                {}, adminMgmt),
      ...sub("reports.fee_status",           "Fee Status Report",                 {}, adminMgmt),
      ...sub("reports.fee_collection",       "Fee Collection Report",             {}, adminMgmt),
      ...sub("reports.fee_collection_tax",   "Fee Collection With Tax Report",    {}, adminMgmt),
      ...sub("reports.fee_refund",           "Fee Refund Report",                 {}, adminMgmt),
      ...sub("reports.exam_status",          "Exam Status Report",                {}, adminMgmt),
      ...sub("reports.student_exam_summary", "Student Exam Summary Report",       {}, adminMgmt),
      ...sub("reports.student_performance",  "Student Performance Report",        {}, adminMgmt),
      ...sub("reports.expense",              "Expense Report",                    {}, adminMgmt),
      ...sub("reports.income",               "Income Report",                     {}, adminMgmt),
      ...sub("reports.profit_loss",          "Profit / Loss Report",              { management: "/management/finance" }, adminMgmt),
      ...sub("reports.staff_attendance",     "Staff Attendance Report",           {}, adminMgmt),
      ...sub("reports.sms_status",           "SMS Status Report",                 {}, adminMgmt),
      ...sub("reports.inquiry_analysis",     "Student Inquiry Analysis Report",   { admin: "/admin/analysis", management: "/management/analysis" }, adminMgmt, { action: "reports.analysis" }),
      ...sub("reports.admission_analysis",   "Student Admission Analysis Report", { admin: "/admin/analysis", management: "/management/analysis" }, adminMgmt, { action: "reports.analysis" }),
      ...sub("reports.fee_analysis",         "Fee Analysis Report",               { admin: "/admin/analysis", management: "/management/analysis" }, adminMgmt, { action: "reports.analysis" }),
      ...sub("reports.profit_loss_analysis", "Profit Loss Analysis Report",       { admin: "/admin/analysis", management: "/management/analysis" }, adminMgmt, { action: "reports.analysis" }),
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
      ...sub("help.support_request", "Support Request", {}, all),
      ...sub("help.support_history", "Support History", {}, all),
      ...sub("help.feedback",        "Feedback",        {}, all),
    ],
  },
];
