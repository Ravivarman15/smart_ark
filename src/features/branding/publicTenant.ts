// ──────────────────────────────────────────────────────────────────────────────
// PUBLIC TENANT CONTEXT
//
// Identity resolution for pages served to people who are NOT logged in — the
// enquiry form, the admission form. There is no JWT, so `current_org_id()` is
// null and RLS can tell us nothing about whose page this is.
//
// ┌── THE TWO FAILURES THIS ADDRESSES ─────────────────────────────────────┐
// │ 1. BRANDING. Both public forms hardcoded ARK's logo and name, so a     │
// │    prospective parent visiting ABC Academi's enquiry link was greeted  │
// │    by a competitor. Unauthenticated, indexable, and the first thing a  │
// │    prospect ever sees.                                                 │
// │                                                                        │
// │ 2. SUBMISSION. `leads.organization_id` defaults to `current_org_id()`, │
// │    which is NULL for anon since the second organization was created.   │
// │    Every public submission had been failing the NOT NULL constraint.   │
// └────────────────────────────────────────────────────────────────────────┘
//
// Resolution order — HOST first, then the slug in the path:
//
//   abcacademy.in/leads/apply       → host matches a verified domain  → ABC
//   smartark.app/leads/apply/abc    → no host match, slug resolves    → ABC
//   smartark.app/leads/apply        → neither                         → NEUTRAL
//
// A host is a stronger claim than a path segment anyone can type, so a tenant
// on its own domain cannot be made to render a competitor by appending a slug.
//
// The browser NEVER supplies an organization_id. It supplies a slug — a public
// identifier, already the subdomain — and the database resolves it. Choosing
// the id that gets written is what must stay impossible, and `submit_public_lead`
// keeps it that way by taking the slug too.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DocumentBranding } from "./documents";

export interface PublicTenant {
  organizationId: string;
  slug: string;
  organizationName: string;
  portalName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  phone: string;
  email: string;
  address: string;
  website: string;
}

/**
 * The platform's own identity, for when no tenant can be resolved.
 *
 * Deliberately NOT a tenant. "We could not tell whose page this is" and "this
 * is ARK's page" are different facts, and rendering the second for the first is
 * the entire class of bug this module exists to close.
 */
export const PLATFORM_PUBLIC_IDENTITY = {
  name: "Smart ARK",
  monogram: "SA",
} as const;

const s = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * Resolve the tenant behind a public page.
 *
 * Returns null when neither the host nor the slug names a live organization.
 * Callers must render a neutral state on null — never a default tenant.
 */
export const resolvePublicTenant = async (
  host: string | null,
  slug: string | null,
): Promise<PublicTenant | null> => {
  // Nothing to resolve WITH. Skipping the round trip also means a stray render
  // cannot produce a lookup that might match something unintended.
  if (!host && !slug) return null;

  const { data, error } = await supabase.rpc("public_tenant_context" as never, {
    _host: host,
    _slug: slug,
  } as never);

  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  const organizationId = s(r.organization_id);
  if (!organizationId) return null;

  return {
    organizationId,
    slug: s(r.slug),
    organizationName: s(r.organization_name) || s(r.legal_name) || s(r.slug),
    portalName: s(r.portal_name),
    logoUrl: s(r.logo_url),
    primaryColor: s(r.primary_color),
    accentColor: s(r.accent_color),
    phone: s(r.support_phone),
    email: s(r.support_email),
    address: s(r.support_address),
    website: s(r.website_url),
  };
};

export type PublicTenantState =
  | { status: "loading"; tenant: null }
  | { status: "resolved"; tenant: PublicTenant }
  | { status: "unknown"; tenant: null };

/**
 * Resolve the public tenant for the current host and an optional path slug.
 *
 * Three states, kept distinct on purpose. A page cannot render honestly if it
 * cannot tell "still looking" from "nobody by that name" — the first should
 * show nothing, the second should say so.
 */
export const usePublicTenant = (slug?: string | null): PublicTenantState => {
  const [state, setState] = useState<PublicTenantState>({ status: "loading", tenant: null });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const host = typeof window === "undefined" ? null : window.location.hostname;
    (async () => {
      try {
        const tenant = await resolvePublicTenant(host, slug ?? null);
        if (!alive.current) return;
        setState(tenant ? { status: "resolved", tenant } : { status: "unknown", tenant: null });
      } catch {
        // An unreachable lookup means we do not know whose door this is. The
        // honest answer is the platform's own name, never a guess.
        if (alive.current) setState({ status: "unknown", tenant: null });
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [slug]);

  return state;
};

/**
 * Adapt a resolved public tenant to the shared `DocumentBranding` shape, so a
 * public page can use the very same DocumentShell primitives as an
 * authenticated one. One document engine, both sides of the login wall.
 */
export const publicTenantToBranding = (t: PublicTenant): DocumentBranding => ({
  organizationName: t.organizationName,
  legalName: "",
  logoUrl: t.logoUrl,
  address: t.address,
  phone: t.phone,
  email: t.email,
  website: t.website,
  taxId: "",
  authorizedSignatory: t.organizationName,
  footerNote: "",
  receiptPrimaryColor: "",
  receiptSecondaryColor: "",
  receiptAccentColor: "",
});
