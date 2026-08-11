import type { DocArticle } from "../types";

// Operational modules. These close the largest coverage gaps: attendance (30
// shipped submodules) and payroll (11) alone were more than half of everything
// undocumented. Every `permissions` id below is SHIPPED in the generated
// inventory, and every route quoted is the one recorded there.

export const OPERATIONS_ARTICLES: DocArticle[] = [
  {
    slug: "attendance-overview",
    title: "Attendance",
    description: "How student and staff attendance is recorded, corrected and reported.",
    category: "attendance",
    roles: ["admin", "management", "coordinator", "teacher"],
    keywords: ["attendance", "register", "mark", "absent", "present", "roll call", "daily"],
    intro: [
      "Attendance is the most-used part of the system and feeds several others: absence messaging to parents, attendance percentages on reports, and the figures in a student's 360° view.",
      "It splits into student attendance — who was in class — and staff attendance, which is check-in and check-out. They are configured separately and appear under different menu entries.",
    ],
    before: ["Students exist and are placed in a class.", "An academic year is active."],
    steps: [
      { title: "Mark a class", body: "Attendance → Mark Student Attendance. Choose the class and date, then set each student's status and submit." },
      { title: "Review the register", body: "Attendance → Student Register shows the full period rather than a single day, which is what you want when checking a pattern." },
      { title: "Record a past date", body: "Attendance → Backdated Attendance covers a day that was missed. It is separate from normal marking so a backdated entry is identifiable later." },
      { title: "Correct a mistake", body: "Attendance → Corrections. Corrections are recorded rather than overwriting silently, so a disputed mark has a history." },
      { title: "Check the dashboard", body: "Attendance → Dashboard summarises the day across classes." },
    ],
    whatHappensNext: [
      "Percentages update immediately on student profiles and reports.",
      "If absence messaging is enabled in the Communication Center, parents of absent students are notified — which is why a mis-marked absence should be corrected promptly.",
    ],
    callouts: [
      { kind: "important", body: "Marking a student absent can notify their parent automatically. Correct errors as soon as you spot them." },
      { kind: "note", body: "Corrections are kept as a record rather than replacing the original mark, so the history of a change is visible." },
      { kind: "tip", body: "Use the register rather than day-by-day marking when investigating a pattern — it is far quicker to read." },
    ],
    faq: [
      { q: "Can attendance be marked for a past date?", a: "Yes, through Backdated Attendance. It is deliberately a separate action so backdated entries can be told apart from same-day marking." },
      { q: "Who can correct attendance?", a: "Whoever Management has granted the corrections module to. It is often restricted to Admin and Management." },
      { q: "Why is a class missing?", a: "Attendance follows class allocation. If a teacher cannot see a class, check their allocation rather than their permissions." },
    ],
    screenshots: ["attendance-dashboard"],
    related: ["checkin-setup", "communication-automation", "role-teacher"],
    permissions: [
      "attendance.dashboard", "attendance.student_mark", "attendance.student_register",
      "attendance.student_backdated", "attendance.student_corrections",
    ],
    sourceModules: ["src/features/attendance", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "payroll-overview",
    title: "Payroll",
    description: "From pay rates to an approved run and a branded salary slip.",
    category: "finance",
    roles: ["management"],
    keywords: ["payroll", "salary", "pay", "staff", "slip", "rates", "shifts", "approval"],
    intro: [
      "Payroll turns recorded staff attendance into pay. You configure how staff are paid, run a period, review it, approve it and issue salary slips.",
      "Rates are set in two layers: a rate for a role, and a per-staff rate that overrides it. That way most staff are covered by their role and only exceptions need individual attention.",
    ],
    before: ["Staff records exist.", "Staff attendance for the period has been recorded."],
    steps: [
      { title: "Set role rates", body: "Payroll → Role Rates. The default for everyone holding that role." },
      { title: "Set individual rates", body: "Payroll → Staff Rates, for anyone paid differently from their role default." },
      { title: "Define shifts and rules", body: "Payroll → Shifts and Payroll → Rules, covering expected hours and how overtime, allowances and deductions are treated." },
      { title: "Process a period", body: "Payroll → Processing. The run is calculated from attendance and the configured rates." },
      { title: "Review and approve", body: "Payroll → Approval. Check the figures before approving — approval is what makes the run final." },
      { title: "Issue salary slips", body: "Slips can be printed, downloaded or emailed, and carry your organization's own branding." },
    ],
    whatHappensNext: [
      "Approved runs appear in the salary register and in payroll reports.",
      "Salary slips become available for each staff member in the run.",
    ],
    callouts: [
      { kind: "important", body: "Payroll reads the attendance already recorded for the period. Incomplete attendance produces an incomplete run, so close attendance before processing." },
      { kind: "warning", body: "Approval finalises a run. Review the figures first — reversing an approved run is significantly more work than checking it." },
      { kind: "note", body: "A staff rate overrides the role rate for that person only." },
    ],
    faq: [
      { q: "Why is someone's pay lower than expected?", a: "Most often incomplete attendance for the period, or a staff rate overriding the role rate. Check both before adjusting anything." },
      { q: "Can a slip be reissued?", a: "Yes. Slips are generated from the stored run, so any past period can be reproduced." },
      { q: "Do slips carry our branding?", a: "Yes — the same organization identity as receipts. See Brand your documents." },
    ],
    screenshots: ["payroll-dashboard"],
    related: ["document-branding", "role-management", "attendance-overview"],
    permissions: [
      "payroll.dashboard", "payroll.processing", "payroll.approval",
      "payroll.role_rates", "payroll.staff_rates", "payroll.shifts", "payroll.rules",
    ],
    sourceModules: ["src/features/payroll", "src/features/payroll/components/SalarySlip.tsx"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "enquiries-and-leads",
    title: "Enquiries and admissions",
    description: "Capturing prospective students and moving them through to admission.",
    category: "students",
    roles: ["admin", "management"],
    keywords: ["enquiry", "lead", "admission", "prospect", "counsellor", "apply", "form"],
    intro: [
      "Enquiries are prospective students. They arrive from your public enquiry form or are entered by staff, and are worked through by a counsellor until they either enrol or lapse.",
      "Each institution has its own enquiry link. An enquiry submitted through it belongs to that institution alone and is assigned to one of its own counsellors.",
    ],
    steps: [
      { title: "Share your enquiry link", body: "Leads → Automation Config shows your organization's own link. Publish that one — the generic address cannot identify your institution." },
      { title: "Review incoming enquiries", body: "Enquiries. New submissions appear here." },
      { title: "Assign a counsellor", body: "Assign manually, or let automatic assignment route by course to the counsellor with the lightest load." },
      { title: "Work the enquiry", body: "Record contact and outcomes as the conversation progresses." },
      { title: "Import in bulk", body: "Leads → Bulk Import for a list acquired outside the system." },
    ],
    whatHappensNext: [
      "An assigned enquiry appears on that counsellor's list, and they are notified.",
      "If automatic messaging is enabled, the enquirer receives an acknowledgement naming your institution.",
    ],
    callouts: [
      { kind: "important", body: "Publish the link that ends with your institution's name. The generic enquiry address shows “Institution not found” and delivers nothing." },
      { kind: "note", body: "Counsellor assignment only ever considers counsellors in your own organization." },
    ],
    faq: [
      { q: "Where is our enquiry link?", a: "Leads → Automation Config, and also on the Enquiry Management page." },
      { q: "Why was an enquiry not assigned?", a: "No counsellor is mapped to that course. Unassigned enquiries alert Management so they do not sit unnoticed." },
    ],
    related: ["troubleshoot-enquiry-link", "student-import"],
    permissions: ["enquiry.add", "enquiry.assign", "enquiry.manage", "lead.bulk_import"],
    sourceModules: ["src/features/leads", "src/pages/shared/EnquiryManagement.tsx"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "reports-and-analysis",
    title: "Reports and analysis",
    description: "The built-in analyses and how to export them.",
    category: "reports",
    roles: ["admin", "management"],
    keywords: ["reports", "analysis", "export", "pdf", "excel", "fee analysis", "profit", "admission"],
    intro: [
      "Reports answer recurring questions without anyone building a spreadsheet: where enquiries come from, how admissions are trending, what fees are outstanding, and whether the institution is ahead or behind.",
      "Every report can be printed or exported, and carries your organization's name.",
    ],
    steps: [
      { title: "Open analysis", body: "Reports. The available analyses are listed there." },
      { title: "Filter", body: "Narrow by the period, class or category you care about before exporting." },
      { title: "Export", body: "PDF for circulation, Excel or CSV for further work." },
    ],
    whatHappensNext: [
      "Exports download immediately; PDF output opens a print view so you can save or print it.",
    ],
    callouts: [
      { kind: "note", body: "Reports read live data, so an export reflects the moment it was taken. Note the date when circulating one." },
      { kind: "tip", body: "Fee analysis and profit-and-loss analysis together answer most month-end questions." },
    ],
    faq: [
      { q: "A report looks empty.", a: "Usually the active academic year or the selected period. Widen the filter before concluding data is missing." },
      { q: "Can reports be scheduled?", a: "Not currently — reports are generated on demand." },
    ],
    related: ["fee-collection", "role-management"],
    permissions: [
      "reports.inquiry_analysis", "reports.admission_analysis",
      "reports.fee_analysis", "reports.profit_loss_analysis",
    ],
    sourceModules: ["src/features/reports", "src/features/reports/utils/exportEngine.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "staff-management",
    title: "Staff and access",
    description: "Adding staff, issuing logins and controlling what each role can reach.",
    category: "organization",
    roles: ["admin", "management"],
    keywords: ["staff", "users", "roles", "permissions", "access", "rights", "invite", "login"],
    intro: [
      "Staff records carry both the person's details and their access. Creating a staff member issues a login; what that login can reach is decided by their role.",
      "Roles are configurable. Management can widen or narrow what Admin, Coordinator or Teacher may do, so the same role can differ between institutions.",
    ],
    steps: [
      { title: "Add a staff member", body: "Staff / User → Manage Staff, then add. Enter their details and role." },
      { title: "Issue the login", body: "An account is created for the email you supply, and their credentials are sent to them." },
      { title: "Adjust role access", body: "Staff / User → Manage Staff Role to change what a role can reach." },
      { title: "Review staff attendance", body: "Staff / User → Staff Attendance shows check-in and check-out records." },
    ],
    whatHappensNext: [
      "The staff member can sign in and sees the portal for their role, containing only the modules that role has been granted.",
    ],
    callouts: [
      { kind: "important", body: "Changing a role's access affects everyone holding that role, not one person. Check who that includes first." },
      { kind: "warning", body: "Removing a staff member removes their login. Where their historical records must be kept, deactivate rather than delete." },
    ],
    faq: [
      { q: "A staff member did not receive their credentials.", a: "Check the address on their record. Credentials can be reissued from the same screen." },
      { q: "Can one person have two roles?", a: "No. Widen their role's access instead of creating a second account." },
    ],
    screenshots: ["staff-management"],
    related: ["roles-overview", "checkin-setup"],
    permissions: ["staff.manage", "staff.create", "staff.rights", "staff.attendance"],
    sourceModules: ["src/features/staff", "src/features/staff/components/CreateStaffSheet.tsx"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "academic-structure",
    title: "Academic setup",
    description: "Years, standards, subjects, batches, course types and the timetable.",
    category: "organization",
    roles: ["admin", "management"],
    keywords: ["setup", "academic year", "standard", "class", "subject", "batch", "timetable", "course"],
    intro: [
      "Academic setup is the scaffolding everything else hangs from. Students are placed in standards, exams are set against subjects, and attendance is taken per class.",
      "It is worth getting the year and the standards right at the start; the rest can be added as you go.",
    ],
    steps: [
      { title: "Academic year", body: "Setup → Manage Year. Create and activate the current year." },
      { title: "Standards", body: "Setup → Assign Standard for the classes you teach." },
      { title: "Subjects", body: "Setup → Assign Subject, attaching subjects to the standards that study them." },
      { title: "Batches", body: "Setup → Manage Batch for groups within a standard." },
      { title: "Course types", body: "Setup → Manage Course Type, where your offering is organised by programme." },
      { title: "Timetable", body: "Setup → Timetable for when classes meet." },
    ],
    whatHappensNext: [
      "Students can be placed, exams created against subjects, and attendance taken per class.",
    ],
    callouts: [
      { kind: "important", body: "Most modules filter by the ACTIVE academic year. A report that looks empty is often looking at the wrong year." },
      { kind: "tip", body: "Create only the standards you actually teach. An unused standard is one more thing in every dropdown." },
    ],
    faq: [
      { q: "Can we run two academic years at once?", a: "One year is active at a time. Previous years keep their data and stay readable." },
      { q: "What is the difference between a standard and a batch?", a: "A standard is the class — Class 8. A batch is a group inside it, for a section or a timing." },
    ],
    related: ["organization-setup", "student-import"],
    permissions: [
      "setup.manage_year", "setup.assign_standard", "setup.assign_subject",
      "setup.manage_batch", "setup.manage_course_type", "setup.timetable",
    ],
    sourceModules: ["src/features/setup", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "income-and-expenses",
    title: "Income and expenses",
    description: "Recording money in and out beyond student fees.",
    category: "finance",
    roles: ["admin", "management"],
    keywords: ["expense", "income", "finance", "categories", "profit", "loss", "accounts"],
    intro: [
      "Fees cover money from students. Income and expenses cover everything else — rent, salaries paid out, equipment, and any other income the institution receives.",
      "Together with fees, they are what the profit-and-loss analysis reads.",
    ],
    steps: [
      { title: "Set up categories", body: "Setup → Expense Categories, so entries group meaningfully in reports." },
      { title: "Record an expense", body: "Expenses. Choose a category, enter the amount and date, and attach a document if you have one." },
      { title: "Record other income", body: "Same screen, recorded as income." },
      { title: "Review", body: "Reports → Profit and Loss Analysis." },
    ],
    callouts: [
      { kind: "tip", body: "Agree the category list before recording much, since changing it later means revisiting past entries." },
      { kind: "note", body: "Fee payments arrive here automatically as income — do not enter them a second time." },
    ],
    faq: [
      { q: "Should fee collections be recorded as income here?", a: "No. Fee payments already flow through automatically. Entering them again double-counts." },
    ],
    related: ["reports-and-analysis", "fee-collection"],
    permissions: ["expense.manage_type", "expense.add", "expense.manage", "income.add", "income.manage"],
    sourceModules: ["src/features/finance", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "tasks-and-workload",
    title: "Tasks",
    description: "Assigning work to staff and seeing how it is distributed.",
    category: "organization",
    roles: ["admin", "management", "coordinator", "teacher"],
    keywords: ["tasks", "workload", "board", "assign", "team", "todo"],
    intro: [
      "Tasks track work that is not attendance or marking — following up an enquiry, preparing a report, chasing a fee.",
      "Staff see their own tasks; coordinators and management see the team view and how work is spread.",
    ],
    steps: [
      { title: "See your work", body: "Tasks → My Tasks." },
      { title: "See the team's", body: "Tasks → Team Tasks, for work assigned across staff." },
      { title: "Use the board", body: "Tasks → Board, arranged by status rather than as a list." },
      { title: "Check distribution", body: "Tasks → Workload, showing who is carrying how much." },
    ],
    callouts: [
      { kind: "tip", body: "Workload is the quickest way to spot one person absorbing everything." },
    ],
    faq: [
      { q: "Can a task be assigned to several people?", a: "A task has one owner. Use separate tasks for separate people so completion is unambiguous." },
    ],
    related: ["role-coordinator", "role-teacher"],
    permissions: ["tasks.my", "tasks.team", "tasks.board", "tasks.workload", "tasks.dashboard"],
    sourceModules: ["src/features/tasks", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "class-allocation",
    title: "Class allocation and faculty analytics",
    description: "Assigning teachers to classes and reviewing teaching load.",
    category: "academics",
    roles: ["management", "coordinator"],
    keywords: ["allocation", "teacher", "assign", "class", "faculty", "analytics", "workload"],
    intro: [
      "Allocation decides which teacher takes which class. It drives what a teacher sees when they sign in — their classes, their students, their attendance to mark.",
      "Faculty analytics reports on the result: how teaching is distributed and how consistently classes are being run.",
    ],
    steps: [
      { title: "Allocate", body: "Academics → Allocation. Assign teachers to standards and classes." },
      { title: "Review load", body: "Academics → Faculty Analytics." },
      { title: "Adjust", body: "Reallocate where the distribution is uneven. Changes take effect for the teacher immediately." },
    ],
    whatHappensNext: [
      "An allocated teacher sees the class in My Classes and can mark its attendance and enter its marks.",
    ],
    callouts: [
      { kind: "important", body: "A teacher who cannot see an expected class is almost always an allocation issue, not a permissions one. Check allocation first." },
    ],
    faq: [
      { q: "Can two teachers share a class?", a: "Yes, where your institution runs it that way. Both then see it in My Classes." },
    ],
    related: ["role-coordinator", "role-teacher", "attendance-overview"],
    permissions: ["academics.allocation", "academics.analytics", "academics.my_classes"],
    sourceModules: ["src/features/allocation", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },
];
