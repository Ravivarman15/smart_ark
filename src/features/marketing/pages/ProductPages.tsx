// ──────────────────────────────────────────────────────────────────────────────
// PRODUCT PAGES — features, modules catalogue, solutions, compare, security.
//
// The modules catalogue is generated from MODULE_CATALOG, the same constant the
// RBAC system and the sidebar read. A hand-written marketing copy of the module
// list would drift from the product within one release, and the drift is
// invisible until a prospect asks for something the page promised.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Check, Minus, ShieldCheck, Database, KeyRound, FileLock2,
  Eye, ServerCog, Users, GraduationCap, Building, Briefcase, Landmark, ArrowRight,
} from "lucide-react";
import { Section, SectionHeading, FeatureCard, CtaBand, CheckList, ComingSoon } from "../components/MarketingShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSeo } from "../seo/useSeo";
import { ROUTE_SEO, breadcrumbJsonLd } from "../seo/seo";
import { MODULE_CATALOG } from "@/features/rbac/constants/catalog";
import { marketingService } from "../services/marketing.service";
import { cn } from "@/lib/utils";

// ── Features ────────────────────────────────────────────────────────────────

const FEATURE_GROUPS = [
  {
    title: "Acquisition",
    blurb: "From the first enquiry to a paid admission, with nothing lost in between.",
    items: [
      ["Lead CRM", "Capture from Meta ads, landing pages, walk-ins and calls. Scoring, assignment, SLA timers and escalation."],
      ["Follow-up automation", "Reminders, WhatsApp sequences and demo scheduling, so nobody is chased twice or forgotten once."],
      ["Admissions", "Convert a lead to a student without re-typing anything, including fee assignment."],
      ["Bulk import", "Family-aware duplicate detection, conflict resolution and rollback — because mobile numbers are not unique identifiers."],
    ],
  },
  {
    title: "Academics",
    blurb: "Attendance, exams and results with a governance trail you can defend.",
    items: [
      ["Attendance governance", "Period locks, month closing, override audit and automatic absentee alerts to parents."],
      ["Exams", "Manual and MCQ engines, question banks, smart mark entry, monthly result sheets and report cards."],
      ["Timetable & allocation", "Coordinator-to-staff mapping, class scheduling and teaching-hour tracking."],
      ["Student 360", "One timeline per student: attendance, marks, fees, communication and documents."],
    ],
  },
  {
    title: "Money",
    blurb: "Fees and payroll that reconcile to the ledger without a spreadsheet in between.",
    items: [
      ["Fee management", "Structures, instalments, collections, refunds and receipts with automatic delivery."],
      ["Finance ledger", "Income and expense, budgets, vendors and attachments — fee collections sync automatically."],
      ["Payroll", "Rates, shifts, approval workflow, payslip PDFs and email delivery."],
      ["Reporting", "Collection, outstanding, category and branch reporting with export."],
    ],
  },
  {
    title: "Communication",
    blurb: "One queue, one log, every message accounted for.",
    items: [
      ["WhatsApp automation", "Templates, campaigns and event-driven sends with delivery status."],
      ["Email", "Transactional and campaign email through a verified sender."],
      ["Event automation", "Fee paid, absent, result published, class cancelled — each independently switchable."],
      ["Parent portal", "Attendance, results, fees and documents for a parent's own children only."],
    ],
  },
  {
    title: "Control",
    blurb: "Who can do what, proven rather than assumed.",
    items: [
      ["Role-based access", "Permissions down to individual buttons, with per-user overrides."],
      ["Audit trails", "Attendance overrides, fee edits, payroll approvals and permission changes."],
      ["Four portals", "Management, admin, coordinator and teacher, each with its own home."],
      ["Data isolation", "Enforced by the database, not by a filter in the application."],
    ],
  },
];

