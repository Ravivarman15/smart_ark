// ──────────────────────────────────────────────────────────────────────────────
// CONTENT & CONVERSION PAGES
// demo booking · contact · status · blog · help · docs · customers · partners
// resources · about · careers · legal
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck, Loader2, CheckCircle2, CircleDot, AlertTriangle, Search,
  ArrowRight, Clock, Wrench,
} from "lucide-react";
import {
  Section, SectionHeading, CtaBand, ComingSoon, FeatureCard, CardGrid,
} from "../components/MarketingShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSeo } from "../seo/useSeo";
import { ROUTE_SEO, articleJsonLd, breadcrumbJsonLd } from "../seo/seo";
import { marketingService } from "../services/marketing.service";
import { cn } from "@/lib/utils";

// ── Book a demo ─────────────────────────────────────────────────────────────

const TIME_SLOTS = ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];
const SIZES = ["Under 200", "200–500", "500–1,000", "1,000–3,000", "Over 3,000"];

export const DemoPage: React.FC = () => {
  useSeo(ROUTE_SEO["/demo"]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", organizationName: "",
    institutionType: "coaching", studentCount: "200–500",
    preferredDate: "", preferredTime: "11:00", message: "",
  });

  useEffect(() => { void marketingService.trackEvent("page_view", "/demo"); }, []);

  // Earliest bookable date is tomorrow: offering today implies a same-day slot
  // we cannot reliably honour.
  const minDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await marketingService.submitDemoRequest(form);
      void marketingService.trackEvent("demo_request", "/demo");
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Section className="!py-20">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Request received</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We will confirm your slot by email within one working day. If you would
            rather not wait, the free trial takes two minutes and needs no call.
          </p>
          <Button asChild className="mt-6"><Link to="/signup">Start free trial instead</Link></Button>
        </div>
      </Section>
    );
  }

  return (
    <Section hero>
      <div className="grid gap-10 lg:grid-cols-[1fr,1.2fr]">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Book a demo"
            title="See it on your own numbers"
            description="Twenty minutes with someone who runs an institute — not a scripted feature tour."
          />
          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            {[
              ["We ask about your workflow first", "So the demo covers what you actually do, not what we like showing."],
              ["You see the real product", "Not slides. We open the ERP and use it."],
              ["Honest answers", "Including what we have not built yet."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span><strong className="text-foreground">{t}.</strong> {d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p>{error}</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="d-name">Your name</Label>
              <Input id="d-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="d-email">Email</Label>
              <Input id="d-email" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="d-phone">Phone / WhatsApp</Label>
              <Input id="d-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="d-org">Institution name</Label>
              <Input id="d-org" value={form.organizationName}
                onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
            </div>
            <div>
              <Label>Institution type</Label>
              <Select value={form.institutionType} onValueChange={(v) => setForm({ ...form, institutionType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="coaching">Coaching / tuition</SelectItem>
                  <SelectItem value="k12">K-12 school</SelectItem>
                  <SelectItem value="college">College</SelectItem>
                  <SelectItem value="training">Training centre</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Students</Label>
              <Select value={form.studentCount} onValueChange={(v) => setForm({ ...form, studentCount: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="d-date">Preferred date</Label>
              <Input id="d-date" type="date" min={minDate} value={form.preferredDate}
                onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} />
            </div>
            <div>
              <Label>Preferred time (IST)</Label>
              <Select value={form.preferredTime} onValueChange={(v) => setForm({ ...form, preferredTime: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="d-msg">Anything specific you want to see?</Label>
              <Textarea id="d-msg" rows={3} value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
          </div>

          <Button className="mt-5 w-full" onClick={submit}
            disabled={busy || !form.name || !form.email}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarCheck className="mr-2 h-4 w-4" />}
            Request demo
          </Button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            We use your details only to arrange the demo. No newsletter, no reselling.
          </p>
        </div>
      </div>
    </Section>
  );
};

// ── Contact ─────────────────────────────────────────────────────────────────

export const ContactPage: React.FC = () => {
  useSeo(ROUTE_SEO["/contact"]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: "contact", name: "", email: "", subject: "", message: "" });

  const submit = async () => {
    setBusy(true);
    try {
      await marketingService.submitEnquiry(form);
      setSent(true);
    } finally { setBusy(false); }
  };

  return (
    <Section hero>
      <div className="mx-auto max-w-lg">
        <SectionHeading title="Talk to us" description="Sales, support or partnerships — one form, routed by topic." />
        {sent ? (
          <div className="mt-8 rounded-xl border border-border bg-card p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">
              Thanks — we reply within one working day.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4 rounded-xl border border-border bg-card p-6">
            <div>
              <Label>Topic</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">General / sales</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="partner">Partnership</SelectItem>
                  <SelectItem value="careers">Careers</SelectItem>
                  <SelectItem value="press">Press</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="c-name">Name</Label>
              <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label htmlFor="c-subject">Subject</Label>
              <Input id="c-subject" value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            <div><Label htmlFor="c-msg">Message</Label>
              <Textarea id="c-msg" rows={5} value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
            <Button className="w-full" onClick={submit}
              disabled={busy || !form.name || !form.email || !form.message}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Send
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
};

// ── Status ──────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; dot: string; text: string }> = {
  operational:    { label: "Operational",        dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  degraded:       { label: "Degraded performance", dot: "bg-amber-500",  text: "text-amber-600 dark:text-amber-400" },
  partial_outage: { label: "Partial outage",     dot: "bg-orange-500",  text: "text-orange-600 dark:text-orange-400" },
  major_outage:   { label: "Major outage",       dot: "bg-red-500",     text: "text-red-600 dark:text-red-400" },
  maintenance:    { label: "Under maintenance",  dot: "bg-blue-500",    text: "text-blue-600 dark:text-blue-400" },
};

export const StatusPage: React.FC = () => {
  useSeo(ROUTE_SEO["/status"]);
  const { data, isLoading } = useQuery({
    queryKey: ["marketing", "status"],
    queryFn: () => marketingService.status(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const overall = STATUS_STYLE[data?.overall ?? "operational"] ?? STATUS_STYLE.operational;

  return (
    <Section hero>
      <div className="mx-auto max-w-2xl">
        <SectionHeading title="System status" />

        {isLoading ? (
          <div className="mt-8 h-24 animate-pulse rounded-xl border border-border bg-muted/40" />
        ) : !data ? (
          <div className="mt-8 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            <Wrench className="mx-auto mb-2 h-5 w-5" />
            Status is temporarily unavailable. That does not necessarily mean the
            platform is down — check back shortly.
          </div>
        ) : (
          <>
            <div className="mt-8 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", overall.dot)} />
                <span className={cn("font-medium", overall.text)}>
                  {data.overall === "operational" ? "All systems operational" : overall.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Updated {new Date(data.generated_at).toLocaleTimeString()}
              </p>
            </div>

            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {data.components.map((c) => {
                const s = STATUS_STYLE[c.status] ?? STATUS_STYLE.operational;
                return (
                  <div key={c.key} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div>
                      <div className="text-sm font-medium">{c.name}</div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground">{c.description}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                      <span className={cn("text-xs", s.text)}>{s.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <h2 className="mt-10 text-sm font-medium">Recent incidents</h2>
            {!data.incidents?.length ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No incidents in the last 30 days.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {data.incidents.map((i, n) => (
                  <div key={n} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-medium">{i.title}</h3>
                      <span className="text-[11px] capitalize text-muted-foreground">{i.status}</span>
                    </div>
                    {i.body && <p className="mt-1 text-sm text-muted-foreground">{i.body}</p>}
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(i.started_at).toLocaleString()}
                      {i.resolved_at && ` → resolved ${new Date(i.resolved_at).toLocaleTimeString()}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  );
};

// ── Content list / detail (blog, help, docs) ────────────────────────────────

const CONTENT_META = {
  blog: { route: "/blog", heading: "Blog", blurb: "Notes on running an education business well." },
  help: { route: "/help", heading: "Help centre", blurb: "Guides and answers for every module." },
  docs: { route: "/docs", heading: "Documentation", blurb: "Product documentation for administrators and staff." },
} as const;

export const ContentListPage: React.FC<{ kind: "blog" | "help" | "docs" }> = ({ kind }) => {
  const meta = CONTENT_META[kind];
  useSeo(ROUTE_SEO[meta.route]);
  const [q, setQ] = useState("");

  const { data: posts, isLoading } = useQuery({
    queryKey: ["marketing", "content", kind],
    queryFn: () => marketingService.posts(kind),
    staleTime: 5 * 60_000,
  });

  const filtered = (posts ?? []).filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return p.title.toLowerCase().includes(s) || (p.excerpt ?? "").toLowerCase().includes(s);
  });

  return (
    <Section hero>
      <SectionHeading title={meta.heading} description={meta.blurb} />

      <div className="mx-auto mt-8 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={`Search ${meta.heading.toLowerCase()}…`}
            value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${meta.heading}`} />
        </div>
      </div>

      {isLoading ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-muted/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-auto mt-12 max-w-md text-center text-sm text-muted-foreground">
          {posts?.length === 0
            ? "Nothing published here yet. We would rather have an empty page than filler."
            : `Nothing matches “${q}”.`}
        </div>
      ) : (
        <CardGrid className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link
              key={p.id}
              to={`${meta.route}/${p.slug}`}
              className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
            >
              {p.categoryName && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                  {p.categoryName}
                </span>
              )}
              <h2 className="mt-1 font-medium group-hover:underline">{p.title}</h2>
              {p.excerpt && <p className="mt-1.5 text-sm text-muted-foreground">{p.excerpt}</p>}
              <p className="mt-3 text-[11px] text-muted-foreground">
                {p.authorName ? `${p.authorName} · ` : ""}
                {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : ""}
                {p.readingMinutes ? ` · ${p.readingMinutes} min read` : ""}
              </p>
            </Link>
          ))}
        </CardGrid>
      )}
    </Section>
  );
};

export const ContentDetailPage: React.FC<{ kind: "blog" | "help" | "docs" }> = ({ kind }) => {
  const { slug = "" } = useParams();
  const meta = CONTENT_META[kind];

  const { data: post, isLoading } = useQuery({
    queryKey: ["marketing", "content", kind, slug],
    queryFn: () => marketingService.post(kind, slug),
    enabled: !!slug,
  });

  useSeo(
    {
      title: post?.seoTitle ?? post?.title ?? meta.heading,
      description: post?.seoDescription ?? post?.excerpt ?? "",
      path: `${meta.route}/${slug}`,
      type: "article",
      publishedAt: post?.publishedAt ?? undefined,
      author: post?.authorName ?? undefined,
    },
    post
      ? [
          articleJsonLd({
            title: post.title, description: post.excerpt ?? "",
            path: `${meta.route}/${slug}`, publishedAt: post.publishedAt ?? undefined,
            author: post.authorName ?? undefined,
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: meta.heading, path: meta.route },
            { name: post.title, path: `${meta.route}/${slug}` },
          ]),
        ]
      : [],
  );

  if (isLoading) {
    return (
      <Section hero>
        <div className="mx-auto h-64 max-w-2xl animate-pulse rounded-xl bg-muted/40" />
      </Section>
    );
  }
  if (!post) {
    return (
      <Section hero>
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-xl font-semibold">Not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            That article does not exist or has been unpublished.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to={meta.route}>Back to {meta.heading}</Link>
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Section hero>
      <article className="mx-auto max-w-2xl">
        <Link to={meta.route} className="text-xs text-primary hover:underline">
          ← {meta.heading}
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{post.title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {post.authorName ? `${post.authorName} · ` : ""}
          {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ""}
          {post.readingMinutes ? ` · ${post.readingMinutes} min read` : ""}
        </p>
        {post.excerpt && <p className="mt-5 text-lg text-muted-foreground">{post.excerpt}</p>}
        {/* Markdown is rendered as pre-wrapped text rather than through a
            dangerouslySetInnerHTML pipeline. Introducing an HTML renderer for
            operator-authored content is a stored-XSS surface, and it needs a
            sanitiser chosen deliberately — not smuggled in with a blog page. */}
        {post.body && (
          <div className="prose prose-sm mt-8 max-w-none whitespace-pre-wrap text-foreground dark:prose-invert">
            {post.body}
          </div>
        )}
      </article>
    </Section>
  );
};

// ── Simple company pages ────────────────────────────────────────────────────

export const CustomersPage: React.FC = () => {
  useSeo(ROUTE_SEO["/customers"]);
  return (
    <>
      <Section hero>
        <SectionHeading
          eyebrow="Customer stories"
          title="Built where it is used"
          description="Smart ARK runs ARK Learning Arena every day — admissions, attendance, fees, payroll and parent communication."
        />
        <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold">ARK Learning Arena</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A multi-branch coaching institute that replaced spreadsheets, paper registers
            and three disconnected subscriptions with one platform. Every module in the
            product was built against a real operational need there — which is why the
            workflows match how an institute actually works.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            We publish customer stories only with permission and with real numbers. Rather
            than fill this page with invented logos and testimonials, it stays short until
            our early customers are ready to be named.
          </p>
        </div>
      </Section>
      <CtaBand />
    </>
  );
};

export const AboutPage: React.FC = () => {
  useSeo(ROUTE_SEO["/about"]);
  return (
    <>
      <Section hero>
        <SectionHeading
          eyebrow="About"
          title="We build the software we run our own institute on"
          description="Every workflow here exists because someone needed it on a Tuesday morning."
        />
        <div className="mx-auto mt-10 max-w-2xl space-y-4 text-sm text-muted-foreground">
          <p>
            Smart ARK began as the internal system for ARK Learning Arena. It was not
            designed from a market study; it was built one problem at a time by people
            who were living those problems — enquiries lost between the call and the
            admission, fee dues nobody could reconcile, salaries calculated by hand.
          </p>
          <p>
            That origin shapes the product. The attendance module has period locks and an
            override audit because a real coordinator needed to prove what changed. The
            import engine does family-aware duplicate detection because two siblings share
            a mobile number. These are not features anyone would invent in a spec.
          </p>
          <p>
            We are now opening it to other institutions, carefully. That means honest
            limits: we say what is not built, we do not sell modules that do not exist,
            and we would rather lose a deal than mislead someone into it.
          </p>
        </div>
      </Section>
      <CtaBand />
    </>
  );
};

export const CareersPage: React.FC = () => {
  useSeo(ROUTE_SEO["/careers"]);
  return (
    <Section hero>
      <SectionHeading
        eyebrow="Careers"
        title="Help build the operating system for education"
        description="Small team, real users, short feedback loops."
      />
      <div className="mx-auto mt-10 max-w-xl rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          We are not actively hiring right now, and we would rather say so than keep a
          page of evergreen listings. If you want to work on this, write to us anyway —
          we read everything.
        </p>
        <Button asChild className="mt-5"><Link to="/contact">Get in touch</Link></Button>
      </div>
    </Section>
  );
};

export const PartnersPage: React.FC = () => {
  useSeo(ROUTE_SEO["/partners"]);
  return (
    <>
      <Section hero>
        <SectionHeading
          eyebrow="Partners"
          title="Implementation and reseller partnerships"
          description="Education is a regional business. A reference in Chennai sells Chennai."
        />
        <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
          <FeatureCard title="Implementation partners">
            You handle onboarding, data migration and training for institutions in your
            region. We handle the product.
          </FeatureCard>
          <FeatureCard title="Reseller partners">
            You own the customer relationship and the commercials. We provide the platform,
            training and second-line support.
          </FeatureCard>
        </div>
        <div className="mt-8 text-center">
          <Button asChild><Link to="/contact">Apply to partner</Link></Button>
        </div>
      </Section>
    </>
  );
};

export const ResourcesPage: React.FC = () => {
  useSeo(ROUTE_SEO["/resources"]);
  return (
    <Section hero>
      <SectionHeading
        eyebrow="Resources"
        title="Guides and playbooks"
        description="Practical material for running an institution — not gated, no form to fill."
      />
      <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
        {[
          ["Documentation", "How every module works", "/docs"],
          ["Help centre", "Answers to common questions", "/help"],
          ["Blog", "Notes on the business of education", "/blog"],
        ].map(([title, blurb, to]) => (
          <Link key={to} to={to} className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
            <h2 className="font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary">
              Open <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>
    </Section>
  );
};

// ── Legal ───────────────────────────────────────────────────────────────────

const LEGAL: Record<string, { title: string; updated: string; sections: [string, string][] }> = {
  privacy: {
    title: "Privacy policy",
    updated: "15 August 2026",
    sections: [
      ["Who we are", "Smart ARK provides school and institute management software. When an institution uses Smart ARK, that institution is the data controller for its students' and staff data; we are the data processor acting on its instructions."],
      ["What we collect", "For visitors to this website: cookieless, aggregate page-view counts with no cookie, no IP address, no device fingerprint and no personal identifier. For customers: the account details you provide and the operational data you enter into the product."],
      ["Children's data", "Institutions using Smart ARK store data about minors. We treat that as the highest-sensitivity category: encrypted at rest and in transit, isolated per institution at the database level, and never used to train models or shared with third parties for their own purposes."],
      ["Sub-processors", "We use Supabase (database, authentication, storage), Vercel (hosting), Brevo (transactional email) and AiSensy (WhatsApp delivery). A current list with locations is available on request."],
      ["Your rights", "Under India's DPDP Act and comparable regimes you may request access, correction, export or erasure. Institutions can export their full dataset from within the product at any time."],
      ["Retention", "Operational data is retained while the account is active and for 90 days after cancellation, so you can return or export. We never delete data because of a missed payment."],
      ["Contact", "Write to us via the contact page for any privacy question, including data protection officer enquiries."],
    ],
  },
  terms: {
    title: "Terms of service",
    updated: "15 August 2026",
    sections: [
      ["Agreement", "These terms govern use of Smart ARK. By creating an organization you accept them on behalf of your institution."],
      ["Your data", "Your data remains yours. We claim no ownership and will not use it for any purpose other than providing the service to you."],
      ["Acceptable use", "Do not use Smart ARK to store unlawful content, to send unsolicited bulk messages, or in a way that degrades the service for other institutions."],
      ["Availability", "We aim for high availability and publish real status at /status. Paid plans may carry a specific service level, stated in your order."],
      ["Trials", "Trials are 14 days. At expiry the organization becomes read-only rather than being deleted, and export remains available."],
      ["Fees", "Subscription fees are stated exclusive of applicable taxes. Non-payment leads to a grace period, then read-only access, then suspension — never immediate deletion."],
      ["Termination", "Either party may terminate. On termination we retain your data for 90 days for export, then delete it."],
      ["Liability", "Our aggregate liability is limited to the fees paid in the preceding twelve months, to the extent permitted by law."],
    ],
  },
  cookies: {
    title: "Cookie policy",
    updated: "15 August 2026",
    sections: [
      ["Short version", "This marketing website sets no tracking cookies at all. There is no advertising pixel, no analytics cookie and no third-party tracker."],
      ["What we do store", "Local storage holds your light/dark theme preference. Inside the product, an authentication token is stored so you stay signed in. Both are strictly necessary and neither is used for tracking."],
      ["Analytics", "Page views are counted first-party and cookieless: a path, a coarse device class and a date. Nothing that could identify you is recorded, which is why you were not asked to accept anything."],
    ],
  },
};

export const LegalPage: React.FC<{ doc: "privacy" | "terms" | "cookies" }> = ({ doc }) => {
  const d = LEGAL[doc];
  useSeo(ROUTE_SEO[`/${doc}`]);
  return (
    <Section hero>
      <article className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">{d.title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">Last updated {d.updated}</p>
        <div className="mt-8 space-y-6">
          {d.sections.map(([heading, body]) => (
            <section key={heading}>
              <h2 className="font-medium">{heading}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
          This document is written to be readable and accurate, but it is not a substitute
          for legal review. Have your counsel check it against your jurisdiction before
          relying on it commercially.
        </p>
      </article>
    </Section>
  );
};
