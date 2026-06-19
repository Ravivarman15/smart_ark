import { BaseService, AppError } from "@/shared/services";
import { isSchemaMissing, toDemo } from "./leadMappers";
import type { DemoClass } from "../types/lead.types";

class DemosService extends BaseService {
  async schedule(input: {
    leadId: string;
    facultyId?: string;
    scheduledAt: string;
    batch?: string;
    subject?: string;
    mode?: "offline" | "online";
    notes?: string;
    createdBy?: string;
  }): Promise<DemoClass | null> {
    const res = await this.db
      .from("demo_classes")
      .insert({
        lead_id: input.leadId,
        faculty_id: input.facultyId ?? null,
        scheduled_at: input.scheduledAt,
        batch: input.batch ?? null,
        subject: input.subject ?? null,
        mode: input.mode ?? "offline",
        status: "scheduled",
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
      } as never)
      .select()
      .maybeSingle();
    if (res.error) {
      if (isSchemaMissing(res.error)) return null;
      throw AppError.fromSupabase(res.error, "demos.schedule");
    }
    return res.data ? toDemo(res.data as Record<string, unknown>) : null;
  }

  async setStatus(id: string, status: DemoClass["status"], actorProfileId?: string): Promise<void> {
    const res = await this.db
      .from("demo_classes")
      .update({ status, updated_by: actorProfileId ?? null } as never)
      .eq("id", id);
    if (res.error && !isSchemaMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "demos.setStatus");
    }
  }

  async listForLead(leadId: string): Promise<DemoClass[]> {
    const res = await this.db
      .from("demo_classes")
      .select("*")
      .eq("lead_id", leadId)
      .order("scheduled_at", { ascending: false });
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[]) ?? []).map(toDemo);
  }

  /** Faculty board / reminders: demos in a date range. */
  async listBetween(fromISO: string, toISO: string, facultyId?: string): Promise<DemoClass[]> {
    let q = this.db
      .from("demo_classes")
      .select("*")
      .gte("scheduled_at", fromISO)
      .lte("scheduled_at", toISO)
      .order("scheduled_at", { ascending: true });
    if (facultyId) q = q.eq("faculty_id", facultyId);
    const res = await q;
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[]) ?? []).map(toDemo);
  }
}

export const demosService = new DemosService();