export const FeaturesPage: React.FC = () => {
  useSeo(ROUTE_SEO["/features"], [
    breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Features", path: "/features" }]),
  ]);

  return (
    <>
      <Section className="pt-14">
        <SectionHeading
          eyebrow="Features"
          title="Everything an institution actually runs on"
          description="Not a list of buttons. These are the workflows an institute performs every day, built by people who perform them."
        />
      </Section>

      {FEATURE_GROUPS.map((g, i) => (
        <Section key={g.title} muted={i % 2 === 1} className="!py-12">
          <div className="grid gap-8 lg:grid-cols-[1fr,2fr]">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{g.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{g.blurb}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {g.items.map(([title, body]) => (
                <FeatureCard key={title} title={title}>{body}</FeatureCard>
              ))}
            </div>
          </div>
        </Section>
      ))}

      <CtaBand />
    </>
  );
};

// ── Modules catalogue ───────────────────────────────────────────────────────

/** Marketing grouping over the technical catalogue. */
const MODULE_CATEGORY: Record<string, string> = {
  enquiry_leads: "Acquisition", student: "Students", attendance: "Academics",
  academics: "Academics", exam: "Academics", estudy: "Academics",
  live_class: "Academics", fee: "Finance", expense_income: "Finance",
  payroll: "People", staff_user: "People", tasks: "Operations",
  whatsapp: "Communication", reports: "Insights", setup: "Configuration",
  settings: "Configuration", authentication: "Security", help: "Support",
  certificate: "Documents",
};

export const ModulesPage: React.FC = () => {
  useSeo(ROUTE_SEO["/modules"]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const categories = useMemo(
    () => ["All", ...new Set(MODULE_CATALOG.map((m) => MODULE_CATEGORY[m.id] ?? "Other"))].sort(
      (a, b) => (a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)),
    ),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MODULE_CATALOG.filter((m) => {
      const cat = MODULE_CATEGORY[m.id] ?? "Other";
      if (category !== "All" && cat !== category) return false;
      if (!q) return true;
      return (
        m.label.toLowerCase().includes(q) ||
        m.id.includes(q) ||
        m.submodules.some((s) => s.label.toLowerCase().includes(q))
      );
    });
  }, [query, category]);

  const submoduleCount = MODULE_CATALOG.reduce((n, m) => n + m.submodules.length, 0);

  return (
    <>
      <Section className="pt-14">
        <SectionHeading
          eyebrow="Catalogue"
          title="Every module, searchable"
          description={`${MODULE_CATALOG.length} modules covering ${submoduleCount} distinct capabilities. Generated from the product itself, so it is always current.`}
        />

        <div className="mx-auto mt-8 max-w-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search modules and capabilities…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search modules"
            />
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  category === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground" role="status">
          {filtered.length} module{filtered.length === 1 ? "" : "s"}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <div key={m.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">{m.label}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {MODULE_CATEGORY[m.id] ?? "Other"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {m.submodules.length} capabilit{m.submodules.length === 1 ? "y" : "ies"}
              </p>
              <ul className="mt-3 space-y-1">
                {m.submodules.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
                    {s.label}
                  </li>
                ))}
                {m.submodules.length > 5 && (
                  <li className="pl-4.5 text-xs text-muted-foreground/70">
                    +{m.submodules.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Nothing matches “{query}”. <button className="text-primary hover:underline" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</button>
          </p>
        )}
      </Section>
      <CtaBand />
    </>
  );
};

// ── Solutions ───────────────────────────────────────────────────────────────

