import { BaseService, AppError } from "@/shared/services";
import { toAppStatus, toDbStatus } from "../utils/status";
import type {
  CreateEnquiryInput,
  Enquiry,
  EnquiryStatus,
  UpdateEnquiryInput,
} from "../types/enquiry.types";

// ── DB row shape (private) ───────────────────────────────────────────────────
type AdmissionCallRow = {
  id: string;
  prospect_name: string | null;
  phone: string | null;
  date: string | null;
  status: string | null;
  notes: string | null;
  is_walkin: boolean | null;
  priority: string | null;
  assigned_to: string | null;
  follow_up_date: string | null;
  interested_standard: string | null;
  interested_course: string | null;
};

const toDomain = (r: AdmissionCallRow): Enquiry => ({
  id: r.id,
  name: r.prospect_name ?? "",
  phone: r.phone ?? "",
  date: r.date ?? new Date().toISOString().split("T")[0],
  status: toAppStatus(r.status),
  notes: r.notes ?? "",
  type: r.is_walkin ? "walk-in" : "call",
  priority: (r.priority as "high" | "medium" | "low") || "medium",
  assignedTo: r.assigned_to ?? undefined,
  followUpDate: r.follow_up_date ?? undefined,
  interestedStandard: r.interested_standard ?? undefined,
  interestedCourse: r.interested_course ?? undefined,
  history: [],
});

const toDb = (i: Partial<CreateEnquiryInput>) => {
  const out: Record<string, unknown> = {};
  if (i.name !== undefined) out.prospect_name = i.name;
  if (i.phone !== undefined) out.phone = i.phone;
  if (i.date !== undefined) out.date = i.date;
  if (i.status !== undefined) out.status = toDbStatus(i.status);
  if (i.notes !== undefined) out.notes = i.notes;
  if (i.type !== undefined) out.is_walkin = i.type === "walk-in";
  if (i.priority !== undefined) out.priority = i.priority;
  if (i.assignedTo !== undefined) out.assigned_to = i.assignedTo || null;
  if (i.followUpDate !== undefined) out.follow_up_date = i.followUpDate || null;
  if (i.interestedStandard !== undefined) out.interested_standard = i.interestedStandard || null;
  if (i.interestedCourse !== undefined) out.interested_course = i.interestedCourse || null;
  return out;
};

// ── Service ──────────────────────────────────────────────────────────────────
class EnquiriesService extends BaseService {
  async list(): Promise<Enquiry[]> {
    const res = await this.db
      .from("admission_calls")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = this.guardList(res, "admission_calls");
    return (rows as unknown as AdmissionCallRow[]).map(toDomain);
  }

  async getById(id: string): Promise<Enquiry> {
    const res = await this.db.from("admission_calls").select("*").eq("id", id).single();
    const row = this.guard(res, "enquiry");
    return toDomain(row as unknown as AdmissionCallRow);
  }

  /**
   * Create an enquiry. The caller's profile id is stored as the
   * recording admin (admin_id column).
   */
  async create(input: CreateEnquiryInput, adminProfileId?: string): Promise<Enquiry> {
    const payload = {
      ...toDb(input),
      admin_id: adminProfileId ?? null,
    };
    const res = await this.db
      .from("admission_calls")
      .insert(payload as never)
      .select()
      .single();
    const row = this.guard(res, "enquiry");
    return toDomain(row as unknown as AdmissionCallRow);
  }

  async updateStatus(id: string, status: EnquiryStatus): Promise<void> {
    const { error } = await this.db
      .from("admission_calls")
      .update({ status: toDbStatus(status) } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "enquiry.updateStatus");
  }

  /** Assign a lead to a staff member (profiles.id). */
  async assign(id: string, staffProfileId: string): Promise<void> {
    const { error } = await this.db
      .from("admission_calls")
      .update({ assigned_to: staffProfileId } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "enquiry.assign");
  }

  /** Generic patch (notes, priority, dates, etc). */
  async update(id: string, updates: UpdateEnquiryInput): Promise<void> {
    const patch = toDb(updates);
    if (Object.keys(patch).length === 0) return;
    const { error } = await this.db.from("admission_calls").update(patch as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "enquiry.update");
  }
}

export const enquiriesService = new EnquiriesService();
