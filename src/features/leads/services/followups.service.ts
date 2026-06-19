// Follow-up timer / escalation ladder.
// level 0 = initial 15-min follow-up, 1 = 1h escalation, 2 = 3h escalation.

import { BaseService, AppError } from "@/shared/services";
import { isSchemaMissing, toFollowup } from "./leadMappers";
import type { LeadFollowup } from "../types/lead.types";

class FollowupsService extends BaseService {
  async create(input: {
    leadId: string;
    assignedTo?: string;
    level?: number;
    channel?: string;
    dueAt: string;
    taskId?: string;
    notes?: string;
    createdBy?: string;
  }): Promise<LeadFollowup | null> {
    const res = await this.db
      .from("lead_followups")
      .insert({
        lead_id: input.leadId,
        assigned_to: input.assignedTo ?? null,
        level: input.level ?? 0,
        channel: input.channel ?? "call",
        due_at: input.dueAt,
        status: "pending",
        task_id: input.taskId ?? null,
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
      } as never)
      .select()
      .maybeSingle();
    if (res.error) {
      if (isSchemaMissing(res.error)) return null;
      throw AppError.fromSupabase(res.error, "followups.create");
    }
    return res.data ? toFollowup(res.data as Record<string, unknown>) : null;
  }

  async listForLead(leadId: string): Promise<LeadFollowup[]> {
    const res = await this.db
      .from("lead_followups")
      .select("*")
      .eq("lead_id", leadId)
      .order("due_at", { ascending: true });
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[]) ?? []).map(toFollowup);
  }

  /** List a counselor's pending follow-ups (dashboard). */
  async listPending(assignedTo: string): Promise<LeadFollowup[]> {
    const res = await this.db
      .from("lead_followups")
      .select("*")
      .eq("assigned_to", assignedTo)
      .eq("status", "pending")
      .order("due_at", { ascending: true });
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[]) ?? []).map(toFollowup);
  }

  async complete(id: string, actorProfileId?: string, notes?: string): Promise<void> {
    const res = await this.db
      .from("lead_followups")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        updated_by: actorProfileId ?? null,
        ...(notes ? { notes } : {}),
      } as never)
      .eq("id", id);
    if (res.error && !isSchemaMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "followups.complete");
    }
  }
}

export const followupsService = new FollowupsService();
