// ──────────────────────────────────────────────────────────────────────────────
// BRANDING SERVICE
//
// Reads go through `branding_bundle()` — one RPC returning branding, assets,
// theme, domains, integration MODES and plan entitlements, so a portal boots
// with one round trip instead of six.
//
// It never receives a credential. `branding_bundle` returns the integration
// MODE ("platform" or "custom") and nothing else; secrets live in
// organization_secrets, which has RLS enabled and no policies at all.
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { AppError } from "@/shared/services";
import { orgPath } from "@/lib/orgStorage";
import { readEdgeError } from "@/lib/edgeError";
import { invalidateDocumentBranding } from "../documents/documentBranding.service";

export interface BrandingBundle {
  organization: { id: string; name: string; slug: string };
  branding: Record<string, unknown> | null;
  assets: Record<string, string> | null;
  theme: { id: string; name: string; tokens: Record<string, unknown> } | null;
  domains: {
    id: string; host: string; kind: string; portal: string | null;
    status: string; ssl_status: string; is_primary: boolean;
  }[] | null;
  integrations: Record<string, { mode: string; provider: string; verified: boolean }> | null;
  entitlements: { white_label: boolean; custom_domain: boolean; marketplace: boolean } | null;
  generated_at: string;
}

export interface OrgTheme {
  id: string; name: string; isActive: boolean; isSystem: boolean;
  source: string; tokens: Record<string, unknown>;
}

export interface MarketplaceItem {
  id: string; slug: string; kind: string; name: string;
  description: string | null; tier: string; installed: boolean;
  tokens?: Record<string, unknown> | null;
}

async function invokeDomain<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("domain-verify", {
    body: { action, ...payload },
  });
  const body = data as { error?: string } | null;
  if (error || body?.error) {
    throw AppError.validation(await readEdgeError(error, data, "Request failed"));
  }
  return data as T;
}

class BrandingService {
  async bundle(): Promise<BrandingBundle | null> {
    const { data, error } = await supabase.rpc("branding_bundle" as never);
    if (error) throw AppError.fromSupabase(error, "branding_bundle");
    return (data as unknown as BrandingBundle) ?? null;
  }

  async saveBranding(patch: Record<string, unknown>): Promise<void> {
    // No .eq() filter: RLS restricts organization_branding to the caller's own
    // organization, and filtering client-side would imply the client knows
    // better than the database.
    const { data: org } = await supabase
      .from("organizations" as never).select("id").limit(1).maybeSingle();
    const orgId = (org as { id?: string } | null)?.id;
    if (!orgId) throw AppError.validation("No organization context");

    const { error } = await supabase
      .from("organization_branding" as never)
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("organization_id", orgId);
    // The database trigger rejects a bad colour or font before storage; its
    // message names the offending value, so surface it verbatim.
    if (error) throw AppError.fromSupabase(error, "branding");

    // Documents cache branding for the session so a bulk send is one lookup
    // rather than N. Without this, a tenant fixing a typo in its own address
    // keeps printing the old one until a full reload — and would reasonably
    // conclude the save had failed.
    invalidateDocumentBranding();
  }

