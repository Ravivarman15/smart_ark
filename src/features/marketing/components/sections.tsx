// ──────────────────────────────────────────────────────────────────────────────
// HOME PAGE SECTIONS
//
// Every section is data-driven: the content lives in a const above the
// component, the component is layout only. That is what keeps twenty sections
// from becoming twenty subtly different card treatments, and it means a copy
// change never touches JSX.
//
// ┌── ON SOCIAL PROOF ─────────────────────────────────────────────────────┐
// │ There is exactly one live customer. So there are no invented logos, no │
// │ written testimonials attributed to people who did not say them, and no │
// │ "10,000+ schools" counter.                                             │
// │                                                                        │
// │ The counters below are PRODUCT facts — modules shipped, portals built, │
// │ tables under row-level security — which are true, checkable, and       │
// │ independently impressive. Fabricated proof on a page aimed at school   │
// │ owners and investors is fraud with a gradient on it, and it is also    │
// │ the fastest way to lose the first customer who asks for a reference.   │
// │                                                                        │
// │ /customers already states this policy in the product's own words. This │
// │ page matches it.                                                       │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Link } from "react-router-dom";
import {
  Users, CalendarCheck, Wallet, GraduationCap, MessageSquare, BarChart3,
  ShieldCheck, Building2, Sparkles, Bot, Bell, Smartphone, Layers,
  Lock, Database, Palette, CreditCard, Plug, ArrowRight, Check, Quote,
  BookOpen, Bus, Boxes, FileSpreadsheet, LifeBuoy, UserCheck, Landmark,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Section, SectionHeading, Eyebrow, Card, FeatureCard, IconChip, CheckList,
  StatGrid, CtaButton, AmbientBackdrop, GradientText, type Stat,
} from "./ui";
import { Reveal, Stagger, StaggerItem, Counter } from "./motion";
import { InteractiveSimulator } from "./InteractiveSimulator";
import { RoiCalculator } from "./RoiCalculator";

// ══════════════════════════════════════════════════════════════════════════
// TRUST BAR
// ══════════════════════════════════════════════════════════════════════════

const CAPABILITY_MARQUEE = [
  "Admissions", "Lead CRM", "Attendance", "Fee structures", "Instalments",
  "Receipts", "Payroll", "Payslips", "Exams", "MCQ engine", "Report cards",
  "WhatsApp", "Email", "Parent portal", "Teacher portal", "Transport",
  "Hostel", "Library", "Inventory", "Finance ledger", "RBAC", "Audit trail",
];

