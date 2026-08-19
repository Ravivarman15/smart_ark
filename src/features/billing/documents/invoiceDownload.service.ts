// ──────────────────────────────────────────────────────────────────────────────
// DOWNLOAD ONE INVOICE
//
// The single fetch-and-render path, called by the platform console and by the
// tenant's own Billing page.
//
// ┌── WHY BOTH GO THROUGH ONE ID ──────────────────────────────────────────┐
// │ The console already holds the full invoice row, so it could render     │
// │ from memory and skip a request. It deliberately does not.              │
// │                                                                        │
// │ The tenant's Billing summary carries a REDUCED invoice shape — number, │
// │ total, status, period — with none of the GST detail a tax invoice must │
// │ print. Rendering from whatever each caller happened to have would mean │
// │ two documents with different content under one invoice number, and the │
// │ customer's copy disagreeing with ours is the failure that costs money. │
// │                                                                        │
// │ So both callers pass an id, this reads the authoritative row, and      │
// │ there is exactly one shape of invoice in the world.                    │
// └────────────────────────────────────────────────────────────────────────┘
//
// Scoping is RLS, not a parameter. `invoices` is readable as
// `platform_can('billing.read') OR organization_id = current_org_id()`, so a
// tenant asking for someone else's id gets nothing and this throws — the same
// answer the database would give, rather than a second check that could differ.

import { BaseService } from "@/shared/services";
import { AppError } from "@/shared/services";
import { downloadInvoicePdf, type InvoiceDocument, type InvoiceDocumentLine } from "./invoicePdf";
import { invoicePartiesService } from "./invoiceParties.service";

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : Number(v ?? d) || d);
const str = (v: unknown) => (v == null ? null : String(v));

class InvoiceDownloadService extends BaseService {
  async load(invoiceId: string): Promise<{
    invoice: InvoiceDocument;
    lines: InvoiceDocumentLine[];
    organizationId: string;
  }> {
    // Widened once here: `invoices` postdates the generated Supabase types, so
    // the builder resolves to `never` and every field read would otherwise
    // need its own cast.
    const res = (await this.db
      .from("invoices" as never)
      .select(
        "id, organization_id, invoice_number, status, currency, subtotal, discount_total, " +
          "tax_total, total, cgst, sgst, igst, gst_treatment, place_of_supply, " +
          "period_start, period_end, issued_at, due_at, paid_at, notes",
      )
      .eq("id", invoiceId)
      .maybeSingle()) as { data: unknown; error: { message: string } | null };
    if (res.error) throw AppError.fromSupabase(res.error, "invoices");
    if (!res.data) {
      throw AppError.validation("That invoice could not be read on this account.");
    }
    const r = res.data as unknown as Record<string, unknown>;

    const linesRes = await this.db
      .from("invoice_lines" as never)
      .select("description, quantity, unit_amount, amount, tax_percent, hsn_sac, sort_order")
      .eq("invoice_id", invoiceId)
      .order("sort_order");
    if (linesRes.error) throw AppError.fromSupabase(linesRes.error, "invoice_lines");

    return {
      organizationId: String(r.organization_id),
      invoice: {
        number: String(r.invoice_number),
        status: String(r.status),
        currency: String(r.currency ?? "INR"),
        issuedAt: str(r.issued_at),
        dueAt: str(r.due_at),
        paidAt: str(r.paid_at),
        periodStart: str(r.period_start),
        periodEnd: str(r.period_end),
        subtotal: num(r.subtotal),
        discountTotal: num(r.discount_total),
        cgst: num(r.cgst),
        sgst: num(r.sgst),
        igst: num(r.igst),
        taxTotal: num(r.tax_total),
        total: num(r.total),
        gstTreatment: str(r.gst_treatment),
        placeOfSupply: str(r.place_of_supply),
        notes: str(r.notes),
      },
      lines: ((linesRes.data ?? []) as unknown as Record<string, unknown>[]).map((l) => ({
        description: String(l.description),
        quantity: num(l.quantity, 1),
        unitAmount: num(l.unit_amount),
        amount: num(l.amount),
        taxPercent: num(l.tax_percent),
        hsnSac: str(l.hsn_sac),
      })),
    };
  }

  /** Fetch, render and save. Throws with a readable message on every failure. */
  async download(invoiceId: string): Promise<void> {
    const { invoice, lines, organizationId } = await this.load(invoiceId);
    const [supplier, recipient] = await Promise.all([
      invoicePartiesService.supplier(),
      invoicePartiesService.recipient(organizationId),
    ]);
    downloadInvoicePdf(invoice, lines, supplier, recipient);
  }
}

export const invoiceDownloadService = new InvoiceDownloadService();
