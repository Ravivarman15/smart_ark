import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Users, CalendarCheck, Wallet, GraduationCap, MessageSquare,
  BarChart3, ShieldCheck, Building2, Zap,
} from "lucide-react";
import {
  Section, SectionHeading, FeatureCard, CtaBand, CheckList,
} from "../components/MarketingShell";
import { Button } from "@/components/ui/button";
import { useSeo } from "../seo/useSeo";
import { ROUTE_SEO, organizationJsonLd, softwareJsonLd, faqJsonLd } from "../seo/seo";
import { marketingService } from "../services/marketing.service";
import { DashboardPreview } from "../components/DashboardPreview";

/**
 * The four problems this product actually solves, in the customer's words.
 *
 * Deliberately problem-first rather than feature-first: the incumbent is not a
 * competitor's ERP, it is spreadsheets and WhatsApp groups. You beat that by
 * naming the pain, not by listing modules.
 */
const PROBLEMS = [
  {
    problem: "Enquiries lost between the phone call and the admission",
    solution: "Lead CRM with SLA timers, follow-up reminders and WhatsApp automation",
    icon: Users,
  },
  {
    problem: "Fee dues tracked in a spreadsheet nobody trusts",
    solution: "Structures, instalments, receipts and automatic reminders — reconciled to the ledger",
    icon: Wallet,
  },
  {
    problem: "Salaries calculated by hand every month",
    solution: "Payroll with rates, shifts, approval workflow and emailed payslips",
    icon: GraduationCap,
  },
  {
    problem: "Management with no reliable number to decide on",
    solution: "Executive dashboards, daily reports and 360° student records",
    icon: BarChart3,
  },
];

const MODULE_HIGHLIGHTS = [
  { icon: Users, title: "Admissions & Lead CRM", body: "Capture from ads and landing pages, score, assign, and never lose a follow-up." },
  { icon: CalendarCheck, title: "Attendance governance", body: "Period locks, month closing, audit trail and automatic absentee alerts to parents." },
  { icon: Wallet, title: "Fees & finance", body: "Structures, instalments, receipts, refunds — auto-synced into the finance ledger." },
  { icon: GraduationCap, title: "Exams & results", body: "Manual and MCQ engines, smart mark entry, result sheets and report cards." },
  { icon: MessageSquare, title: "WhatsApp & email", body: "Templates, campaigns and event-driven automation, every message queued and logged." },
  { icon: ShieldCheck, title: "Role-based access", body: "Permissions down to individual buttons, with per-user overrides and a full audit." },
];

const STATS = [
  { value: "20+", label: "Deep modules" },
  { value: "4", label: "Role-specific portals" },
  { value: "< 2 min", label: "Setup time" },
  { value: "14 days", label: "Free trial, no card" },
];

const FAQS = [
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

const HomePage: React.FC = () => {
  useSeo(ROUTE_SEO["/"], [organizationJsonLd(), softwareJsonLd(2999), faqJsonLd(FAQS)]);

  useEffect(() => {
    void marketingService.trackEvent("page_view", "/");
  }, []);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section className="pt-14 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <Link
            to="/features"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Zap className="h-3 w-3 text-primary" />
            Built and run daily at a real institute
            <ArrowRight className="h-3 w-3" />
          </Link>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Run your entire institution
            <span className="block text-muted-foreground">on one platform.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Admissions to attendance to fees to payroll — without the spreadsheets,
            the WhatsApp groups, or the three disconnected subscriptions.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/signup" onClick={() => void marketingService.trackEvent("cta_click", "/signup")}>
                Start free trial <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/demo">Book a 20-minute demo</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            14-day trial · no card required · setup in 2 minutes · export any time
          </p>
        </div>

        <div className="mt-14">
          <DashboardPreview />
        </div>
      </Section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <Section muted className="!py-10">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <dt className="sr-only">{s.label}</dt>
              <dd>
                <span className="block text-2xl font-semibold tracking-tight sm:text-3xl">{s.value}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{s.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ── Problems ─────────────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="Why institutions switch"
          title="The problems, not the feature list"
          description="Most institutions do not lack software. They lack one place where the numbers agree."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {PROBLEMS.map((p) => (
            <div key={p.problem} className="rounded-xl border border-border bg-card p-5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-destructive/10 text-destructive">
                <p.icon className="h-4 w-4" />
              </span>
              <h3 className="mt-3 font-medium">{p.problem}</h3>
              <p className="mt-1.5 flex items-start gap-2 text-sm text-muted-foreground">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                {p.solution}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Modules ──────────────────────────────────────────────────────── */}
      <Section muted>
        <SectionHeading
          eyebrow="One platform"
          title="Everything your institution runs on"
          description="Twenty-plus modules that share one database, one login and one set of permissions."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_HIGHLIGHTS.map((m) => (
            <FeatureCard key={m.title} icon={m.icon} title={m.title}>
              {m.body}
            </FeatureCard>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button asChild variant="outline">
            <Link to="/modules">Browse the full catalogue <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
        </div>
      </Section>

      {/* ── Multi-branch ─────────────────────────────────────────────────── */}
      <Section>
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Built for growth"
              title="One branch or fifty"
              description="Branch-level data, roles and reporting, with a consolidated view for management."
            />
            <div className="mt-6">
              <CheckList
                items={[
                  "Every record is isolated at the database level, not by a filter in the app",
                  "Coordinators see their standards; teachers see their classes",
                  "Consolidated fee, attendance and payroll reporting across branches",
                  "Add a branch without a migration or a support ticket",
                ]}
              />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <Building2 className="h-8 w-8 text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              Tenant isolation is enforced by row-level security in PostgreSQL. Every
              query carries your organization identifier and is filtered by the
              database itself — so a bug in the interface cannot expose another
              institution's records.
            </p>
            <Link
              to="/security"
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              How we protect your data <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Section muted>
        <SectionHeading title="Common questions" />
        <div className="mx-auto mt-10 max-w-2xl divide-y divide-border rounded-xl border border-border bg-card">
          {FAQS.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
};

export default HomePage;
