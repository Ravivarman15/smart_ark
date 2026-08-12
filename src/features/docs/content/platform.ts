import type { DocArticle } from "../types";

// ──────────────────────────────────────────────────────────────────────────────
// PLATFORM SUPER ADMIN ARTICLES
//
// Written against Phase 9A as shipped, not as designed. Two things these
// articles say that a marketing page would not, and that support staff need to
// hear before they act:
//
//   • revoking a module does not delete anything, and
//   • Smart ARK cannot erase a tenant on one click, so "delete" here means a
//     reviewed request and archival is the real terminal state.
//
// Every route quoted below is mounted in src/features/platform/routes.tsx and
// every capability named is a row inserted by the Phase 9A migration.
// ──────────────────────────────────────────────────────────────────────────────

export const PLATFORM_ARTICLES: DocArticle[] = [
  {
    slug: "platform-organizations",
    title: "Managing organizations",
    description: "The Super Admin view of every customer on the platform.",
    category: "platform",
    roles: ["platform"],
    keywords: ["organizations", "tenants", "customers", "super admin", "control plane", "list"],
    intro: [
      "Platform → Organizations lists every organization on Smart ARK with its plan, subscription status, size and a health score. It is the entry point for everything else in this section.",
      "What it deliberately does not show is anyone's data. Student counts and staff counts appear as numbers; names, phone numbers and records do not. Reaching an actual tenant record requires an audited impersonation session, which is a separate, time-boxed action.",
    ],
    before: ["A platform account with the `organizations.read` capability.", "MFA enrolled — a platform session is not issued without it."],
    steps: [
      { title: "Find a customer", body: "Search by name or slug, and narrow with the status, plan and sort filters. The list is the same data the dashboard totals are built from." },
      { title: "Open one", body: "Click the name. The detail page carries tabs for Overview, Modules, Usage, Branches, Activity, Access history and a Danger zone." },
      { title: "Edit platform information", body: "Overview → Edit changes the contact and support fields Smart ARK holds about the customer. It cannot reach their business data — the underlying function names every writable column explicitly." },
      { title: "Export the list", body: "Export writes a CSV of whatever the filters currently show." },
    ],
    whatHappensNext: [
      "Edits are audited with the field names that changed.",
      "If a colleague changed the same organization while your form was open, saving is refused rather than overwriting their work — reload, read their change, then save yours.",
    ],
    callouts: [
      { kind: "note", body: "A shield icon next to an organization marks it as protected. Protected organizations are excluded from every bulk operation." },
      { kind: "important", body: "Member counts are counts. Identities are tenant data and are reachable only through an audited impersonation session." },
    ],
    faq: [
      { q: "Why can I not see a customer's students?", a: "By design. No platform role has an RLS bypass on tenant tables — the control plane reads aggregates only. Use impersonation when you genuinely need to see what a user sees." },
      { q: "What is the health score?", a: "A 0–100 blend of status, adoption, staffing, attendance activity and messaging over the last 30 days. It is a sorting aid, not a judgement." },
    ],
    related: ["platform-lifecycle", "platform-modules", "platform-delete-requests"],
    permissions: ["organizations.read", "organizations.manage"],
    sourceModules: ["src/features/platform/pages/OrganizationsPage.tsx", "src/features/platform/pages/OrganizationDetailPage.tsx"],
    lastVerified: "2026-08-12",
  },

  {
    slug: "platform-lifecycle",
    title: "Hold, suspend, archive and restore",
    description: "The four lifecycle states, what each one closes, and what none of them touch.",
    category: "platform",
    roles: ["platform"],
    keywords: ["hold", "suspend", "archive", "restore", "lifecycle", "status", "pause", "cancel"],
    intro: [
      "An organization's status controls how much of the product its users can reach. Four states matter operationally, and none of them removes a record.",
      "Hold is a reversible commercial pause: sign-in, settings, fees and reports stay open so the customer can understand the state, settle what they owe, and export their own records. Suspend is narrower — enough to sign in and pay. Archive closes everything while retaining all data, and is the terminal state this platform supports. Restore returns an organization to active.",
    ],
    before: ["`organizations.hold` to hold, `organizations.archive` to archive, `organizations.manage` to suspend or restore.", "A reason — the dialog will not proceed without one."],
    steps: [
      { title: "Open the Danger zone", body: "Organization detail → Danger zone lists every available transition with its consequences spelled out." },
      { title: "Read the effects", body: "Each dialog states exactly which modules close and confirms that no record is deleted, archived or altered." },
      { title: "Give a reason", body: "Required for hold, suspend, archive and cancel. Whoever restores the organization later reads it first, so write it for them." },
      { title: "Acknowledge, if protected", body: "A protected organization requires you to type its slug before a destructive transition proceeds. The database enforces this too, so a client that skipped the step would still be refused." },
      { title: "Restore", body: "One click. Hold, suspension and archival timestamps are cleared and modules return to whatever the plan and any overrides allow." },
    ],
    whatHappensNext: [
      "The status change, the previous state and your reason are written to the platform audit log.",
      "Users of that organization see modules disappear on their next page load. Their data is untouched throughout.",
      "Setting an organization to a state it is already in does nothing and writes no audit row.",
    ],
    callouts: [
      { kind: "important", body: "No lifecycle state deletes anything. Students, fees, payroll, exams, attendance, documents, billing history and the audit trail are all retained in every state, including archived." },
      { kind: "tip", body: "Taking export away from a customer you have just paused turns a billing dispute into a data-hostage complaint. That is why Reports survives a hold." },
    ],
    faq: [
      { q: "What is the difference between hold and suspend?", a: "Hold expects the customer back and leaves reporting and export open. Suspend closes down to sign-in, settings and fees. Both are reversible and neither deletes data." },
      { q: "Can I hold a protected organization?", a: "Yes, but you must type its slug to confirm, and it is never swept up by a bulk action. The protection exists to prevent accidents, not to make change impossible." },
      { q: "Does past_due close anything?", a: "No. Overdue invoices are handled by the billing lifecycle's grace period, not by this gate." },
    ],
    related: ["platform-organizations", "platform-modules", "platform-delete-requests"],
    permissions: ["organizations.hold", "organizations.archive", "organizations.manage"],
    sourceModules: ["src/features/platform/components/LifecycleDialog.tsx", "supabase/migrations/20261001_phase9a_platform_control_center.sql"],
    lastVerified: "2026-08-12",
  },

  {
    slug: "platform-modules",
    title: "Granting and revoking modules",
    description: "Module entitlements, plan defaults, overrides and how precedence is decided.",
    category: "platform",
    roles: ["platform"],
    keywords: ["modules", "entitlement", "grant", "revoke", "override", "plan", "feature", "enable", "disable"],
    intro: [
      "Every organization's access to a module is resolved from four layers, in a fixed order: global governance, then organization status, then a Super Admin override, then the plan. Anything none of them mentions is included by default.",
      "The Modules tab on an organization shows the resolved answer AND its source for all twenty modules, so you can tell at a glance whether Payroll is on because the plan includes it or because someone granted it for a trial that expires next month.",
    ],
    before: ["`modules.grant` to enable, `modules.revoke` to disable.", "The customer's plan and status — both outrank an override in one direction or another."],
    steps: [
      { title: "Open Modules", body: "Organization detail → Modules. Modules are grouped by category, each showing its state, the deciding layer and a plain-English explanation." },
      { title: "Grant one", body: "Flip the switch on. Choose permanent or a 14/30/90-day trial, and a reason. A timed grant lapses on its own and returns to the plan default — nothing has to remember to switch it off." },
      { title: "Revoke one", body: "Flip the switch off. The module disappears from the customer's portal and every record it manages stays exactly where it is." },
      { title: "Remove an override", body: "The circular-arrow button next to an overridden module deletes the override and returns that module to whatever the plan says." },
      { title: "Read the badges", body: "\"Overrides plan\" means an override is actively contradicting the subscription — the single most useful thing to know during a billing conversation." },
    ],
    whatHappensNext: [
      "The customer sees the change on their next page load; no re-login is needed.",
      "The change is written to the entitlement history with your name, the reason and any expiry.",
      "Granting a module the organization already has reports \"no change\" rather than a false success.",
    ],
    callouts: [
      { kind: "important", body: "Revoking a module NEVER deletes tenant data. Disable Payroll and every payroll record stays intact; re-enable it and the data is all still there." },
      { kind: "note", body: "Core modules — Students, Staff, Settings, Authentication — cannot be revoked. Switching them off would not produce a cheaper product, only a broken one." },
      { kind: "tip", body: "If a module is locked, the deciding layer is above the organization: a platform-wide withdrawal, or the organization's own status. Change that instead." },
    ],
    faq: [
      { q: "Why can't a customer's Management user re-enable a module I revoked?", a: "Entitlement outranks every tenant role, including management. Management can hand out permissions the organization already owns; it cannot buy a module." },
      { q: "A module says 'Default'. Is that a bug?", a: "No. Plans in this product differ by capacity and support rather than by withheld modules, so a plan that says nothing about a module means it is included." },
      { q: "What happens when a trial grant expires?", a: "It stops applying at the instant it lapses and the module returns to the plan default. A sweeper later tidies the stored row so the console does not show a stale expiry." },
      { q: "Why won't it let me disable Students?", a: "Fees, Exams, Attendance and others read from it. Disabling it would leave those modules loading screens that show nothing, which reads as data loss to whoever is looking at it." },
    ],
    related: ["platform-bulk-modules", "platform-lifecycle", "platform-organizations"],
    permissions: ["modules.grant", "modules.revoke"],
    sourceModules: ["src/features/platform/components/ModuleEntitlementsPanel.tsx", "src/features/platform/modules/entitlements.ts"],
    lastVerified: "2026-08-12",
  },

  {
    slug: "platform-bulk-modules",
    title: "Bulk changes and global module governance",
    description: "Changing many organizations at once, and withdrawing a module platform-wide.",
    category: "platform",
    roles: ["platform"],
    keywords: ["bulk", "governance", "global", "withdraw", "matrix", "many", "all organizations"],
    intro: [
      "Platform → Modules is the global view. The Catalog tab shows every module with how many organizations have it and a switch for platform-wide availability. The Matrix tab is a grid of organizations against modules, showing entitlement state and nothing else.",
      "Both bulk changes and global withdrawals are deliberately harder to perform than a single grant, because their blast radius is every customer at once.",
    ],
    before: ["`modules.bulk` for bulk changes, `modules.govern` for global availability.", "A reason note — neither action proceeds without one."],
    steps: [
      { title: "Select organizations", body: "In the Matrix tab, tick the organizations you want. The header checkbox selects everything currently filtered." },
      { title: "Review the impact", body: "The bulk dialog shows how many are eligible and how many are blocked before you can confirm — protected organizations are named individually." },
      { title: "Apply", body: "Each organization is applied separately, so one failure never aborts the rest and every affected customer gets its own audit entry." },
      { title: "Withdraw a module globally", body: "Catalog tab → toggle a module off. This outranks every plan and every override, everywhere. Use it when a module must come off the board at once — a provider outage, a security issue, a beta being pulled." },
      { title: "Restore it", body: "Toggle it back on. Each organization returns to whatever it had before; nothing was lost." },
    ],
    whatHappensNext: [
      "A bulk change writes one audit row per organization plus a summary row carrying the batch id, so the whole decision can be reviewed — or reversed — as one.",
      "A global withdrawal takes effect immediately for every organization.",
    ],
    callouts: [
      { kind: "important", body: "Protected organizations are excluded from bulk operations outright. To change one, open it individually." },
      { kind: "note", body: "Core modules have no global kill switch. Withdrawing Students platform-wide would take every tenant offline simultaneously." },
    ],
    faq: [
      { q: "How many organizations can one bulk change cover?", a: "Up to 200 per call. Beyond that the request is refused rather than silently truncated." },
      { q: "Does the matrix show customer data?", a: "No. It returns entitlement state, the organization's own name, slug and status — nothing else." },
    ],
    related: ["platform-modules", "platform-audit"],
    permissions: ["modules.bulk", "modules.govern"],
    sourceModules: ["src/features/platform/pages/ModulesPage.tsx"],
    lastVerified: "2026-08-12",
  },

  {
    slug: "platform-delete-requests",
    title: "Delete requests and why there is no delete button",
    description: "What Smart ARK can and cannot erase, and the reviewed request that stands in for it.",
    category: "platform",
    roles: ["platform"],
    keywords: ["delete", "erase", "removal", "gdpr", "dpdp", "archive", "request", "cooling off"],
    intro: [
      "Smart ARK does not offer one-click tenant erasure, and the console says so rather than implying otherwise.",
      "Every `organization_id` foreign key across 167 tables is `ON DELETE RESTRICT`, so a hard delete is not merely dangerous — it fails. A genuine erasure would also have to reach storage objects, billing records and the audit trail that proves what happened. That is a reviewed, manual operation, not a button.",
      "What the console offers instead is a request with a cooling-off period and a two-person review, and — for almost every case that reaches this point — archival, which closes access and retains everything.",
    ],
    before: ["`organizations.delete_request` to open one, `organizations.review_delete` to decide it.", "The organization must not be protected."],
    steps: [
      { title: "Consider archiving first", body: "Archive closes all access and retains every record. It is what most deletion requests actually want, and it is reversible." },
      { title: "Open a request", body: "Danger zone → Request deletion. A reason and the organization's exact slug are required; the slug is verified server-side, not just in the browser." },
      { title: "Wait out the cooling-off period", body: "Seven days by default. Approval before then is refused." },
      { title: "Have a colleague review it", body: "The person who opened a request cannot approve it. Without that rule, request-then-approve is a two-click delete button wearing a costume." },
      { title: "Perform the erasure", body: "Approval marks the request ready. The erasure itself happens outside this console, as a reviewed operation against the database." },
    ],
    whatHappensNext: [
      "Nothing is deleted — not on request, and not on approval.",
      "A second request while one is open returns the existing one rather than creating a duplicate.",
    ],
    callouts: [
      { kind: "important", body: "Approving a delete request does not delete anything. It records that two people agreed the erasure should happen." },
      { kind: "note", body: "Protected organizations cannot have deletion requested at all while their protection row exists." },
    ],
    faq: [
      { q: "A customer has invoked their right to erasure. What do I do?", a: "Open a request with the ticket reference in the reason, have it reviewed, then run the erasure procedure with an engineer. The request is the paper trail; it is not the mechanism." },
      { q: "Can I cancel a request?", a: "Yes, at any point before it is approved, by anyone with the review capability." },
    ],
    related: ["platform-lifecycle", "platform-audit"],
    permissions: ["organizations.delete_request", "organizations.review_delete"],
    sourceModules: ["supabase/migrations/20261001_phase9a_platform_control_center.sql"],
    lastVerified: "2026-08-12",
  },

  {
    slug: "platform-audit",
    title: "Platform audit and Super Admin security",
    description: "What is recorded, who can do what, and why platform staff have no RLS bypass.",
    category: "platform",
    roles: ["platform"],
    keywords: ["audit", "security", "capability", "role", "impersonation", "rls", "bypass", "log"],
    intro: [
      "Every administrative action in the control plane is recorded with the actor, the organization, what changed, the reason and a timestamp. The log is append-only by database trigger, not by convention — the role whose misuse the log exists to record cannot erase the evidence.",
      "The more important property is what platform staff cannot do. No policy on any tenant table grants access to a platform administrator. The control plane reads its own tables and aggregate views; reaching an actual customer record requires a time-boxed, reason-tagged impersonation grant, and that grant makes you into an existing user of that tenant so every normal policy applies unchanged.",
    ],
    before: ["`audit.read` to view the log."],
    steps: [
      { title: "Read the log", body: "Platform → Audit, filterable by action and organization. An organization's own recent entries also appear on its Activity tab." },
      { title: "Check who can do what", body: "Capabilities are rows, not code. Roles differ meaningfully: finance may hold a non-paying customer but may not archive one or touch entitlements; customer success may grant a single module but never in bulk; auditor is read-only and support gains no mutating capability." },
      { title: "Review platform access", body: "An organization's Access history tab lists every impersonation session against it, whether it was ended or expired, and the reason given." },
    ],
    whatHappensNext: [
      "Nothing you do in the control plane is unlogged, including actions that fail.",
      "An action that changes nothing writes no audit row, so the log stays readable.",
    ],
    callouts: [
      { kind: "important", body: "One compromised support account must not equal a breach of every customer at once. That is the whole reason platform administrators have no tenant RLS bypass, and a build-gating test fails if one is ever introduced." },
      { kind: "note", body: "Impersonation requires MFA, an active membership in the target organization, a written reason and a time limit, and it refuses to impersonate another platform employee." },
    ],
    faq: [
      { q: "Can a Super Admin delete audit history?", a: "No. The table is append-only at the database level." },
      { q: "Why can't I just read the customer's table to debug?", a: "Because a SELECT that RLS permits leaves no trace. Impersonation is slower on purpose: it is the version that is accountable." },
    ],
    related: ["platform-organizations", "platform-lifecycle", "platform-bulk-modules"],
    permissions: ["audit.read", "impersonate"],
    sourceModules: ["src/features/platform/pages/OperationsPages.tsx", "supabase/migrations/20260810_phase2a_platform_identity.sql"],
    lastVerified: "2026-08-12",
  },
];