const SOLUTIONS = [
  {
    id: "coaching", icon: GraduationCap, title: "Coaching & tuition institutes",
    blurb: "Our own origin. Every workflow here was built for this segment first.",
    points: [
      "Batch-based scheduling and attendance",
      "Instalment fee plans with automatic reminders",
      "Test series, ranks and parent result delivery",
      "Enquiry-to-admission funnel with WhatsApp follow-up",
    ],
  },
  {
    id: "k12", icon: Building, title: "K-12 schools",
    blurb: "Class and section structure, term exams, and parent communication at scale.",
    points: [
      "LKG through Class 12 with sections",
      "Term-based examinations and report cards",
      "Parent portal for every family",
      "Staff attendance, leave and payroll",
    ],
  },
  {
    id: "college", icon: Landmark, title: "Colleges",
    blurb: "Department structure, larger cohorts and heavier reporting.",
    points: [
      "Year-based programme structure",
      "Department-level coordinators and permissions",
      "Bulk import and bulk result processing",
      "Consolidated management reporting",
    ],
  },
  {
    id: "training", icon: Briefcase, title: "Training & skill centres",
    blurb: "Short courses, rolling intakes and certification.",
    points: [
      "Rolling batches with independent calendars",
      "Course-wise fee structures",
      "Attendance and completion tracking",
      "Trainer allocation and payment by hours",
    ],
  },
  {
    id: "multi-branch", icon: Users, title: "Multi-branch chains",
    blurb: "Branch autonomy with consolidated oversight.",
    points: [
      "Branch-level roles, data and reporting",
      "Consolidated fee and attendance dashboards",
      "One staff directory across branches",
      "Add a branch without a migration",
    ],
  },
];

export const SolutionsPage: React.FC = () => {
  useSeo(ROUTE_SEO["/solutions"]);
  return (
    <>
      <Section className="pt-14">
        <SectionHeading
          eyebrow="Solutions"
          title="Configured for how you actually operate"
          description="Same platform, different defaults. Your institution type determines the academic structure provisioned on day one."
        />
      </Section>

      {SOLUTIONS.map((s, i) => (
        <Section key={s.id} muted={i % 2 === 0} className="!py-12">
          <div id={s.id} className="grid items-start gap-8 lg:grid-cols-2">
            <div>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">{s.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{s.blurb}</p>
              <Button asChild size="sm" className="mt-5">
                <Link to="/signup">Start free trial <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
              </Button>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <CheckList items={s.points} />
            </div>
          </div>
        </Section>
      ))}

      <CtaBand />
    </>
  );
};

// ── Compare plans ───────────────────────────────────────────────────────────

