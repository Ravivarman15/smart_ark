import { BaseService, AppError } from "@/shared/services";
import { isSchemaMissing, toAdmission } from "./leadMappers";
import type { Admission } from "../types/lead.types";

class AdmissionsService extends BaseService {
  async create(input: {
    leadId: string;
    studentId?: string;
    counselorId?: string;
    admissionDate?: string;
    course?: string;
    batch?: string;
    campus?: string;
    feeAmount?: number;
    scholarshipAmount?: number;
    paymentStatus?: "pending" | "partial" | "paid";
    notes?: string;
    createdBy?: string;
  }): Promise<Admission | null> {
    const res = await this.db
      .from("admissions")
      .insert({
        lead_id: input.leadId,
        student_id: input.studentId ?? null,
        counselor_id: input.counselorId ?? null,
        admission_date: input.admissionDate ?? new Date().toISOString().slice(0, 10),
        course: input.course ?? null,
        batch: input.batch ?? null,
        campus: input.campus ?? null,
        fee_amount: input.feeAmount ?? 0,
        scholarship_amount: input.scholarshipAmount ?? 0,
        payment_status: input.paymentStatus ?? "pending",
        status: "confirmed",
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
      } as never)
      .select()
      .maybeSingle();
    if (res.error) {
      if (isSchemaMissing(res.error)) return null;
      throw AppError.fromSupabase(res.error, "admissions.create");
    }
    return res.data ? toAdmission(res.data as Record<string, unknown>) : null;
  }

  async list(params: { from?: string; to?: string } = {}): Promise<Admission[]> {
    let q = this.db
      .from("admissions")
      .select("*")
      .order("admission_date", { ascending: false });
    if (params.from) q = q.gte("admission_date", params.from);
    if (params.to) q = q.lte("admission_date", params.to);
    const res = await q;
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[]) ?? []).map(toAdmission);
  }

  async listForLead(leadId: string): Promise<Admission[]> {
    const res = await this.db.from("admissions").select("*").eq("lead_id", leadId);
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[]) ?? []).map(toAdmission);
  }
}

export const admissionsService = new AdmissionsService();
