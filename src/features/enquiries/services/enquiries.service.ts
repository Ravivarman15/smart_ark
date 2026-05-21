import { BaseService, AppError } from "@/shared/services";
import { toAppStatus, toDbStatus } from "../utils/status";
import type {
  CreateEnquiryInput,
  Enquiry,
  EnquiryStatus,
  PublicEnquiryInput,
  UpdateEnquiryInput,
} from "../types/enquiry.types";

// A missing-column / stale-schema error — used to fall back to the base
// `admission_calls` columns when the 2026-05-21 migration hasn't run yet.
const isColumnError = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("column") || m.includes("schema cache");
};

// Fold the public form's extra fields into the single `notes` column so a
// lead is never lost when the email / parent_name columns don't exist yet.
const composePublicNote = (i: PublicEnquiryInput): string =>
  [
    i.parentName?.trim() && `Parent/Guardian: ${i.parentName.trim()}`,
    i.email?.trim() && `Email: ${i.email.trim()}`,
    i.interestedStandard?.trim() && `Class/Grade: ${i.interestedStandard.trim()}`,
    i.interestedCourse?.trim() && `Course of interest: ${i.interestedCourse.trim()}`,
    i.message?.trim() && `Message: ${i.message.trim()}`,
    "— Submitted via public admission form",
  ]
    .filter(Boolean)
    .join("\n");

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

  /**
   * Submit a lead from the public, unauthenticated form at /admissions/apply.
   *
   * - Inserts WITHOUT a returning `.select()` — the public RLS policy grants
   *   INSERT only, so reading the row back would fail.
   * - Always lands as an un-triaged 'interested', non-walk-in enquiry with no
   *   admin/assignee, matching the public INSERT policy's WITH CHECK.
   * - Degrades gracefully pre-migration: if the email / parent_name columns
   *   are absent it retries with only the base columns, folding the extra
   *   fields into `notes`.
   */
  async submitPublic(input: PublicEnquiryInput): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    // Columns guaranteed present since the very first migration.
    const base = {
      prospect_name: input.studentName.trim(),
      phone: input.phone.trim(),
      status: "interested",
      is_walkin: false,
      date: today,
      admin_id: null,
      assigned_to: null,
    };

    // Rich payload — uses columns added by later migrations.
    const rich = {
      ...base,
      email: input.email?.trim() || null,
      parent_name: input.parentName?.trim() || null,
      interested_standard: input.interestedStandard?.trim() || null,
      interested_course: input.interestedCourse?.trim() || null,
      priority: "medium",
      notes: input.message?.trim() || null,
    };

    let res = await this.db.from("admission_calls").insert(rich as never);

    // Pre-migration fallback: collapse extras into the base `notes` column.
    if (res.error && isColumnError(res.error)) {
      res = await this.db.from("admission_calls").insert({
        ...base,
        notes: composePublicNote(input),
      } as never);
    }

    if (res.error) throw AppError.fromSupabase(res.error, "enquiry.submitPublic");
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
