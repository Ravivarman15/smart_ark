import type { DocArticle } from "../types";

// Role guides. What each role can reach is derived from the RBAC catalog and
// the menu config — never from what a job title suggests. The gate checks the
// `permissions` list against the generated inventory.

export const ROLE_ARTICLES: DocArticle[] = [
  {
    slug: "roles-overview",
    title: "Roles and what they can reach",
    description: "The six roles, and how access is actually decided.",
    category: "roles",
    roles: ["admin", "management", "coordinator", "teacher", "parent", "platform"],
    keywords: ["roles", "permissions", "rbac", "access", "who can", "admin", "management"],
    intro: [
      "Smart ARK has six roles. Five of them work inside an organization; the sixth operates the platform itself.",
      "Access is not decided by the role name alone. Each role has a set of granted modules, and Management can adjust those grants per role — so what a Coordinator can reach at one institution may differ from another.",
    ],
    steps: [
      { title: "Admin", body: "Day-to-day operations across the institution: students, staff, attendance, fees, setup and settings." },
      { title: "Management", body: "Everything Admin can do, plus the commercial and configuration surface — payroll, billing, branding, and adjusting what other roles may access." },
      { title: "Coordinator", body: "Academic coordination for the classes and staff assigned to them: scheduling, attendance oversight, tasks and their own students." },
      { title: "Teacher", body: "Their own classes: marking attendance, entering marks, their tasks and their own check-in." },
      { title: "Parent", body: "A separate portal showing only their own linked children." },
      { title: "Platform Admin", body: "Operates Smart ARK as a service — organizations, plans, provisioning. Not part of any single institution." },
    ],
    callouts: [
      { kind: "important", body: "A Parent is not a staff role with fewer permissions. The parent portal is a separate surface, and a parent can only reach records for children explicitly linked to them." },
      { kind: "note", body: "To see or change what a role can reach, open Staff / User → Manage Staff Role." },
    ],
    faq: [
      { q: "Can one person hold two roles?", a: "A user has one role in one organization. Broader access is granted by adjusting that role's modules rather than by holding a second account." },
      { q: "Who can change permissions?", a: "Management, through Manage Staff Role." },
    ],
    related: ["role-admin", "role-management", "role-coordinator", "role-teacher", "role-parent", "multi-tenancy"],
    permissions: ["staff.rights"],
    sourceModules: ["src/features/rbac/constants/catalog.ts", "src/core/navigation/menu.config.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "role-admin",
    title: "Admin guide",
    description: "Running daily operations: students, staff, attendance and fees.",
    category: "roles",
    roles: ["admin"],
    keywords: ["admin", "administrator", "daily", "operations", "guide"],
    intro: [
      "Admin is the operational role. Most of what happens on a normal day — a new admission, marking attendance, taking a fee payment — is done here.",
    ],
    steps: [
      { title: "Start with the dashboard", body: "Signing in opens the admin dashboard, which surfaces the day's outstanding work." },
      { title: "Handle admissions", body: "New enquiries arrive from your public enquiry form. Convert the ones that enrol into student records." },
      { title: "Keep attendance current", body: "Attendance is the input to most reports and to absence messaging. Marking it late delays both." },
      { title: "Collect fees", body: "Fees → Fee Collection. Receipts are produced immediately and can be sent to the parent automatically." },
      { title: "Maintain setup", body: "New standards, batches, subjects and academic years are all under Setup." },
    ],
    callouts: [
      { kind: "tip", body: "For more than a few new students at once, use Students Import rather than adding them one at a time — it detects families and duplicates." },
    ],
    faq: [
      { q: "Why can I not see payroll?", a: "Payroll is a Management module. If you need it, ask Management to grant it in Manage Staff Role." },
      { q: "Where do enquiries come from?", a: "Your public enquiry form. The link is in Leads → Automation Config." },
    ],
    screenshots: ["admin-dashboard"],
    related: ["organization-setup", "student-import", "fee-collection", "roles-overview"],
    permissions: ["student.add", "student.manage", "fee.collection", "attendance.student_mark"],
    sourceModules: ["src/core/navigation/menu.config.ts", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "role-management",
    title: "Management guide",
    description: "Configuration, payroll, billing and oversight.",
    category: "roles",
    roles: ["management"],
    keywords: ["management", "executive", "payroll", "billing", "branding", "oversight"],
    intro: [
      "Management covers everything Admin does, plus the decisions that shape how the institution runs on Smart ARK: who can access what, how staff are paid, how the organization presents itself, and the subscription.",
    ],
    steps: [
      { title: "Review the dashboard", body: "The management dashboard reports organization-level figures rather than individual records." },
      { title: "Set access", body: "Staff / User → Manage Staff Role decides what each role can reach." },
      { title: "Run payroll", body: "Payroll covers rates, shifts, rules, processing and approval. Salary slips carry your own branding." },
      { title: "Configure communication", body: "Communication Center. Enable the automatic messages you want; nothing sends until you do." },
      { title: "Own the branding", body: "Settings → Branding & White Label, including the logo and colours used on receipts and payslips." },
      { title: "Manage the subscription", body: "Settings → Billing & Subscription." },
    ],
    callouts: [
      { kind: "important", body: "Adjusting a role's modules takes effect for everyone holding that role. Check who that includes before removing access." },
    ],
    faq: [
      { q: "How do I see fee performance?", a: "Reports → Fee Analysis, alongside profit and loss analysis." },
      { q: "Can I stop a coordinator changing attendance?", a: "Yes, through Manage Staff Role." },
    ],
    screenshots: ["management-dashboard"],
    related: ["roles-overview", "document-branding", "communication-automation"],
    permissions: ["staff.rights", "payroll.processing", "settings.branding", "settings.billing"],
    sourceModules: ["src/core/navigation/menu.config.ts", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "role-coordinator",
    title: "Coordinator guide",
    description: "Academic coordination for your assigned classes and staff.",
    category: "roles",
    roles: ["coordinator"],
    keywords: ["coordinator", "scheduling", "classes", "teachers", "allocation"],
    intro: [
      "Coordinators run the academic day: which class meets when, which teacher takes it, and whether attendance and marks are actually being recorded.",
      "The coordinator portal shows the same modules as other staff portals, limited to what Management has granted the coordinator role.",
    ],
    steps: [
      { title: "Check the dashboard", body: "Outstanding academic work for your classes." },
      { title: "Schedule classes", body: "Academics → Scheduling." },
      { title: "Watch attendance", body: "Academics → Monitor shows whether attendance is being marked." },
      { title: "Track workload", body: "Academics → Workload shows how teaching is distributed." },
      { title: "Use tasks", body: "Tasks → Team and Board for coordinating work across staff." },
    ],
    callouts: [
      { kind: "note", body: "Coordinators see the students and staff assigned to them, not necessarily the whole institution. The exact scope is set by Management." },
    ],
    faq: [
      { q: "I cannot see a class I expect to.", a: "Class visibility follows allocation. Ask Management or Admin to check your assignment." },
    ],
    screenshots: ["coordinator-dashboard"],
    related: ["roles-overview"],
    permissions: ["academics.scheduling", "academics.monitor", "academics.workload", "tasks.team"],
    sourceModules: ["src/core/routing/sharedRoutes.tsx", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "role-teacher",
    title: "Teacher guide",
    description: "Your classes, attendance, marks and check-in.",
    category: "roles",
    roles: ["teacher"],
    keywords: ["teacher", "attendance", "marks", "my classes", "check-in"],
    intro: [
      "The teacher portal is deliberately narrow: your classes, your students, your tasks. Most days involve checking in, marking attendance and entering marks.",
    ],
    steps: [
      { title: "Check in", body: "If your institution uses location-verified check-in, allow the location prompt. Otherwise check-in is a single action." },
      { title: "Open your classes", body: "Academics → My Classes." },
      { title: "Mark attendance", body: "Mark it for the class you are teaching. Absence messaging to parents, where enabled, is driven by this." },
      { title: "Enter marks", body: "Enter results for exams you are responsible for." },
      { title: "Work your tasks", body: "Tasks → My Tasks." },
    ],
    callouts: [
      { kind: "important", body: "Marking a student absent may notify their parent automatically, if your institution has enabled absence messaging. Correct mistakes promptly." },
    ],
    faq: [
      { q: "The check-in button asks for my location.", a: "Your institution uses location-verified check-in. Allow the prompt while at the campus." },
      { q: "Can I edit attendance after submitting?", a: "Corrections are possible where your institution permits them; the change is recorded." },
    ],
    screenshots: ["teacher-dashboard"],
    related: ["roles-overview", "checkin-setup"],
    permissions: ["academics.my_classes", "attendance.student_mark", "tasks.my"],
    sourceModules: ["src/core/routing/sharedRoutes.tsx", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "role-parent",
    title: "Parent portal guide",
    description: "Following your child's attendance, results and fees.",
    category: "portals",
    roles: ["parent"],
    keywords: ["parent", "portal", "child", "attendance", "fees", "receipts", "results"],
    intro: [
      "The parent portal shows your own children only. If you have more than one child at the institution, you switch between them.",
      "It is a separate surface from the staff portals — there is no route from it into institutional data.",
    ],
    steps: [
      { title: "Sign in", body: "Use the credentials the institution issued you." },
      { title: "Choose a child", body: "With several children linked, select which one you are viewing." },
      { title: "Review attendance", body: "Day-by-day and monthly summaries." },
      { title: "Check results", body: "Exam results and performance as the institution publishes them." },
      { title: "View fees", body: "What is due, what is paid, and receipts for past payments." },
      { title: "Download reports", body: "Attendance and fee statements can be printed or saved." },
    ],
    callouts: [
      { kind: "important", body: "You can only see children linked to your account. If a child is missing, contact the institution — it is a linking matter, not a settings one." },
      { kind: "note", body: "Documents carry the institution's own branding, not Smart ARK's." },
    ],
    faq: [
      { q: "My child is not listed.", a: "The child has not been linked to your account. Contact the institution's office." },
      { q: "Results are not showing.", a: "Results appear once the institution publishes them. Before that they are visible to staff only." },
      { q: "Can I see another parent's child?", a: "No. Access is restricted to children linked to your account and enforced by the database." },
    ],
    screenshots: ["parent-dashboard", "parent-fees"],
    related: ["roles-overview"],
    permissions: [],
    sourceModules: [
      "src/features/parent-portal/pages/ParentFeesPage.tsx",
      "src/features/parent-portal/pages/ParentReportsPage.tsx",
    ],
    lastVerified: "2026-08-11",
  },

  {
    slug: "role-platform-admin",
    title: "Platform administrator guide",
    description: "Operating Smart ARK as a provider: organizations, plans and provisioning.",
    category: "platform",
    roles: ["platform"],
    keywords: ["platform", "provider", "organizations", "plans", "provisioning", "control plane"],
    intro: [
      "Platform administration is the provider side of Smart ARK. It manages organizations rather than belonging to one.",
      "This is a distinct set of permissions from an organization's own Admin or Management role. An institution's Management cannot reach it, and platform staff do not automatically get access to an institution's records.",
    ],
    steps: [
      { title: "Organizations", body: "Review provisioned organizations and their status." },
      { title: "Plans and pricing", body: "Maintain the plan catalogue and prices that organizations subscribe to." },
      { title: "Provisioning", body: "Watch new signups through to a working environment." },
      { title: "Coupons", body: "Create and manage discount codes." },
    ],
    callouts: [
      { kind: "important", body: "Platform access is for operating the service. Reaching into a tenant's records is a separate, audited action — not a side effect of holding a platform role." },
    ],
    related: ["multi-tenancy", "roles-overview"],
    permissions: [],
    sourceModules: ["src/features/platform/pages/CommercePages.tsx"],
    lastVerified: "2026-08-11",
  },
];