export const TrustBar: React.FC = () => (
  <section className="border-y border-border bg-muted/25 py-8 sm:py-10">
    <div className="mx-auto max-w-6xl px-5 sm:px-6">
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        One platform, every workflow an institution runs on
      </p>
    </div>
    {/* Marquee. Duplicated once and translated -50%, so the loop is seamless
        without measuring anything. aria-hidden because the same capabilities
        are listed as real text in the modules section below. */}
    <div className="mk-fade-edges relative mt-6 overflow-hidden" aria-hidden>
      <div
        className="mk-marquee-track flex w-max gap-2.5"
        style={{ ["--mk-marquee-duration" as string]: "56s" }}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 gap-2.5">
            {CAPABILITY_MARQUEE.map((c) => (
              <span
                key={c}
                className="whitespace-nowrap rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ══════════════════════════════════════════════════════════════════════════
// STATS — product facts, not invented customer counts
// ══════════════════════════════════════════════════════════════════════════

const STATS: Stat[] = [
  { value: 20, suffix: "+", label: "Deep modules", note: "One database, one login" },
  { value: 6, label: "Role-specific portals", note: "Staff, parent and platform" },
  { value: 167, label: "Tables under RLS", note: "Isolation in the database" },
  { value: 14, label: "Day free trial", note: "No card required" },
];

export const StatsBand: React.FC = () => (
  <Section tone="muted" className="!py-12 sm:!py-16">
    <StatGrid stats={STATS} />
    <Reveal delay={0.1}>
      <p className="mt-8 text-center text-[11px] text-muted-foreground">
        Product facts, not customer counts. We publish customer numbers only with
        permission —{" "}
        <Link to="/customers" className="underline underline-offset-2 hover:text-foreground">
          read why
        </Link>
        .
      </p>
    </Reveal>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// WHY SMART ARK — problems, not features
// ══════════════════════════════════════════════════════════════════════════

const PROBLEMS = [
  {
    icon: Users,
    problem: "Enquiries lost between the phone call and the admission",
    solution: "Lead CRM with SLA timers, follow-up reminders and WhatsApp automation",
  },
  {
    icon: Wallet,
    problem: "Fee dues tracked in a spreadsheet nobody trusts",
    solution: "Structures, instalments, receipts and reminders — reconciled to the ledger",
  },
  {
    icon: GraduationCap,
    problem: "Salaries calculated by hand every month",
    solution: "Payroll with rates, shifts, approval workflow and emailed payslips",
  },
  {
    icon: BarChart3,
    problem: "Management with no reliable number to decide on",
    solution: "Executive dashboards, daily reports and 360° student records",
  },
];

export const WhySection: React.FC = () => (
  <Section id="why">
    <SectionHeading
      eyebrow={<><Sparkles className="h-3 w-3 text-accent" /> Why institutions switch</>}
      title={<>The problems, not the <GradientText>feature list</GradientText></>}
      description="Most institutions do not lack software. They lack one place where the numbers agree."
    />
    <Stagger as="ul" className="mt-12 grid gap-4 sm:grid-cols-2">
      {PROBLEMS.map((p) => (
        <StaggerItem as="li" key={p.problem}>
          <Card interactive className="h-full p-5 sm:p-6">
            <IconChip icon={p.icon} tone="destructive" />
            <h3 className="mt-4 text-[15px] font-semibold leading-snug">{p.problem}</h3>
            <div className="mt-3 flex items-start gap-2 rounded-[--mk-radius-md] bg-emerald-500/[0.06] p-3">
              <Check
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                strokeWidth={3}
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-muted-foreground">{p.solution}</p>
            </div>
          </Card>
        </StaggerItem>
      ))}
    </Stagger>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// ERP MODULES
// ══════════════════════════════════════════════════════════════════════════

const MODULES = [
  { icon: Users, title: "Admissions & Lead CRM", body: "Capture from ads and landing pages, score, assign, and never lose a follow-up." },
  { icon: CalendarCheck, title: "Attendance governance", body: "Period locks, month closing, audit trail and automatic absentee alerts to parents." },
  { icon: Wallet, title: "Fees & finance", body: "Structures, instalments, receipts, refunds — auto-synced into the finance ledger." },
  { icon: GraduationCap, title: "Exams & results", body: "Manual and MCQ engines, smart mark entry, result sheets and report cards." },
  { icon: Landmark, title: "Payroll", body: "Rates, shifts, teaching-hour salary, approval workflow and emailed payslips." },
  { icon: MessageSquare, title: "WhatsApp & email", body: "Templates, campaigns and event-driven automation, every message queued and logged." },
  { icon: BookOpen, title: "Academics & timetable", body: "Standards, sections, subjects, coordinator allocation and class schedules." },
  { icon: Bus, title: "Transport & hostel", body: "Routes, stops, allocation and occupancy tracked against the student record." },
  { icon: Boxes, title: "Inventory & library", body: "Stock, issue and return, tied to the same permissions as everything else." },
  { icon: FileSpreadsheet, title: "Reports & analytics", body: "Every module reports into one engine — export to Excel or PDF in a click." },
  { icon: LifeBuoy, title: "Help desk & tasks", body: "Internal tickets, SLA timers and task assignment with escalation." },
  { icon: ShieldCheck, title: "Role-based access", body: "Permissions down to individual buttons, with per-user overrides and a full audit." },
];

export const ModulesSection: React.FC = () => (
  <Section tone="muted">
    <SectionHeading
      eyebrow={<><Layers className="h-3 w-3 text-accent" /> One platform</>}
      title="Everything your institution runs on"
      description="Twenty-plus modules that share one database, one login and one set of permissions."
    />
    <Stagger as="ul" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {MODULES.map((mod) => (
        <StaggerItem as="li" key={mod.title}>
          <FeatureCard icon={mod.icon} title={mod.title}>{mod.body}</FeatureCard>
        </StaggerItem>
      ))}
    </Stagger>
    <Reveal delay={0.1} className="mt-10 flex justify-center">
      <CtaButton to="/modules" variant="secondary">Browse the full catalogue</CtaButton>
    </Reveal>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// AI FEATURES
// ══════════════════════════════════════════════════════════════════════════

const AI_FEATURES = [
  {
    icon: Bot,
    title: "Question paper import",
    body: "Paste a paper and it becomes a structured MCQ test — sections, marks and negative marking preserved. Runs locally, so no paper leaves your database.",
  },
  {
    icon: BarChart3,
    title: "Performance insights",
    body: "Attendance and marks read together, so a student sliding in both is surfaced before the parent meeting, not after it.",
  },
  {
    icon: Bell,
    title: "Risk detection",
    body: "Fee overdue, attendance shortfall and unmarked periods raised as work items to the person who can act on them.",
  },
  {
    icon: Sparkles,
    title: "Smart mark entry",
    body: "Enter a whole class from one keyboard-first grid, with validation against the exam's own mark scheme.",
  },
];

export const AiSection: React.FC = () => (
  <Section>
    <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
      <SectionHeading
        align="left"
        eyebrow={<><Sparkles className="h-3 w-3 text-accent" /> AI, where it earns its place</>}
        title={<>Intelligence that does <GradientText>real work</GradientText></>}
        description="No chatbot bolted onto a settings page. The AI here removes specific, repetitive tasks that staff currently do by hand — and where a feature is not built yet, we say so rather than shipping a demo."
      />
      <Stagger as="ul" className="grid gap-4 sm:grid-cols-2">
        {AI_FEATURES.map((f) => (
          <StaggerItem as="li" key={f.title}>
            <FeatureCard icon={f.icon} title={f.title}>{f.body}</FeatureCard>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// COMMUNICATION AUTOMATION
// ══════════════════════════════════════════════════════════════════════════

const COMMS_FLOW = [
  { label: "Event happens", detail: "Attendance marked · fee paid · exam published" },
  { label: "Rule evaluated", detail: "Per-institution settings decide if it sends" },
  { label: "Template rendered", detail: "Approved WhatsApp template with real values" },
  { label: "Queued & delivered", detail: "Retry, delivery receipt, permanent log" },
];

export const CommsSection: React.FC = () => (
  <Section tone="muted">
    <SectionHeading
      eyebrow={<><MessageSquare className="h-3 w-3 text-accent" /> Communication automation</>}
      title="Parents hear from you automatically"
      description="Absentee alerts, fee receipts, exam results and reminders — sent the moment the event happens, from templates you control."
    />

    <Reveal className="mt-12">
      <Card className="mk-hairline relative overflow-hidden p-5 sm:p-8">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-2">
          {COMMS_FLOW.map((s, i) => (
            <li key={s.label} className="group relative flex gap-3 lg:flex-col lg:gap-3">
              {/* Connector — desktop only with glowing light indicator */}
              {i < COMMS_FLOW.length - 1 && (
                <div
                  aria-hidden
                  className="absolute left-[15px] top-9 h-[calc(100%-1rem)] w-px bg-border lg:left-9 lg:top-[15px] lg:h-px lg:w-[calc(100%-2.75rem)]"
                >
                  <span className="hidden lg:block absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/60 to-accent/0 opacity-60 animate-pulse" />
                </div>
              )}
              <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-xs font-semibold text-accent transition-transform duration-300 group-hover:scale-110 group-hover:border-accent/50 group-hover:shadow-sm">
                {i + 1}
              </span>
              <div className="min-w-0 pb-4 lg:pb-0">
                <div className="text-sm font-semibold transition-colors group-hover:text-accent">{s.label}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {s.detail}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-5 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={3} aria-hidden />
            Every message logged against the student
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={3} aria-hidden />
            Automation off by default, on per event
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={3} aria-hidden />
            Failures retried, never silently dropped
          </span>
        </div>
      </Card>
    </Reveal>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// INTERACTIVE WORKFLOW SIMULATOR
// ══════════════════════════════════════════════════════════════════════════

export const InteractiveSection: React.FC = () => (
  <Section id="interactive">
    <SectionHeading
      eyebrow={<><Zap className="h-3 w-3 text-accent" /> Live Simulator</>}
      title={<>Test the workflows before you <GradientText>switch</GradientText></>}
      description="Experience the real-time speed of Smart ARK's parent alerts, fee collection and AI parsing directly in your browser."
    />
    <Reveal className="mt-10">
      <InteractiveSimulator />
    </Reveal>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// ROI CALCULATOR
// ══════════════════════════════════════════════════════════════════════════

export const RoiSection: React.FC = () => (
  <Section id="roi" tone="muted">
    <Reveal>
      <RoiCalculator />
    </Reveal>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// PORTALS — one tabbed section instead of four near-identical ones
// ══════════════════════════════════════════════════════════════════════════

const PORTALS = [
  {
    id: "parent",
    label: "Parent",
    icon: Smartphone,
    title: "Parents see their child, and nothing else",
    body: "A phone-first portal with attendance, marks, fee dues and receipts — scoped by row-level security to their own children.",
    points: [
      "Live attendance and exam results per child",
      "Fee dues, payment history and downloadable receipts",
      "Multiple children under one login",
      "No app install required — it is a website",
    ],
  },
  {
    id: "teacher",
    label: "Teacher",
    icon: UserCheck,
    title: "Teachers get their day, not a database",
    body: "Today's classes, attendance to mark, marks to enter and tasks to close — nothing they do not own.",
    points: [
      "One-tap attendance for the class in front of them",
      "Smart mark entry with per-exam validation",
      "Own leave requests and approval status",
      "Android app for staff, plus the web portal",
    ],
  },
  {
    id: "management",
    label: "Management",
    icon: BarChart3,
    title: "One number, not four spreadsheets",
    body: "Collection, admissions, attendance and payroll on one screen, consolidated across every branch.",
    points: [
      "Executive dashboard with drill-down to the record",
      "Daily report delivered automatically",
      "Cross-branch consolidation without exports",
      "360° student record — academics, fees, attendance, comms",
    ],
  },
  {
    id: "platform",
    label: "Platform",
    icon: Building2,
    title: "Run a group of institutions",
    body: "A separate control plane for multi-institution operators: provisioning, plans, usage and audited support access.",
    points: [
      "Provision a new institution in minutes",
      "Per-institution plans, limits and feature flags",
      "Usage and health across the estate",
      "Support access is time-boxed and fully audited",
    ],
  },
];

export const PortalsSection: React.FC = () => (
  <Section>
    <SectionHeading
      eyebrow={<><Users className="h-3 w-3 text-accent" /> Role-specific portals</>}
      title="Everyone sees exactly their job"
      description="Six portals over one database. What each person can reach is decided by row-level security, not by hiding a menu item."
    />

    <Reveal className="mt-10">
      <Tabs defaultValue="parent">
        {/* Horizontally scrollable on mobile rather than wrapped: a wrapped tab
            row reflows the panel below it as the active tab changes. */}
        <div className="-mx-5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="inline-flex h-auto w-auto gap-1 rounded-[--mk-radius-md] bg-muted/60 p-1">
            {PORTALS.map((p) => (
              <TabsTrigger
                key={p.id}
                value={p.id}
                // h-11: these are the primary way to explore four portals on a
                // phone and measured 36px tall — under the 44px touch minimum.
                className="h-11 gap-1.5 rounded-[--mk-radius-sm] px-3.5 text-[13px] data-[state=active]:shadow-[--mk-shadow-xs]"
              >
                <p.icon className="h-3.5 w-3.5" aria-hidden />
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {PORTALS.map((p) => (
          <TabsContent key={p.id} value={p.id} className="mt-6">
            <Card className="grid gap-6 p-5 sm:p-8 lg:grid-cols-2 lg:gap-10">
              <div>
                <IconChip icon={p.icon} size="lg" />
                <h3 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">
                  {p.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </div>
              <CheckList items={p.points} className="lg:self-center" />
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </Reveal>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — security, multi-tenancy, white label
// ══════════════════════════════════════════════════════════════════════════

const ENTERPRISE = [
  {
    icon: Lock,
    title: "Security by construction",
    body: "Isolation is enforced by PostgreSQL row-level security, not by a filter in the application. A bug in the interface cannot expose another institution's records.",
    to: "/security",
  },
  {
    icon: Database,
    title: "Multi-branch, multi-tenant",
    body: "One branch or fifty. Every record carries its organization identifier and every query is filtered by the database itself. Add a branch without a migration.",
    to: "/features",
  },
  {
    icon: Palette,
    title: "White label",
    body: "Your name, logo, colours and sending identity across every portal, email and PDF. Custom domain with managed TLS on the higher tiers.",
    to: "/pricing",
  },
];

export const EnterpriseSection: React.FC = () => (
  <Section tone="muted">
    <SectionHeading
      eyebrow={<><ShieldCheck className="h-3 w-3 text-accent" /> Enterprise foundation</>}
      title={<>Built like infrastructure, <GradientText>not a website</GradientText></>}
      description="The parts nobody demos and everybody depends on."
    />
    <Stagger as="ul" className="mt-12 grid gap-4 lg:grid-cols-3">
      {ENTERPRISE.map((e) => (
        <StaggerItem as="li" key={e.title}>
          <FeatureCard icon={e.icon} title={e.title} to={e.to}>{e.body}</FeatureCard>
        </StaggerItem>
      ))}
    </Stagger>

    <Reveal delay={0.1} className="mt-4">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconChip icon={CreditCard} tone="muted" />
            <div>
              <h3 className="text-[15px] font-semibold">Billing and payments</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Subscriptions, plans, coupons and GST-compliant invoicing, with Razorpay
                for collection in India. Fee collection inside the ERP reconciles into the
                finance ledger automatically.
              </p>
            </div>
          </div>
          <Link
            to="/pricing"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            Compare plans <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </Card>
    </Reveal>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// INTEGRATIONS
// ══════════════════════════════════════════════════════════════════════════

const INTEGRATIONS = [
  { name: "WhatsApp Business", note: "Template messaging & delivery receipts", live: true },
  { name: "Razorpay", note: "Subscription and fee collection", live: true },
  { name: "Email (SMTP/Brevo)", note: "Transactional mail and payslips", live: true },
  { name: "Excel / CSV", note: "Bulk import and export, every module", live: true },
  { name: "Android app", note: "Staff attendance and daily workflow", live: true },
  { name: "Public API", note: "Read and write your own data", live: false },
];

export const IntegrationsSection: React.FC = () => (
  <Section>
    <SectionHeading
      eyebrow={<><Plug className="h-3 w-3 text-accent" /> Integrations</>}
      title="Connects to what you already use"
      description="And is explicit about what is not built yet."
    />
    <Stagger as="ul" className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {INTEGRATIONS.map((i) => (
        <StaggerItem as="li" key={i.name}>
          <Card interactive className="flex h-full items-start gap-3 p-4">
            <span
              className={cn(
                "mt-1 h-2 w-2 shrink-0 rounded-full",
                i.live ? "bg-emerald-500" : "bg-muted-foreground/40",
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{i.name}</span>
                {!i.live && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Planned
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{i.note}</p>
            </div>
          </Card>
        </StaggerItem>
      ))}
    </Stagger>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// PRICING PREVIEW
// ══════════════════════════════════════════════════════════════════════════

const PLAN_TEASERS = [
  { name: "Starter", students: "300 students", blurb: "One branch, the full core ERP." },
  { name: "Growth", students: "1,000 students", blurb: "White label and higher messaging limits.", featured: true },
  { name: "Professional", students: "5,000 students", blurb: "Five branches, custom domain, priority support." },
];

export const PricingPreview: React.FC = () => (
  <Section tone="muted" id="pricing">
    <SectionHeading
      eyebrow={<><Wallet className="h-3 w-3 text-accent" /> Pricing</>}
      title="Priced per institution, not per seat"
      description="Every plan includes every built module. Tiers differ by capacity and entitlements, so growing does not mean re-buying features."
    />
    <Stagger as="ul" className="mt-12 grid gap-4 lg:grid-cols-3">
      {PLAN_TEASERS.map((p) => (
        <StaggerItem as="li" key={p.name}>
          <Card
            interactive
            className={cn(
              "h-full p-6",
              p.featured && "border-accent/35 shadow-[--mk-shadow-md]",
            )}
          >
            {p.featured && (
              <span className="mb-3 inline-flex rounded-full bg-accent/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                Most chosen
              </span>
            )}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{p.students}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.blurb}</p>
          </Card>
        </StaggerItem>
      ))}
    </Stagger>
    <Reveal delay={0.1} className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
      <CtaButton to="/pricing" variant="secondary">See full pricing</CtaButton>
      <CtaButton to="/compare" variant="ghost">Compare plans</CtaButton>
    </Reveal>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// PROOF — one real story, honestly framed
// ══════════════════════════════════════════════════════════════════════════

export const ProofSection: React.FC = () => (
  <Section>
    <SectionHeading
      eyebrow={<><Quote className="h-3 w-3 text-accent" /> Where it comes from</>}
      title="Built where it is used"
      description="Every workflow here exists because someone needed it on a Tuesday morning."
    />

    <Reveal className="mt-12">
      <Card className="mk-hairline relative overflow-hidden p-6 sm:p-10">
        <AmbientBackdrop />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:gap-12">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-[--mk-radius-md] bg-primary text-sm font-bold text-primary-foreground">
                AL
              </span>
              <div>
                <div className="text-[15px] font-semibold">ARK Learning Arena</div>
                <div className="text-xs text-muted-foreground">
                  Multi-branch coaching institute · Running Smart ARK daily
                </div>
              </div>
            </div>
            <p className="mt-5 text-pretty text-lg leading-relaxed sm:text-xl">
              Smart ARK began as the internal system for one institute. It replaced
              spreadsheets, paper registers and three disconnected subscriptions — and every
              module was built against a real operational need, which is why the workflows
              match how an institute actually works.
            </p>
            <Link
              to="/customers"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              Read the full story <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <ul className="grid grid-cols-3 gap-4 self-center lg:grid-cols-1 lg:gap-6">
            {[
              { value: 134, label: "Students managed" },
              { value: 6590, label: "Attendance records" },
              { value: 1479, label: "Exam results" },
            ].map((s) => (
              <li key={s.label}>
                <div className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  <Counter to={s.value} />
                </div>
                <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground sm:text-xs">
                  {s.label}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-8 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
          We publish customer stories only with permission and with real numbers. Rather
          than fill this page with invented logos and testimonials, it stays short until
          our early customers are ready to be named.
        </p>
      </Card>
    </Reveal>
  </Section>
);

// ══════════════════════════════════════════════════════════════════════════
// FAQ
// ══════════════════════════════════════════════════════════════════════════

export const FAQS = [
  {
    q: "How long does setup take?",
    a: "Under two minutes. Creating your organization automatically provisions your branch, academic year, roles, permissions, standards, subjects and message templates. You import students and start using it the same day.",
  },
  {
    q: "Is my data isolated from other institutions?",
    a: "Yes, and it is enforced in the database rather than in the application. Every record carries an organization identifier, and row-level security policies filter every query. No amount of application-level error can expose one institution's data to another.",
  },
  {
    q: "Do I need a credit card for the trial?",
    a: "No. The 14-day trial requires only an email address, and you can export all of your data at any point, including after the trial ends.",
  },
  {
    q: "Can parents and teachers use it on their phones?",
    a: "Yes. Every portal is mobile-first, and there is an Android app for staff.",
  },
  {
    q: "What happens to our data if we leave?",
    a: "You export it. We retain it for 90 days after cancellation so you can come back, and we never delete data because of a missed payment.",
  },
];

export const FaqSection: React.FC = () => (
  <Section tone="muted">
    <SectionHeading
      eyebrow="FAQ"
      title="Common questions"
      description="If yours is not here, ask us directly — a person answers."
    />
    <Reveal className="mx-auto mt-12 max-w-2xl">
      <div className="divide-y divide-border overflow-hidden rounded-[--mk-radius-lg] border border-border bg-card">
        {FAQS.map((f) => (
          <details key={f.q} className="group">
            {/* min-h-[56px] keeps the whole row a comfortable touch target, and
                the summary is the target — not just the text inside it. */}
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-medium marker:hidden hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
              {f.q}
              <ArrowRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-[--mk-dur] ease-[--mk-ease] group-open:rotate-90 motion-reduce:transition-none"
                aria-hidden
              />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </Reveal>
    <Reveal delay={0.1} className="mt-8 flex justify-center">
      <CtaButton to="/contact" variant="ghost">Ask us anything</CtaButton>
    </Reveal>
  </Section>
);
