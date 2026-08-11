// ──────────────────────────────────────────────────────────────────────────────
// DOCUMENTATION CONTENT MODEL
//
// Articles are DATA, not JSX. That is what lets the coverage gate read them:
// a page written as a component can only be checked by a human, and a human
// checks it once.
//
// The two load-bearing fields are `permissions` and `sourceModules`. They tie
// every article to something the build can verify still exists — the difference
// between documentation that ages and documentation that rots.
// ──────────────────────────────────────────────────────────────────────────────

export type DocRole =
  | "admin" | "management" | "coordinator" | "teacher" | "parent" | "platform";

export const DOC_ROLES: { id: DocRole; label: string }[] = [
  { id: "admin", label: "Admin" },
  { id: "management", label: "Management" },
  { id: "coordinator", label: "Coordinator" },
  { id: "teacher", label: "Teacher" },
  { id: "parent", label: "Parent" },
  { id: "platform", label: "Platform Admin" },
];

export type DocCategory =
  | "getting-started" | "roles" | "organization" | "students" | "academics"
  | "attendance" | "finance" | "communication" | "portals" | "reports"
  | "billing" | "white-label" | "security" | "platform" | "troubleshooting"
  | "reference";

export const DOC_CATEGORIES: { id: DocCategory; label: string; blurb: string }[] = [
  { id: "getting-started", label: "Getting Started", blurb: "Set up your organization and take it live." },
  { id: "roles", label: "Role Guides", blurb: "What each role can do, and how their day works." },
  { id: "organization", label: "Organization", blurb: "Academic structure, settings and locations." },
  { id: "students", label: "Students", blurb: "Records, import, families and the 360° view." },
  { id: "academics", label: "Academics", blurb: "Classes, scheduling, exams and results." },
  { id: "attendance", label: "Attendance", blurb: "Student and staff attendance, and check-in." },
  { id: "finance", label: "Finance", blurb: "Fee structures, collection, receipts and payroll." },
  { id: "communication", label: "Communication", blurb: "Automation, WhatsApp and delivery." },
  { id: "portals", label: "Portals", blurb: "Parent portal and per-role workspaces." },
  { id: "reports", label: "Reports", blurb: "Analysis, exports and printable documents." },
  { id: "billing", label: "Billing", blurb: "Plans, subscription and payment." },
  { id: "white-label", label: "White Label", blurb: "Branding, documents and domains." },
  { id: "security", label: "Security", blurb: "Access control and tenant isolation." },
  { id: "platform", label: "Platform Admin", blurb: "Operating Smart ARK as a provider." },
  { id: "troubleshooting", label: "Troubleshooting", blurb: "Real problems and how to resolve them." },
  { id: "reference", label: "Reference", blurb: "Glossary and lookup tables." },
];

export interface DocStep {
  title: string;
  body: string;
}

export interface DocCallout {
  kind: "tip" | "important" | "warning" | "note";
  body: string;
}

export interface DocFaq {
  q: string;
  a: string;
}

/**
 * A screenshot the article WOULD use. Referenced by id only — the registry
 * decides whether a real file exists. An article can never embed an image path
 * directly, which is what makes "no fabricated screenshots" enforceable rather
 * than merely intended.
 */
export type DocScreenshotRef = string;

export interface DocArticle {
  slug: string;
  title: string;
  description: string;
  category: DocCategory;
  roles: DocRole[];
  keywords: string[];
  /** Opening prose. Plain paragraphs, rendered as-is. */
  intro: string[];
  /** Prerequisites, if any. */
  before?: string[];
  steps?: DocStep[];
  /** What the system does once the steps are complete. */
  whatHappensNext?: string[];
  callouts?: DocCallout[];
  faq?: DocFaq[];
  screenshots?: DocScreenshotRef[];
  /** Slugs. Validated by the gate — a typo here is a broken link. */
  related?: string[];
  /**
   * RBAC submodule ids this article describes. The gate cross-checks these
   * against the generated inventory: naming an ASPIRATIONAL submodule is a
   * build FAILURE, because it documents a screen nobody can open.
   */
  permissions: string[];
  /** Real file paths. The gate fails if one no longer exists. */
  sourceModules: string[];
  /** ISO date, set when a human last checked this against the code. */
  lastVerified: string;
}