  // ── Themes ─────────────────────────────────────────────────────────────
  async themes(): Promise<OrgTheme[]> {
    const { data, error } = await supabase
      .from("organization_themes" as never)
      .select("id, name, is_active, is_system, source, tokens")
      .order("is_system", { ascending: false })
      .order("name");
    if (error) throw AppError.fromSupabase(error, "themes");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), name: String(r.name),
      isActive: Boolean(r.is_active), isSystem: Boolean(r.is_system),
      source: String(r.source), tokens: (r.tokens as Record<string, unknown>) ?? {},
    }));
  }

  async saveTheme(name: string, tokens: Record<string, unknown>): Promise<void> {
    const { data: org } = await supabase
      .from("organizations" as never).select("id").limit(1).maybeSingle();
    const orgId = (org as { id?: string } | null)?.id;
    if (!orgId) throw AppError.validation("No organization context");

    const { error } = await supabase.from("organization_themes" as never).upsert(
      { organization_id: orgId, name, tokens, source: "custom" } as never,
      { onConflict: "organization_id,name" },
    );
    if (error) throw AppError.fromSupabase(error, "theme");
  }

  async activateTheme(themeId: string): Promise<void> {
    const { error } = await supabase.rpc("activate_theme" as never, { _theme: themeId } as never);
    if (error) throw AppError.fromSupabase(error, "activate_theme");
  }

  // ── Domains ────────────────────────────────────────────────────────────
  async requestDomain(host: string, portal: string) {
    const { data, error } = await supabase.rpc("request_domain_verification" as never, {
      _org: null, _host: host, _portal: portal,
    } as never);
    if (error) throw AppError.fromSupabase(error, "request_domain");
    return data as unknown as {
      domain_id: string; host: string;
      records: { type: string; name: string; value: string }[];
    };
  }

  verifyDomain(domainId: string) {
    return invokeDomain<{ status: string; host: string; note: string; records: unknown[] }>(
      "verify_domain", { domainId },
    );
  }

  sslStatus(domainId: string) {
    return invokeDomain<{ ssl_status: string; detail: string }>("ssl_status", { domainId });
  }

  // ── Senders ────────────────────────────────────────────────────────────
  testEmailProvider(input: { provider: string; apiKey: string; config: Record<string, unknown> }) {
    // The key travels to the edge function and is stored server-side only —
    // it is never written back to any table the browser can read.
    return invokeDomain<{ ok: boolean; provider: string; detail: string }>("test_smtp", {
      provider: input.provider,
      apiKey: input.apiKey,
      password: input.apiKey,
      config: input.config,
    });
  }

  checkEmailDns(domain: string) {
    return invokeDomain<{
      domain: string;
      spf: { present: boolean; value: string | null; note: string | null };
      dkim: { present: boolean; value: string | null; note: string | null };
      dmarc: { present: boolean; value: string | null; note: string | null };
      deliverability: string;
    }>("check_email_dns", { domain });
  }

  /** Switch a channel back to the platform's credentials. */
  async usePlatformSender(channel: "email" | "whatsapp"): Promise<void> {
    const { data: org } = await supabase
      .from("organizations" as never).select("id").limit(1).maybeSingle();
    const orgId = (org as { id?: string } | null)?.id;
    if (!orgId) throw AppError.validation("No organization context");

    // Sets mode only. The stored secret is deliberately LEFT in place so a
    // tenant that toggles back and forth does not have to re-enter its key —
    // and resolve_integration ignores it entirely while mode is 'platform'.
    const { error } = await supabase
      .from("organization_integrations" as never)
      .update({ mode: "platform", updated_at: new Date().toISOString() } as never)
      .eq("organization_id", orgId)
      .eq("channel", channel);
    if (error) throw AppError.fromSupabase(error, "integration");
  }

  // ── Marketplace ────────────────────────────────────────────────────────
  async marketplace(): Promise<MarketplaceItem[]> {
    const [itemsRes, installsRes] = await Promise.all([
      supabase.from("marketplace_items" as never)
        .select("id, slug, kind, name, description, tier, payload")
        .eq("is_published", true).order("kind").order("name"),
      supabase.from("marketplace_installs" as never)
        .select("item_id").is("uninstalled_at", null),
    ]);
    if (itemsRes.error) throw AppError.fromSupabase(itemsRes.error, "marketplace");

    const installed = new Set(
      ((installsRes.data ?? []) as unknown as { item_id: string }[]).map((r) => r.item_id),
    );

    return ((itemsRes.data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
      const payload = (r.payload as Record<string, unknown>) ?? {};
      return {
        id: String(r.id), slug: String(r.slug), kind: String(r.kind),
        name: String(r.name),
        description: r.description == null ? null : String(r.description),
        tier: String(r.tier),
        installed: installed.has(String(r.id)),
        tokens: (payload.tokens as Record<string, unknown>) ?? null,
      };
    });
  }

  async install(itemId: string) {
    const { data, error } = await supabase.rpc("install_marketplace_item" as never, {
      _item: itemId,
    } as never);
    // The entitlement refusal names the plan requirement, which is far more
    // useful than "install failed".
    if (error) throw AppError.validation(error.message);
    return data as unknown as { ok: boolean; kind: string; applied: number };
  }

  // ── Email templates ────────────────────────────────────────────────────
  async emailTemplates(): Promise<Record<string, unknown>[]> {
    // RLS returns the organization's own overrides AND the platform defaults
    // (organization_id IS NULL) — which is how the UI shows "inherited" versus
    // "customised" without a second query.
    const { data, error } = await supabase
      .from("organization_email_templates" as never)
      .select("id, organization_id, template_key, language, subject, body_html, is_active")
      .order("template_key");
    if (error) throw AppError.fromSupabase(error, "email_templates");
    return (data ?? []) as unknown as Record<string, unknown>[];
  }

  async saveEmailTemplate(input: {
    templateKey: string; language: string; subject: string; bodyHtml: string;
  }): Promise<void> {
    const { data: org } = await supabase
      .from("organizations" as never).select("id").limit(1).maybeSingle();
    const orgId = (org as { id?: string } | null)?.id;
    if (!orgId) throw AppError.validation("No organization context");

    const { error } = await supabase.from("organization_email_templates" as never).upsert(
      {
        organization_id: orgId, template_key: input.templateKey,
        language: input.language, subject: input.subject, body_html: input.bodyHtml,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "organization_id,template_key,language" },
    );
    if (error) throw AppError.fromSupabase(error, "email_template");
  }

  // ── Certificates ───────────────────────────────────────────────────────
  async saveCertificateBranding(config: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.rpc("save_certificate_branding" as never, {
      _config: config,
    } as never);
    if (error) throw AppError.validation(error.message);
  }

  /** Public login branding for a hostname — callable before authentication. */
  async publicBranding(host: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase.rpc("public_branding_for_host" as never, {
      _host: host,
    } as never);
    if (error) return null;
    return (data as Record<string, unknown>) ?? null;
  }
}