export const ComparePage: React.FC = () => {
  useSeo(ROUTE_SEO["/compare"]);
  const { data: plans, isLoading } = useQuery({
    queryKey: ["marketing", "plans"],
    queryFn: () => marketingService.plans(),
    staleTime: 10 * 60_000,
  });

  const visible = (plans ?? [])
    .filter((p) => !["trial", "internal"].includes(p.code))
    .sort((a, b) => a.tierOrder - b.tierOrder);

  const ROWS: [string, (p: (typeof visible)[number]) => React.ReactNode][] = [
    ["Students", (p) => (p.maxStudents == null ? "Unlimited" : p.maxStudents.toLocaleString("en-IN"))],
    ["Staff accounts", (p) => (p.maxStaff == null ? "Unlimited" : p.maxStaff)],
    ["Branches", (p) => (p.maxBranches == null ? "Unlimited" : p.maxBranches)],
    ["Storage", (p) => (p.maxStorageMb == null ? "Unlimited" : `${Math.round(p.maxStorageMb / 1024)} GB`)],
    ["WhatsApp / month", (p) => (p.whatsappCredits == null ? "Unlimited" : p.whatsappCredits.toLocaleString("en-IN"))],
    ["Email / month", (p) => (p.emailCredits == null ? "Unlimited" : p.emailCredits.toLocaleString("en-IN"))],
    ["Trial length", (p) => (p.trialDays ? `${p.trialDays} days` : "—")],
    ["Support", (p) => (p.supportLevel === "sla" ? "SLA + named CSM" : p.supportLevel)],
    ["White-label", (p) => (p.allowWhiteLabel ? <Check className="mx-auto h-4 w-4 text-primary" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />)],
    ["Custom domain", (p) => (p.allowCustomDomain ? <Check className="mx-auto h-4 w-4 text-primary" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />)],
    ["Marketplace", (p) => (p.allowMarketplace ? <Check className="mx-auto h-4 w-4 text-primary" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />)],
  ];

  return (
    <>
      <Section className="pt-14">
        <SectionHeading eyebrow="Compare" title="Every plan, side by side" />
        {isLoading ? (
          <div className="mt-10 h-80 animate-pulse rounded-xl border border-border bg-muted/40" />
        ) : (
          <div className="mt-10 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Plan comparison</caption>
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Limit
                  </th>
                  {visible.map((p) => (
                    <th key={p.id} scope="col" className="px-4 py-3 text-center font-semibold">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ROWS.map(([label, render]) => (
                  <tr key={label}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal text-muted-foreground">
                      {label}
                    </th>
                    {visible.map((p) => (
                      <td key={p.id} className="px-4 py-2.5 text-center tabular-nums">{render(p)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <CtaBand />
    </>
  );
};

// ── Security ────────────────────────────────────────────────────────────────

export const SecurityPage: React.FC = () => {
  useSeo(ROUTE_SEO["/security"]);
  return (
    <>
      <Section className="pt-14">
        <SectionHeading
          eyebrow="Security"
          title="How your data is protected"
          description="You are trusting us with records about children. That raises the floor on every decision below."
        />
      </Section>

      <Section muted className="!py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard icon={Database} title="Isolation in the database">
            Every record carries your organization identifier, and PostgreSQL row-level
            security filters every query. A mistake in the interface cannot expose another
            institution's data, because the interface is not what enforces it.
          </FeatureCard>
          <FeatureCard icon={KeyRound} title="Least privilege by default">
            Permissions go down to individual buttons. A teacher sees their own classes; a
            coordinator sees their standards; a parent sees only their own children.
          </FeatureCard>
          <FeatureCard icon={FileLock2} title="Private file storage">
            Documents, payslips and receipts live in private buckets, partitioned by
            organization and served through short-lived signed links — never public URLs.
          </FeatureCard>
          <FeatureCard icon={Eye} title="Audited support access">
            Our staff cannot browse your data. Support access requires a time-boxed,
            reason-tagged session that expires automatically and is permanently logged.
          </FeatureCard>
          <FeatureCard icon={ServerCog} title="Encryption & backups">
            Encrypted in transit and at rest, with point-in-time recovery. We test restores
            rather than assuming them.
          </FeatureCard>
          <FeatureCard icon={ShieldCheck} title="Data protection">
            Aligned with India's DPDP Act. You can export everything at any time, and we
            never delete your data because of a missed payment.
          </FeatureCard>
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold">What we do not claim</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We are not yet SOC 2 or ISO 27001 certified, and we say so rather than implying
            otherwise. An independent penetration test and formal certification are on the
            roadmap. If your procurement process requires either today, talk to us before
            you buy — we would rather lose the deal than mislead you into it.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/contact">Ask a security question</Link>
          </Button>
        </div>
      </Section>

      <CtaBand />
    </>
  );
};

// ── Coming-soon surfaces ────────────────────────────────────────────────────

export const MarketplacePage: React.FC = () => {
  useSeo(ROUTE_SEO["/marketplace"]);
  return (
    <ComingSoon title="Marketplace">
      Themes, integrations, question banks and report packs — built by us and by partners.
      We are not opening a marketplace before there is an ecosystem to fill it; a storefront
      with nothing in it helps nobody.
    </ComingSoon>
  );
};

export const DevelopersPage: React.FC = () => {
  useSeo(ROUTE_SEO["/developers"]);
  return (
    <ComingSoon title="Developer platform">
      A public REST API, outbound webhooks, OAuth and SDKs. We will publish a versioning
      and deprecation policy before the first endpoint ships, because an API without one
      is a promise we cannot keep.
    </ComingSoon>
  );
};
