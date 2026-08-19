// ──────────────────────────────────────────────────────────────────────────────
// WHO IS ON THE INVOICE
//
// The two parties, resolved from the same rows for both audiences:
//
//   supplier   Smart ARK — `platform_settings.gst_profile` + `platform_branding`
//   recipient  the tenant — `billing_profiles`, falling back to `organizations`
//
// ┌── WHY A TENANT CAN READ THE SUPPLIER BLOCK ────────────────────────────┐
// │ `platform_settings` is SELECT-able as `is_platform_admin() OR NOT      │
// │ is_secret`, and `gst_profile` / `platform_branding` are both marked    │
// │ non-secret. That is correct rather than a leak: our GSTIN and          │
// │ registered address are printed on every invoice we issue, so they are  │
// │ published information by definition. Provider keys live under          │
// │ `providers` and stay behind the secret flag.                           │
// └────────────────────────────────────────────────────────────────────────┘
//
// Nothing here throws. A missing billing profile is normal — the tenant simply
// has not filled it in — and it must degrade to the organization's legal name
// rather than failing the download of an invoice that already exists.

import { BaseService } from "@/shared/services";
import type { InvoiceRecipient, InvoiceSupplier } from "./invoicePdf";

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

const FALLBACK_SUPPLIER: InvoiceSupplier = {
  legalName: "Smart ARK",
  gstin: null,
  address: null,
  stateName: null,
  stateCode: null,
  supportEmail: null,
  sac: "998434",
};

class InvoicePartiesService extends BaseService {
  /**
   * Cached for the session.
   *
   * A console listing twenty invoices must not fetch our own GSTIN twenty
   * times for a value that changes about once. Same argument as
   * `orgContext.service`, and cleared the same way if it is ever edited.
   */
  private supplierCache: Promise<InvoiceSupplier> | null = null;

  invalidate(): void {
    this.supplierCache = null;
  }

  supplier(): Promise<InvoiceSupplier> {
    if (!this.supplierCache) this.supplierCache = this.loadSupplier();
    return this.supplierCache;
  }

  private async loadSupplier(): Promise<InvoiceSupplier> {
    const res = await this.db
      .from("platform_settings" as never)
      .select("key, value")
      .in("key", ["gst_profile", "platform_branding"]);
    if (res.error) {
      console.warn("[invoiceParties] supplier block unavailable", res.error.message);
      return FALLBACK_SUPPLIER;
    }

    const rows = (res.data ?? []) as unknown as { key: string; value: Record<string, unknown> }[];
    const gst = rows.find((r) => r.key === "gst_profile")?.value ?? {};
    const brand = rows.find((r) => r.key === "platform_branding")?.value ?? {};

    return {
      legalName: str(gst.legal_name) ?? str(brand.name) ?? FALLBACK_SUPPLIER.legalName,
      gstin: str(gst.gstin),
      address: str(gst.address),
      stateName: str(gst.state_name),
      stateCode: str(gst.state_code),
      supportEmail: str(brand.support_email),
      sac: str(gst.sac) ?? FALLBACK_SUPPLIER.sac,
    };
  }

  /**
   * The billed party.
   *
   * `organizationId` is passed rather than inferred because the platform
   * console renders another tenant's invoice. It is not a trust decision: RLS
   * on `billing_profiles` already requires either the caller's own org or
   * `platform_can('billing.read')`, so an id the caller has no claim on
   * returns nothing and falls through to the organization row — which is
   * itself RLS-scoped.
   */
  async recipient(organizationId: string): Promise<InvoiceRecipient> {
    const [bpRes, orgRes] = await Promise.all([
      this.db
        .from("billing_profiles" as never)
        .select(
          "legal_name, gstin, billing_email, address_line1, address_line2, city, " +
            "state_code, state_name, postal_code, country",
        )
        .eq("organization_id", organizationId)
        .maybeSingle(),
      this.db
        .from("organizations" as never)
        .select("legal_name, display_name, city, state, pincode, contact_email")
        .eq("id", organizationId)
        .maybeSingle(),
    ]);

    const bp = (bpRes.error ? null : bpRes.data) as Record<string, unknown> | null;
    const org = (orgRes.error ? null : orgRes.data) as Record<string, unknown> | null;

    const addressLines = bp
      ? [
          str(bp.address_line1),
          str(bp.address_line2),
          [str(bp.city), str(bp.postal_code)].filter(Boolean).join(" ") || null,
        ].filter((v): v is string => !!v)
      : [[str(org?.city), str(org?.pincode)].filter(Boolean).join(" ")].filter(
          (v): v is string => !!v && v.length > 0,
        );

    return {
      legalName:
        str(bp?.legal_name) ?? str(org?.legal_name) ?? str(org?.display_name) ?? "Customer",
      gstin: str(bp?.gstin),
      addressLines,
      stateName: str(bp?.state_name) ?? str(org?.state),
      stateCode: str(bp?.state_code),
      billingEmail: str(bp?.billing_email) ?? str(org?.contact_email),
    };
  }
}

export const invoicePartiesService = new InvoicePartiesService();