export const brandingService = new BrandingService();

/**
 * Upload an organization logo and return a URL the documents can actually use.
 *
 * ┌── WHY UPLOAD RATHER THAN ACCEPT A LINK ────────────────────────────────┐
 * │ Receipts and payslips are rasterised by html2canvas, which must READ   │
 * │ the image pixels. A logo hosted anywhere without permissive CORS       │
 * │ taints the canvas and vanishes from the PDF — silently, and only in    │
 * │ the generated document, never in the settings preview. That is why a   │
 * │ pasted URL "did not update" while looking perfectly correct.           │
 * │                                                                        │
 * │ Uploading puts the asset in a bucket we control, served with CORS      │
 * │ headers that allow the read.                                           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * The path is `{organization_id}/logo-{timestamp}.{ext}`:
 *   • the org prefix is what the storage policy checks — it is the tenant
 *     boundary, since storage policies can only inspect the object NAME;
 *   • the timestamp defeats CDN caching. Overwriting a fixed `logo.png` leaves
 *     every cache and every already-emailed PDF pointing at the old image.
 */
export async function uploadOrganizationLogo(file: File): Promise<string> {
  const { data: org } = await supabase
    .from("organizations" as never).select("id").limit(1).maybeSingle();
  const orgId = (org as { id?: string } | null)?.id;
  if (!orgId) throw AppError.validation("No organization context");

  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) {
    throw AppError.validation("Use a PNG, JPG, WEBP or SVG image.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw AppError.validation("Logo must be under 2 MB.");
  }

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  // orgPath() is the ONE place tenant partitioning is applied. A hand-built
  // `${orgId}/…` prefix does the same thing today and silently stops matching
  // the storage policy the day that convention changes — which is exactly why
  // a security gate refuses any upload site that skips it.
  const path = orgPath(`logo-${Date.now()}.${ext}`);

  const { error } = await supabase.storage
    .from("branding")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw AppError.validation(error.message);

  const { data } = supabase.storage.from("branding").getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url) throw AppError.validation("Upload succeeded but no public URL was returned.");

  await brandingService.saveBranding({ logo_url: url });
  return url;
}
