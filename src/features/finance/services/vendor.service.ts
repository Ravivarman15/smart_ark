import { BaseService, AppError } from "@/shared/services";
import type { Vendor, VendorInput } from "../types/finance.types";

// ─────────────────────────────────────────────────────────────────────────────
// Vendor / supplier directory. Vendors are referenced by expense transactions
// and recurring schedules. Service is best-effort — if the `vendors` table is
// missing (pre-migration), list returns an empty array so the expense form
// renders without a vendor picker.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  gst_number: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string | null;
};

const toVendor = (r: Row): Vendor => ({
  id: r.id,
  name: r.name,
  contactPerson: r.contact_person ?? undefined,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  gstNumber: r.gst_number ?? undefined,
  address: r.address ?? undefined,
  paymentTerms: r.payment_terms ?? undefined,
  notes: r.notes ?? undefined,
  isActive: r.is_active ?? true,
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? r.created_at,
});

class VendorService extends BaseService {
  async list(activeOnly = false): Promise<Vendor[]> {
    let q = this.db.from("vendors").select("*");
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q.order("name", { ascending: true });
    if (error) return [];
    return ((data as Row[]) ?? []).map(toVendor);
  }

  async getById(id: string): Promise<Vendor> {
    const res = await this.db.from("vendors").select("*").eq("id", id).single();
    return toVendor(this.guard(res, "vendor") as unknown as Row);
  }

  async create(input: VendorInput, createdBy?: string): Promise<Vendor> {
    const res = await this.db
      .from("vendors")
      .insert({
        name: input.name,
        contact_person: input.contactPerson ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        gst_number: input.gstNumber ?? null,
        address: input.address ?? null,
        payment_terms: input.paymentTerms ?? null,
        notes: input.notes ?? null,
        is_active: input.isActive,
        created_by: createdBy ?? null,
      } as never)
      .select("id")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "vendor");
    return this.getById((res.data as { id: string }).id);
  }

  async update(id: string, input: VendorInput): Promise<Vendor> {
    const res = await this.db
      .from("vendors")
      .update({
        name: input.name,
        contact_person: input.contactPerson ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        gst_number: input.gstNumber ?? null,
        address: input.address ?? null,
        payment_terms: input.paymentTerms ?? null,
        notes: input.notes ?? null,
        is_active: input.isActive,
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "vendor");
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.from("vendors").delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "vendor");
  }
}

export const vendorService = new VendorService();
