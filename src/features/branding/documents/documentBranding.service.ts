// ──────────────────────────────────────────────────────────────────────────────
// DOCUMENT BRANDING RESOLVER
//
// ┌── THE BUG THIS EXISTS TO FIX ──────────────────────────────────────────┐
// │ SalarySlip.tsx and FeeReceiptDialog.tsx each held:                     │
// │                                                                        │
// │   const ORG = {                                                        │
// │     name: "ARK Learning Arena",                                        │
// │     address: "No 2/31, Mugappair West, Chennai",                       │
// │     contact: "Phone: 7358199217  |  www.arklearning.com",              │
// │   };                                                                   │
// │                                                                        │
// │ Correct while ARK was the only tenant. Now that a second organization  │
// │ exists, an ABC Academi teacher's payslip and an ABC Academi parent's   │
// │ receipt are printed on a competitor's letterhead — a PDF the employee  │
// │ keeps, emails, and may hand to a bank. Nothing errors.                 │
// └────────────────────────────────────────────────────────────────────────┘
//
// ┌── SCOPING: WHY THERE IS NO organizationId PARAMETER ───────────────────┐
// │ This function CANNOT be told which tenant to resolve.                  │
// │                                                                        │
// │ RLS already filters `organizations` and `organization_branding` to     │
// │ current_org_id(). An id parameter would be a second, weaker check that │
// │ can disagree with the first — and a parameter that exists eventually   │
// │ gets passed a value from a URL, a form field, or a JSON body.          │
// │                                                                        │
// │ A resolver with no such parameter cannot be tricked into resolving the │
// │ wrong tenant, by construction rather than by validation. Adding one    │
// │ "for the bulk path" would reintroduce exactly the hole this closes.    │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import { orgContextService } from "@/features/communication/services/orgContext.service";
import { signedUrl } from "@/lib/storageUrl";
import type { DocumentBranding } from "./documentBranding.types";

/**
 * The neutral document identity.
 *
 * Every field is empty except the name, which is the product's own — because a
 * document with no issuer at all is unusable, while a document naming the
 * WRONG issuer is a tenancy failure. This is what a brand-new organization
 * with nothing configured renders, and it names no tenant.
 */
export const NEUTRAL_DOCUMENT_BRANDING: DocumentBranding = {
  organizationName: "Smart ARK",
  legalName: "",
  logoUrl: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  taxId: "",
  authorizedSignatory: "",
  footerNote: "",
  receiptPrimaryColor: "",
  receiptSecondaryColor: "",
  receiptAccentColor: "",
};

const s = (v: unknown): string => (v == null ? "" : String(v).trim());

interface BrandingRow {
  logo_url: string | null;
  authorized_signatory: string | null;
  tax_id: string | null;
  document_footer_note: string | null;
  receipt_primary_color: string | null;
  receipt_secondary_color: string | null;
  receipt_accent_color: string | null;
}

/**
 * Columns added by migration 20260912_phase7a. Selected by name so a database
 * that has not run the migration fails LOUDLY here rather than silently
 * rendering unbranded documents forever.
 *
 * PostgREST 42703s the whole SELECT when a named column is absent, so the catch
 * below degrades to the org-only identity — the tenant's own name still
 * appears, and the missing migration is reported once to the console rather
 * than swallowed.
 */
const BRANDING_COLUMNS =
  "logo_url, authorized_signatory, tax_id, document_footer_note, " +
  "receipt_primary_color, receipt_secondary_color, receipt_accent_color";

/** The one bucket a private logo could live in. Public URLs pass through. */
const LOGO_BUCKET = "branding";

class DocumentBrandingService extends BaseService {
  /**
   * Session cache.
   *
   * A payroll run emailing 200 payslips must perform ONE branding lookup, not
   * 200, for values that change perhaps twice a year. Held as the promise, not
   * the result, so 200 concurrent callers share a single in-flight request
   * rather than starting 200 identical ones.
   */
  private cache: Promise<DocumentBranding> | null = null;

