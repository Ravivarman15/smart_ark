// ──────────────────────────────────────────────────────────────────────────────
// TENANT CONTEXT — the single place the app learns which organization it is in.
//
// Step 4 of the Phase 1 brief: "No module should manually determine tenant."
//
// ┌── WHAT IS AUTHORITATIVE, AND WHAT IS NOT ──────────────────────────────┐
// │ AUTHORITATIVE: the `organization_id` claim inside the signed JWT.      │
// │   It is injected server-side by public.custom_access_token_hook at     │
// │   token issuance and lives in `app_metadata`, which users cannot       │
// │   write. Every RLS policy in the database reads the same claim, so     │
// │   the UI and the data layer can never disagree.                        │
// │                                                                        │
// │ NOT AUTHORITATIVE: the hostname. `acme.smartark.ai` is a ROUTING HINT. │
// │   Anyone can type any subdomain. If the host says one org and the      │
// │   token says another, that is a signal to re-authenticate — never to   │
// │   trust either one. See assertHostMatchesToken().                      │
// └────────────────────────────────────────────────────────────────────────┘
//
// This module holds no React. The value is mirrored into a module-level cache
// so non-React code — services, the storage-path helper — can read the current
// organization synchronously without every service growing a hook dependency.
// OrganizationProvider is the only writer.
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

export interface Organization {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  status: "trialing" | "active" | "past_due" | "suspended" | "cancelled";
  timezone: string;
  currency: string;
  locale: string;
}

export interface OrganizationMembership {
  organizationId: string;
  slug: string;
  displayName: string;
  principalKind: "staff" | "parent" | "student";
  isDefault: boolean;
}

// ── Module-level cache ───────────────────────────────────────────────────────
// Written ONLY by OrganizationProvider. Read by services that cannot use hooks.
let activeOrganization: Organization | null = null;

/** @internal — OrganizationProvider only. */
export function __setActiveOrganization(org: Organization | null): void {
  activeOrganization = org;
}

/** The active organization, or null before it resolves / when signed out. */
export function currentOrganization(): Organization | null {
  return activeOrganization;
}

/** The active organization's id, or null. */
export function currentOrganizationId(): string | null {
  return activeOrganization?.id ?? null;
}

/**
 * The active organization's id, or throw.
 *
 * For code paths where proceeding without a tenant would be a bug — building a
 * storage path, say. Throwing beats silently writing to a wrong or shared
 * location, which is the failure mode that is invisible until it is a breach.
 */
export function requireOrganization(): string {
  const id = currentOrganizationId();
  if (!id) {
    throw new Error(
      "[tenant] No active organization. This code ran before OrganizationProvider " +
        "resolved, or the session carries no organization claim.",
    );
  }
  return id;
}

// ── JWT claim reading ────────────────────────────────────────────────────────

interface JwtPayload {
  app_metadata?: { organization_id?: string; principal_kind?: string };
  organization_id?: string;
}

/**
 * Read the organization claim from the CURRENT access token.
 *
 * Decoding here is safe in a way it is NOT on the server: this token was issued
 * to us by Supabase and is being read for display/routing only. Nothing is
 * authorized on the strength of it — every actual permission decision happens
 * in Postgres, which verifies the signature. (Contrast the edge functions,
 * where the same decode WAS an impersonation hole — see _shared/auth.ts.)
 */
export async function readOrgClaim(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as JwtPayload;
    return payload.app_metadata?.organization_id ?? payload.organization_id ?? null;
  } catch {
    return null;
  }
}

// ── Host-based resolution (routing hint only) ────────────────────────────────

/**
 * The organization slug implied by the hostname, if any.
 *
 * Returns null for localhost, IPs, bare apex domains and the reserved
 * subdomains, so local development and the marketing site never look like a
 * tenant called "localhost" or "www".
 */
export function orgSlugFromHost(host: string = window.location.hostname): string | null {
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 3) return null; // apex or single-label: not a tenant subdomain
  const sub = parts[0].toLowerCase();
  if (["www", "app", "api", "login", "platform", "docs", "status"].includes(sub)) return null;
  return sub;
}

/**
 * Resolve an organization from a host, via the database.
 *
 * Checks `organization_domains` (covers custom domains) then falls back to the
 * slug. Used for pre-login branding and for the mismatch check below.
 */
export async function resolveOrganizationByHost(
  host: string = window.location.hostname,
): Promise<string | null> {
  const slug = orgSlugFromHost(host);
  if (!slug) return null;
  const { data, error } = await supabase.rpc("resolve_organization" as never, {
    _host: host,
  } as never);
  if (error) return null;
  return (data as string | null) ?? null;
}

/**
 * Detect a host/token disagreement.
 *
 * Reaching `acme.smartark.ai` with a token for `globex` must NOT silently show
 * globex's data under acme's URL, and must NOT switch tenants on the strength
 * of a hostname. The only safe response is to re-authenticate.
 *
 * Returns true when they agree (or when the host implies no tenant at all).
 */
export function hostMatchesOrg(org: Organization | null, host?: string): boolean {
  const slug = orgSlugFromHost(host);
  if (!slug) return true;
  if (!org) return false;
  return org.slug.toLowerCase() === slug;
}

// ── Membership ───────────────────────────────────────────────────────────────

/** Every organization this user can act in — the org switcher's data source. */
export async function listMemberships(): Promise<OrganizationMembership[]> {
  const { data, error } = await supabase
    .from("organization_users" as never)
    .select("organization_id, principal_kind, is_default, organizations(slug, display_name)")
    .eq("status", "active");
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map((r) => {
    const org = r.organizations as { slug?: string; display_name?: string } | null;
    return {
      organizationId: String(r.organization_id),
      slug: org?.slug ?? "",
      displayName: org?.display_name ?? "",
      principalKind: r.principal_kind as OrganizationMembership["principalKind"],
      isDefault: Boolean(r.is_default),
    };
  });
}

export async function isOrganizationMember(organizationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_organization_member" as never, {
    _org: organizationId,
  } as never);
  if (error) return false;
  return data === true;
}

/**
 * Load the active organization's record.
 *
 * No `.eq("id", …)` filter is needed or wanted: RLS on `organizations` already
 * restricts the row set to the caller's own organization. Filtering client-side
 * would imply the client knows better than the database, which is the habit
 * this whole phase exists to remove.
 */
export async function fetchActiveOrganization(): Promise<Organization | null> {
  const { data, error } = await supabase
    .from("organizations" as never)
    .select("id, slug, display_name, legal_name, status, timezone, currency, locale")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as Record<string, unknown>;
  return {
    id: String(r.id),
    slug: String(r.slug),
    displayName: String(r.display_name),
    legalName: String(r.legal_name),
    status: r.status as Organization["status"],
    timezone: String(r.timezone ?? "Asia/Kolkata"),
    currency: String(r.currency ?? "INR"),
    locale: String(r.locale ?? "en-IN"),
  };
}
