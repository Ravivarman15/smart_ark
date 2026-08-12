// ──────────────────────────────────────────────────────────────────────────────
// ORGANIZATION COMMUNICATION CONTEXT
//
// ┌── THE BUG THIS EXISTS TO FIX ──────────────────────────────────────────┐
// │ Five canonical WhatsApp templates ended with a literal                 │
// │ "Thank you, ARK Learning Arena", attendanceWhatsapp.service.ts held    │
// │ `const ORG_NAME = "ARK Learning Arena"`, and six pages hardcoded       │
// │ thearktuition.com URLs.                                                │
// │                                                                        │
// │ Correct while ARK was the only tenant. Now that a second organization  │
// │ exists, the moment ABC Academi enables absence alerts their parents    │
// │ are messaged "Thank you, ARK Learning Arena" — a competitor's name, on │
// │ WhatsApp, from a number the parent trusts. Nothing errors; it is a     │
// │ silent, outward-facing multi-tenancy failure.                          │
// │                                                                        │
// │ So org identity becomes a RESOLVED VARIABLE BAG that every template    │
// │ can reference as {{org_name}} etc., fetched once per dispatch from the │
// │ caller's own organization.                                             │
// └────────────────────────────────────────────────────────────────────────┘
//
// SCOPING: no organization_id is passed anywhere here. `current_org_id()` in
// RLS already filters both tables to the caller's tenant, and passing an id
// would be a second, weaker check that could disagree with the first.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";

/**
 * The variables every template may use regardless of event.
 *
 * Values are strings because they land straight in a rendered message — a
 * template that prints `undefined` to a parent is worse than one that prints
 * nothing, so every field defaults to "".
 */
export interface OrgCommsVars extends Record<string, string> {
  org_name: string;
  org_short_name: string;
  org_legal_name: string;
  org_phone: string;
  org_email: string;
  org_website: string;
  org_address: string;
  org_city: string;
  org_state: string;
  org_pincode: string;
  org_logo: string;
  org_support_phone: string;
  org_support_email: string;
  org_brand_primary: string;
  org_brand_secondary: string;
  org_brand_accent: string;
}

/**
 * The contract, in one place.
 *
 * A template may reference any of these and be certain the bag defines it.
 * Exported so the validator can reject `{{org_whatever}}` at authoring time
 * instead of rendering a literal `{{org_whatever}}` to a parent.
 */
export const ORG_VARIABLE_KEYS: readonly (keyof OrgCommsVars & string)[] = [
  "org_name", "org_short_name", "org_legal_name",
  "org_phone", "org_email", "org_website",
  "org_address", "org_city", "org_state", "org_pincode",
  "org_logo", "org_support_phone", "org_support_email",
  "org_brand_primary", "org_brand_secondary", "org_brand_accent",
] as const;

const EMPTY: OrgCommsVars = ORG_VARIABLE_KEYS.reduce(
  (acc, k) => ({ ...acc, [k]: "" }),
  {} as OrgCommsVars,
);

const s = (v: unknown): string => (v == null ? "" : String(v));

interface OrgRow {
  slug: string | null;
  display_name: string | null;
  legal_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

interface BrandingRow {
  app_name: string | null;
  portal_name: string | null;
  support_email: string | null;
  support_phone: string | null;
  support_address: string | null;
  website_url: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
}

class OrgContextService extends BaseService {
  /**
   * Cached for the session.
   *
   * A dispatch sending to 500 parents must not make 500 identical round trips
   * for a name that changes perhaps twice a year. Cleared by `invalidate()`
   * when branding is saved, so an edit still takes effect without a reload.
   */
  private cache: Promise<OrgCommsVars> | null = null;

  invalidate(): void {
    this.cache = null;
  }

  vars(): Promise<OrgCommsVars> {
    if (!this.cache) this.cache = this.load();
    return this.cache;
  }

  private async load(): Promise<OrgCommsVars> {
    try {
      const [orgRes, brandRes] = await Promise.all([
        this.db
          .from("organizations" as never)
          .select(
            "slug, display_name, legal_name, contact_phone, contact_email, website, city, state, pincode",
          )
          .limit(1)
          .maybeSingle(),
        this.db
          .from("organization_branding" as never)
          .select(
            "app_name, portal_name, support_email, support_phone, support_address, website_url, " +
              "logo_url, primary_color, secondary_color, accent_color",
          )
          .limit(1)
          .maybeSingle(),
      ]);

      const org = (orgRes.error ? null : orgRes.data) as OrgRow | null;
      const brand = (brandRes.error ? null : brandRes.data) as BrandingRow | null;

      // Preference order is deliberate: the institution's PUBLIC-FACING name
      // first (what a parent recognises), then the branded app name, then the
      // legal entity. `slug` is the last resort — it is at least tenant-correct,
      // which a hardcoded competitor's name never is.
      const name =
        s(org?.display_name) ||
        s(brand?.app_name) ||
        s(org?.legal_name) ||
        s(org?.slug);

      // Support vs general contact are DIFFERENT numbers to a school: the
      // office line goes on a receipt, the support line answers a login
      // problem. They fall back to each other because one of the two is
      // usually filled in, and a blank phone number in a message that says
      // "call us" is a dead end.
      const supportPhone = s(brand?.support_phone) || s(org?.contact_phone);
      const supportEmail = s(brand?.support_email) || s(org?.contact_email);

      return {
        org_name: name,
        org_short_name: s(brand?.portal_name) || s(org?.slug) || name,
        org_legal_name: s(org?.legal_name) || name,
        org_phone: s(org?.contact_phone) || supportPhone,
        org_email: s(org?.contact_email) || supportEmail,
        org_website: s(brand?.website_url) || s(org?.website),
        org_address: s(brand?.support_address),
        // Nullable by design — see 20261003_phase10a. Blank, never guessed
        // from the free-text address.
        org_city: s(org?.city),
        org_state: s(org?.state),
        org_pincode: s(org?.pincode),
        org_logo: s(brand?.logo_url),
        org_support_phone: supportPhone,
        org_support_email: supportEmail,
        org_brand_primary: s(brand?.primary_color),
        org_brand_secondary: s(brand?.secondary_color),
        org_brand_accent: s(brand?.accent_color),
      };
    } catch {
      // Never throw into a business mutation. An unresolved org name renders as
      // an empty string, which reads as a slightly bare message — acceptable.
      // Falling back to a hardcoded name would reintroduce the exact defect
      // this service exists to remove.
      return EMPTY;
    }
  }
}

export const orgContextService = new OrgContextService();