  /**
   * Drop the cache so the next document picks up an edit.
   *
   * Also clears `orgContextService`: the two read overlapping columns, and a
   * receipt showing the new name beside a WhatsApp message showing the old one
   * is precisely the inconsistency this area exists to prevent.
   */
  invalidate(): void {
    this.cache = null;
    orgContextService.invalidate();
  }

  resolve(): Promise<DocumentBranding> {
    if (!this.cache) this.cache = this.load();
    return this.cache;
  }

  private async load(): Promise<DocumentBranding> {
    // orgContextService already resolves name/phone/email/website/address with
    // the correct preference order, tenant-scoped and cached. Reusing it keeps
    // ONE definition of "what is this organization called" — a document and a
    // WhatsApp message must never disagree about the tenant's own name.
    const [org, branding] = await Promise.all([
      orgContextService.vars(),
      this.brandingRow(),
    ]);

    const organizationName = org.org_name || NEUTRAL_DOCUMENT_BRANDING.organizationName;

    return {
      organizationName,
      legalName: org.org_legal_name,
      logoUrl: await this.resolveLogo(s(branding?.logo_url)),
      address: org.org_address,
      phone: org.org_phone,
      email: org.org_email,
      website: org.org_website,
      taxId: s(branding?.tax_id),
      // An unset signatory falls back to the organization's OWN name — the
      // behaviour ARK already had, and tenant-correct for everybody else.
      authorizedSignatory: s(branding?.authorized_signatory) || organizationName,
      footerNote: s(branding?.document_footer_note),
      receiptPrimaryColor: s(branding?.receipt_primary_color),
      receiptSecondaryColor: s(branding?.receipt_secondary_color),
      receiptAccentColor: s(branding?.receipt_accent_color),
    };
  }

  private async brandingRow(): Promise<BrandingRow | null> {
    // No .eq("organization_id", …): RLS restricts this table to the caller's
    // own organization, and a client-side filter would imply the browser knows
    // better than the database.
    const { data, error } = await this.db
      .from("organization_branding" as never)
      .select(BRANDING_COLUMNS)
      .limit(1)
      .maybeSingle();

    if (error) {
      // Degrade to the org-only identity rather than throwing: a payslip that
      // renders without a logo is recoverable, one that fails to open is not.
      // Reported rather than swallowed — silence here looks identical to a
      // tenant that simply has not configured anything.
      console.error("[documentBranding] branding row unavailable:", error.message);
      return null;
    }
    return (data as unknown as BrandingRow) ?? null;
  }

  /**
   * Turn a stored logo reference into something an <img> can load.
   *
   * Three shapes reach this, and only one of them needs work:
   *   • ""                       → monogram
   *   • "https://…" / "/path"    → used directly
   *   • "org-id/logo.png"        → a private storage object; signed
   *
   * Signing reuses the existing `signedUrl` helper rather than making the
   * bucket public. A logo is low-value, but flipping a bucket public to
   * simplify rendering is the habit that made payslips world-readable once
   * already.
   */
  private async resolveLogo(stored: string): Promise<string> {
    if (!stored) return "";
    if (/^(https?:)?\/\//.test(stored) || stored.startsWith("/") || stored.startsWith("data:")) {
      return stored;
    }
    // html2canvas cannot rasterise an image it fails to fetch, and a null here
    // degrades to the monogram — which is tenant-correct, unlike a broken icon.
    return (await signedUrl(LOGO_BUCKET, stored)) ?? "";
  }
}

export const documentBrandingService = new DocumentBrandingService();

/**
 * Resolve the branding for the CURRENT tenant's documents.
 *
 * Takes no arguments. See the scoping note at the top of this file — that is
 * the tenant-isolation guarantee, not an oversight.
 */
export const resolveDocumentBranding = (): Promise<DocumentBranding> =>
  documentBrandingService.resolve();

/** Call after saving branding so the next document reflects the edit. */
export const invalidateDocumentBranding = (): void => documentBrandingService.invalidate();
