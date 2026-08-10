// ──────────────────────────────────────────────────────────────────────────────
// MARKETING SERVICE
//
// The only data layer the public site touches. Every read here is either
// PUBLISHED data (plans, blog posts, status) or a WRITE-ONLY submission
// (demo requests, enquiries, analytics).
//
// It cannot read a submitted form back — `platform_demo_requests` has an
// INSERT policy for anon and no SELECT policy, so a competitor cannot
// enumerate our sales pipeline even with the anon key in hand. That key ships
// in the bundle; the boundary is the policy, never the client.
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { AppError } from "@/shared/services";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  tierOrder: number;
  trialDays: number;
  supportLevel: string;
  maxStudents: number | null;
  maxStaff: number | null;
  maxBranches: number | null;
  maxStorageMb: number | null;
  whatsappCredits: number | null;
  emailCredits: number | null;
  allowWhiteLabel: boolean;
  allowCustomDomain: boolean;
  allowMarketplace: boolean;
  prices: { interval: string; amount: number; currency: string; taxPercent: number }[];
  features: Record<string, boolean>;
}

export interface DemoRequestInput {
  name: string;
  email: string;
  phone?: string;
  organizationName?: string;
  institutionType?: string;
  studentCount?: string;
  preferredDate?: string;
  preferredTime?: string;
  message?: string;
}

export interface ContentPost {
  id: string;
  slug: string;
  kind: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  coverUrl: string | null;
  tags: string[];
  readingMinutes: number | null;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  authorName: string | null;
  categoryName: string | null;
}

export interface StatusSnapshot {
  overall: string;
  components: { key: string; name: string; description: string | null; status: string }[];
  incidents: {
    title: string; body: string | null; severity: string; status: string;
    started_at: string; resolved_at: string | null;
  }[];
  generated_at: string;
}

const str = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => (v == null ? null : Number(v));

/** Capture UTM parameters once so attribution survives in-site navigation. */
function currentUtm(): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref"]) {
    const v = p.get(k);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

class MarketingService {
  // ── Plans ──────────────────────────────────────────────────────────────
  /**
   * The public plan catalogue.
   *
   * Read from the SAME `plans` table the control plane manages — the pricing
   * page is never a hardcoded copy. A plan edited in Phase 2 shows here on the
   * next load, which is the entire reason plans are data and not code.
   */
  async plans(): Promise<PublicPlan[]> {
    // Explicit column lists, not `select("*")`.
    //
    // This is the first paint of the pricing page for an anonymous visitor, so
    // every byte is on the critical path. `plan_features` alone is 126 rows;
    // `*` shipped `limit_value` and any column added later to all of them, for
    // three fields the page actually reads. Naming the columns also means a
    // future column cannot silently enlarge this response.
    const [plansRes, pricesRes, featuresRes] = await Promise.all([
      supabase
        .from("plans" as never)
        .select(
          "id, code, name, description, tier_order, trial_days, support_level, " +
            "max_students, max_staff, max_branches, max_storage_mb, " +
            "whatsapp_credits, email_credits, " +
            "allow_white_label, allow_custom_domain, allow_marketplace",
        )
        .eq("is_public", true)
        .eq("is_active", true)
        .order("tier_order"),
      supabase
        .from("plan_prices" as never)
        .select("plan_id, interval, amount, currency, tax_percent")
        .eq("is_active", true),
      supabase
        .from("plan_features" as never)
        .select("plan_id, feature_key, enabled"),
    ]);
    if (plansRes.error) throw AppError.fromSupabase(plansRes.error, "plans");

    const prices = (pricesRes.data ?? []) as unknown as Record<string, unknown>[];
    const features = (featuresRes.data ?? []) as unknown as Record<string, unknown>[];

    return ((plansRes.data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
      const id = String(r.id);
      const featureMap: Record<string, boolean> = {};
      for (const f of features.filter((f) => String(f.plan_id) === id)) {
        featureMap[String(f.feature_key)] = Boolean(f.enabled);
      }
      return {
        id,
        code: String(r.code),
        name: String(r.name),
        description: str(r.description),
        tierOrder: Number(r.tier_order ?? 0),
        trialDays: Number(r.trial_days ?? 14),
        supportLevel: String(r.support_level ?? "email"),
        maxStudents: num(r.max_students),
        maxStaff: num(r.max_staff),
        maxBranches: num(r.max_branches),
        maxStorageMb: num(r.max_storage_mb),
        whatsappCredits: num(r.whatsapp_credits),
        emailCredits: num(r.email_credits),
        allowWhiteLabel: Boolean(r.allow_white_label),
        allowCustomDomain: Boolean(r.allow_custom_domain),
        allowMarketplace: Boolean(r.allow_marketplace),
        prices: prices
          .filter((p) => String(p.plan_id) === id)
          .map((p) => ({
            interval: String(p.interval),
            amount: Number(p.amount ?? 0),
            currency: String(p.currency ?? "INR"),
            taxPercent: Number(p.tax_percent ?? 18),
          })),
        features: featureMap,
      };
    });
  }

  // ── Demand capture ─────────────────────────────────────────────────────
  async submitDemoRequest(input: DemoRequestInput): Promise<void> {
    const { error } = await supabase.from("platform_demo_requests" as never).insert({
      name: input.name,
      email: input.email.toLowerCase().trim(),
      phone: input.phone ?? null,
      organization_name: input.organizationName ?? null,
      institution_type: input.institutionType ?? null,
      student_count: input.studentCount ?? null,
      preferred_date: input.preferredDate || null,
      preferred_time: input.preferredTime ?? null,
      message: input.message ?? null,
      source: "website",
      utm: currentUtm(),
    } as never);
    if (error) throw AppError.fromSupabase(error, "demo request");
  }

