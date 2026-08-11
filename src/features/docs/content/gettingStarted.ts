import type { DocArticle } from "../types";

// Every `permissions` entry below is a SHIPPED submodule in
// docs/generated/documentation-inventory.json, and every `sourceModules` path
// is a real file. The coverage gate re-checks both on each build.

export const GETTING_STARTED: DocArticle[] = [
  {
    slug: "welcome",
    title: "Welcome to Smart ARK",
    description: "What Smart ARK is, and how the pieces fit together.",
    category: "getting-started",
    roles: ["admin", "management", "coordinator", "teacher", "parent", "platform"],
    keywords: ["what is smart ark", "overview", "introduction", "erp", "platform"],
    intro: [
      "Smart ARK is a multi-tenant ERP for education institutions. Each institution — called an organization — gets its own isolated environment: its own students, staff, fees, attendance, communication and branding. No organization can see another's data.",
      "The product is organised around portals. Which portal you land in depends on your role, and each portal exposes only the modules your role has been granted.",
      "Almost everything is configurable per organization: your name and logo on receipts, whether staff check in with location verification, which WhatsApp messages send automatically, and what a coordinator is allowed to change.",
    ],
    callouts: [
      {
        kind: "note",
        body: "This documentation describes only functionality that is built and reachable today. Where a capability requires setup by your platform provider, the page says so explicitly rather than implying it is ready.",
      },
    ],
    faq: [
      {
        q: "Is my data shared with other institutions using Smart ARK?",
        a: "No. Every record carries an organization id, and the database enforces isolation at the row level — not in application code. A user authenticated to one organization cannot read another's rows even by guessing record ids.",
      },
      {
        q: "Do I need separate logins for each portal?",
        a: "No. One account, one login. Your role determines which portal opens and which modules appear.",
      },
    ],
    related: ["organization-setup", "roles-overview", "multi-tenancy"],
    permissions: [],
    sourceModules: ["src/core/navigation/menu.config.ts", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "organization-setup",
    title: "Set up your organization",
    description: "The order to configure things in, so nothing blocks anything else.",
    category: "getting-started",
    roles: ["admin", "management"],
    keywords: ["setup", "first time", "onboarding", "configure", "academic year", "standards"],
    intro: [
      "Setup has a natural order because later steps depend on earlier ones. Students need a class to be placed in; a class needs an academic year; fees need a structure before they can be assigned.",
      "Working through the sequence below takes most institutions an afternoon. You do not have to finish it in one sitting — each step is independently useful.",
    ],
    before: [
      "You are signed in with an Admin or Management role.",
      "You know your institution's academic year dates and class structure.",
    ],
    steps: [
      { title: "Academic year", body: "Open Setup → Manage Year. Create the current academic year and mark it active. Everything dated — attendance, exams, fees — hangs off this." },
      { title: "Standards and classes", body: "Setup → Assign Standard. Create the classes you actually teach. You can add more later; you do not need the full structure up front." },
      { title: "Subjects", body: "Setup → Assign Subject. Attach subjects to the standards that study them. Exams and result sheets read this mapping." },
      { title: "Batches", body: "Setup → Manage Batch. Batches group students within a standard — useful when one class runs in several sections or timings." },
      { title: "Staff", body: "Staff / User → Manage Staff. Add teachers and coordinators. Each staff member gets a login; you control what they can reach in Manage Staff Role." },
      { title: "Students", body: "Add them individually under Students → Add Student, or in bulk with Students Import. For more than a handful, use the import — it detects families and duplicates." },
      { title: "Fee structures", body: "Fees → Fee Structures. Define what a year costs before assigning it to anyone. A structure can then be assigned to a whole class at once." },
      { title: "Attendance", body: "Decide how attendance is taken and, for staff, whether check-in requires location verification. See Check-in and check-out." },
      { title: "Communication", body: "Communication Center. Turn on the automatic messages you want. Nothing sends until you enable it." },
    ],
    whatHappensNext: [
      "Once an academic year, standards and at least one student exist, the dashboards begin showing real figures instead of empty states.",
      "Fee assignment and attendance become available for the students you have created. Communication automation only fires for events you have enabled.",
    ],
    callouts: [
      { kind: "tip", body: "Import students before assigning fees. Assigning a fee structure to a class covers every student in it in one action, so importing first saves repeating the work." },
      { kind: "warning", body: "An academic year marked active is what most modules filter by. If reports look empty, check that the year is active before assuming data is missing." },
    ],
    faq: [
      { q: "Can I change the academic year later?", a: "Yes. Creating a new year and activating it does not remove the previous year's data — historical records stay attached to the year they were created in." },
      { q: "Do I have to configure everything before using Smart ARK?", a: "No. The minimum to do useful work is an academic year, one standard and one student. Fees, communication and check-in can wait." },
    ],
    related: ["welcome", "student-import", "fee-collection", "checkin-setup"],
    permissions: ["setup.manage_year", "setup.assign_standard", "setup.assign_subject", "setup.manage_batch", "staff.manage", "student.add"],
    sourceModules: [
      "src/features/rbac/constants/catalog.ts",
      "src/core/navigation/menu.config.ts",
    ],
    lastVerified: "2026-08-11",
  },

  {
    slug: "multi-tenancy",
    title: "How organizations stay separate",
    description: "What tenant isolation means in practice, and how it is enforced.",
    category: "security",
    roles: ["admin", "management", "platform"],
    keywords: ["multi-tenant", "isolation", "organization", "rls", "security", "tenant"],
    intro: [
      "Every organization on Smart ARK has its own environment. Students, staff, fees, attendance, messages, documents and branding all belong to exactly one organization.",
      "Isolation is enforced by the database, not by the application. Each record carries an organization id, and row-level security filters every read and write to the organization of whoever is asking. That matters because a bug in a screen cannot leak data past it — the rows are never returned in the first place.",
    ],
    callouts: [
      { kind: "important", body: "A user belongs to one organization. Signing in resolves that organization from your membership, not from anything the browser sends — so a modified request cannot select a different tenant." },
      { kind: "note", body: "Public pages, such as your enquiry form, identify the organization from the link itself. That is why your enquiry link contains your organization's name." },
    ],
    faq: [
      { q: "Can staff at another institution see our students?", a: "No. Reads are filtered to the caller's organization by the database. This is verified by an automated test suite that signs in as one organization and confirms it can see its own records and none of another's." },
      { q: "Who can see across organizations?", a: "Only platform staff, through a separate control plane with its own permissions and audit trail. That access is for billing and support operations and is recorded." },
    ],
    related: ["welcome", "roles-overview"],
    permissions: [],
    sourceModules: ["src/core/tenant/tenant.ts", "src/features/branding/publicTenant.ts"],
    lastVerified: "2026-08-11",
  },
];
