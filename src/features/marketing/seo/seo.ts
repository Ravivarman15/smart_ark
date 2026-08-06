// ──────────────────────────────────────────────────────────────────────────────
// SEO — metadata, structured data, and an honest note about its limits.
//
// ┌── WHAT THIS DOES AND DOES NOT ACHIEVE ─────────────────────────────────┐
// │ Smart ARK is a Vite SPA. Meta tags written here are applied by         │
// │ JavaScript AFTER the page loads. That is enough for Google, which      │
// │ renders JS — but it is NOT enough for the crawlers that matter most    │
// │ for an India-first product:                                            │
// │                                                                        │
// │   WhatsApp, LinkedIn, Twitter/X, Slack and Facebook DO NOT run JS.     │
// │   They read the HTML as served. A JS-injected og:image produces a      │
// │   bare grey link preview — on the channel where this product is        │
// │   actually shared.                                                     │
// │                                                                        │
// │ scripts/prerender-marketing.mjs therefore emits a REAL static HTML     │
// │ shell per marketing route at build time, carrying the same metadata    │
// │ this module defines, from the same ROUTE_SEO source. Crawlers get      │
// │ served HTML; the SPA hydrates over it for humans.                      │
// │                                                                        │
// │ This is genuinely weaker than server rendering for content that        │
// │ changes between builds (blog posts published without a deploy will     │
// │ lack a prerendered shell until the next build). Migrating the          │
// │ marketing site to its own Next.js app remains the right long-term      │
// │ answer; it is scoped as its own piece of work, not smuggled into a     │
// │ phase about building pages.                                            │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

export const SITE = {
  name: "Smart ARK",
  domain: "https://smartark.ai",
  tagline: "The operating system for your institution",
  description:
    "Run admissions, attendance, fees, exams, payroll and parent communication on one platform. Built by people who run an institute.",
  twitter: "@smartark",
  locale: "en_IN",
} as const;

export interface SeoMeta {
  title: string;
  description: string;
  path: string;
  /** Absolute or root-relative image for social previews. */
  image?: string;
  /** Excluded from robots and the sitemap. */
  noindex?: boolean;
  type?: "website" | "article";
  publishedAt?: string;
  author?: string;
}

/**
 * Metadata for every static marketing route.
 *
 * Single source of truth: the runtime hook AND the build-time prerenderer both
 * read this. Two lists would drift, and the failure mode is silent — a page
 * that looks fine to a human and renders a wrong title in a shared link.
 */