  async submitEnquiry(input: {
    kind?: string; name: string; email: string; phone?: string;
    subject?: string; message: string;
  }): Promise<void> {
    const { error } = await supabase.from("platform_enquiries" as never).insert({
      kind: input.kind ?? "contact",
      name: input.name,
      email: input.email.toLowerCase().trim(),
      phone: input.phone ?? null,
      subject: input.subject ?? null,
      message: input.message,
      metadata: currentUtm(),
    } as never);
    if (error) throw AppError.fromSupabase(error, "enquiry");
  }

  // ── Onboarding ─────────────────────────────────────────────────────────
  async checkSlug(slug: string): Promise<{ available: boolean; reason: string | null }> {
    const { data, error } = await supabase.functions.invoke("public-onboarding", {
      body: { action: "check_slug", slug },
    });
    if (error) return { available: false, reason: "Could not check availability right now." };
    return data as { available: boolean; reason: string | null };
  }

  async trackSignup(input: Record<string, unknown>): Promise<void> {
    // Fire-and-forget: funnel telemetry must never block a signup.
    await supabase.functions
      .invoke("public-onboarding", { body: { action: "track_signup", utm: currentUtm(), ...input } })
      .catch(() => undefined);
  }

  async provision(input: {
    slug: string; legalName: string; displayName?: string;
    institutionType?: string; country?: string; timezone?: string; planCode?: string;
  }): Promise<{ organizationId: string; slug: string; requiresReauth: boolean }> {
    const { data, error } = await supabase.functions.invoke("public-onboarding", {
      body: { action: "provision", ...input },
    });
    const payload = data as { error?: string; organizationId?: string; slug?: string; requiresReauth?: boolean } | null;
    if (error || payload?.error) {
      throw AppError.validation(payload?.error ?? error?.message ?? "Provisioning failed");
    }
    return {
      organizationId: payload!.organizationId!,
      slug: payload!.slug!,
      requiresReauth: Boolean(payload!.requiresReauth),
    };
  }

  // ── Content ────────────────────────────────────────────────────────────
  async posts(kind: "blog" | "help" | "docs", limit = 50): Promise<ContentPost[]> {
    const { data, error } = await supabase
      .from("content_posts" as never)
      .select("*, content_authors(name), content_categories(name)")
      .eq("kind", kind)
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(limit);
    // A CMS outage must not take down the marketing site — degrade to an empty
    // list, which the page renders as "nothing published yet".
    if (error) return [];
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
      const author = r.content_authors as { name?: string } | null;
      const category = r.content_categories as { name?: string } | null;
      return {
        id: String(r.id), slug: String(r.slug), kind: String(r.kind),
        title: String(r.title), excerpt: str(r.excerpt), body: str(r.body),
        coverUrl: str(r.cover_url), tags: (r.tags as string[]) ?? [],
        readingMinutes: num(r.reading_minutes), publishedAt: str(r.published_at),
        seoTitle: str(r.seo_title), seoDescription: str(r.seo_description),
        authorName: author?.name ?? null, categoryName: category?.name ?? null,
      };
    });
  }

  async post(kind: string, slug: string): Promise<ContentPost | null> {
    const { data, error } = await supabase
      .from("content_posts" as never)
      .select("*, content_authors(name), content_categories(name)")
      .eq("kind", kind).eq("slug", slug).eq("is_published", true)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as unknown as Record<string, unknown>;
    const author = r.content_authors as { name?: string } | null;
    const category = r.content_categories as { name?: string } | null;
    return {
      id: String(r.id), slug: String(r.slug), kind: String(r.kind),
      title: String(r.title), excerpt: str(r.excerpt), body: str(r.body),
      coverUrl: str(r.cover_url), tags: (r.tags as string[]) ?? [],
      readingMinutes: num(r.reading_minutes), publishedAt: str(r.published_at),
      seoTitle: str(r.seo_title), seoDescription: str(r.seo_description),
      authorName: author?.name ?? null, categoryName: category?.name ?? null,
    };
  }

  // ── Status ─────────────────────────────────────────────────────────────
  async status(): Promise<StatusSnapshot | null> {
    const { data, error } = await supabase.rpc("public_status" as never);
    if (error) return null;
    return data as unknown as StatusSnapshot;
  }

  // ── Analytics ──────────────────────────────────────────────────────────
  /**
   * First-party, cookieless page view.
   *
   * No cookie, no fingerprint, no IP, no user agent — so it needs no consent
   * banner under DPDP/GDPR, and there is nothing here that could identify a
   * visitor even if the table leaked.
   */
  async trackEvent(event: string, path?: string): Promise<void> {
    if (typeof window === "undefined") return;
    const utm = currentUtm() ?? {};
    await supabase
      .from("marketing_events" as never)
      .insert({
        event,
        path: path ?? window.location.pathname,
        referrer: document.referrer ? new URL(document.referrer).hostname : null,
        utm_source: utm.utm_source ?? null,
        utm_medium: utm.utm_medium ?? null,
        utm_campaign: utm.utm_campaign ?? null,
        device: window.innerWidth < 640 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop",
      } as never)
      .then(undefined, () => undefined);
  }
}

export const marketingService = new MarketingService();