export const ROUTE_SEO: Record<string, SeoMeta> = {
  "/": {
    title: "Smart ARK — Run your entire institution on one platform",
    description:
      "Admissions, attendance, fees, exams, payroll and parent communication in one place. Set up in minutes, not months. Free 14-day trial, no card required.",
    path: "/",
  },
  "/features": {
    title: "Features — Smart ARK",
    description:
      "Lead CRM, admissions, student 360, attendance governance, fee collection, payroll, exams, WhatsApp automation, reports and granular role-based access.",
    path: "/features",
  },
  "/solutions": {
    title: "Solutions by institution type — Smart ARK",
    description:
      "Purpose-built for coaching institutes, K-12 schools, colleges, training centres and multi-branch chains.",
    path: "/solutions",
  },
  "/modules": {
    title: "Module catalogue — Smart ARK",
    description:
      "Browse every module across 19 functional areas. Search by name, filter by category, see exactly what each one does.",
    path: "/modules",
  },
  "/pricing": {
    title: "Pricing — Smart ARK",
    description:
      "Transparent per-institution pricing. Starter, Growth, Professional and Enterprise. 14-day free trial, no card required, export your data any time.",
    path: "/pricing",
  },
  "/compare": {
    title: "Compare plans — Smart ARK",
    description: "Side-by-side comparison of limits, modules and support across every plan.",
    path: "/compare",
  },
  "/demo": {
    title: "Book a demo — Smart ARK",
    description: "See Smart ARK on your own numbers. A 20-minute walkthrough with someone who runs an institute.",
    path: "/demo",
  },
  "/customers": {
    title: "Customer stories — Smart ARK",
    description: "How institutions replaced spreadsheets, WhatsApp groups and paper registers with one platform.",
    path: "/customers",
  },
  "/security": {
    title: "Security & data protection — Smart ARK",
    description:
      "Row-level tenant isolation enforced in the database, encrypted storage, audited support access, and India DPDP alignment.",
    path: "/security",
  },
  "/status": {
    title: "System status — Smart ARK",
    description: "Live status for the application, API, database, storage, realtime, WhatsApp and email delivery.",
    path: "/status",
  },
  "/about": { title: "About — Smart ARK", description: "We build the software we run our own institute on.", path: "/about" },
  "/contact": { title: "Contact — Smart ARK", description: "Talk to sales, support or partnerships.", path: "/contact" },
  "/careers": { title: "Careers — Smart ARK", description: "Help build the operating system for education.", path: "/careers" },
  "/partners": { title: "Partners — Smart ARK", description: "Implementation and reseller partnerships.", path: "/partners" },
  "/resources": { title: "Resources — Smart ARK", description: "Guides, templates and playbooks for running an institution.", path: "/resources" },
  "/blog": { title: "Blog — Smart ARK", description: "Notes on running an education business well.", path: "/blog" },
  "/help": { title: "Help centre — Smart ARK", description: "Guides and answers for every module.", path: "/help" },
  "/docs": { title: "Documentation — Smart ARK", description: "Product documentation for administrators and staff.", path: "/docs" },
  "/marketplace": {
    title: "Marketplace — Smart ARK",
    description: "Themes, integrations, question banks and report packs. Coming soon.",
    path: "/marketplace",
  },
  "/developers": {
    title: "Developers — Smart ARK",
    description: "Public API, webhooks and SDKs. Coming soon.",
    path: "/developers",
  },
  "/privacy": { title: "Privacy policy — Smart ARK", description: "How we handle your data and your students' data.", path: "/privacy" },
  "/terms": { title: "Terms of service — Smart ARK", description: "The terms governing use of Smart ARK.", path: "/terms" },
  "/cookies": { title: "Cookie policy — Smart ARK", description: "What we store in your browser, and why it is very little.", path: "/cookies" },
  // Funnel pages are deliberately noindex: a search result landing straight on
  // step 3 of a wizard is a bad first impression and a wasted crawl budget.
  "/signup": { title: "Start your free trial — Smart ARK", description: "Create your organization in under two minutes.", path: "/signup", noindex: true },
  "/welcome": { title: "Welcome — Smart ARK", description: "Finish setting up your organization.", path: "/welcome", noindex: true },
};

const abs = (p: string) => (p.startsWith("http") ? p : `${SITE.domain}${p}`);

/** Tag descriptors the runtime hook and the prerenderer both consume. */
export function buildMetaTags(meta: SeoMeta): { name?: string; property?: string; content: string }[] {
  const image = abs(meta.image ?? "/og-default.png");
  return [
    { name: "description", content: meta.description },
    { property: "og:type", content: meta.type ?? "website" },
    { property: "og:site_name", content: SITE.name },
    { property: "og:title", content: meta.title },
    { property: "og:description", content: meta.description },
    { property: "og:url", content: abs(meta.path) },
    { property: "og:image", content: image },
    { property: "og:locale", content: SITE.locale },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: SITE.twitter },
    { name: "twitter:title", content: meta.title },
    { name: "twitter:description", content: meta.description },
    { name: "twitter:image", content: image },
    { name: "robots", content: meta.noindex ? "noindex, nofollow" : "index, follow" },
    ...(meta.publishedAt ? [{ property: "article:published_time", content: meta.publishedAt }] : []),
    ...(meta.author ? [{ property: "article:author", content: meta.author }] : []),
  ];
}

// ── Structured data ─────────────────────────────────────────────────────────

export const organizationJsonLd = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE.name,
  url: SITE.domain,
  logo: `${SITE.domain}/logo.png`,
  description: SITE.description,
  sameAs: [] as string[],
});

export const softwareJsonLd = (priceFrom: number) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE.name,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, Android",
  description: SITE.description,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "INR",
    lowPrice: priceFrom,
    offerCount: 4,
  },
});

export const breadcrumbJsonLd = (trail: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map((t, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: t.name,
    item: abs(t.path),
  })),
});

export const faqJsonLd = (faqs: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});

export const articleJsonLd = (m: SeoMeta) => ({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: m.title,
  description: m.description,
  datePublished: m.publishedAt,
  author: { "@type": "Person", name: m.author ?? SITE.name },
  publisher: { "@type": "Organization", name: SITE.name, logo: { "@type": "ImageObject", url: `${SITE.domain}/logo.png` } },
});
