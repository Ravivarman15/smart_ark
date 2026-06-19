// Lead activity timeline + audit trail writer.
// Every lead-mutating service logs through here so the timeline (lead_activities)
// and the security audit (lead_audit) stay complete. Degrades silently.

import { BaseService } from "@/shared/services";
import { isSchemaMissing, toActivity } from "./leadMappers";
import { queryKeys } from "@/core/constants/queryKeys";
import type { LeadActivity, LeadActivityType } from "../types/lead.types";

export interface LogActivityInput {
  leadId: string;
  type: LeadActivityType;
  detail?: string;
  oldValue?: string;
  newValue?: string;
  actorId?: string;
  actorName?: string;
  ip?: string;
  device?: string;
}

export interface AuditInput {
  entityType: string;
  entityId?: string;
  action: string;
  detail?: string;
  oldValue?: string;
  newValue?: string;
  actorId?: string;
  actorName?: string;
}

class LeadActivityService extends BaseService {
  /** Append a timeline entry. Never throws — automation must not break on logging. */
  async log(input: LogActivityInput): Promise<void> {
    const res = await this.db.from("lead_activities").insert({
      lead_id: input.leadId,
      type: input.type,
      detail: input.detail ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      actor_id: input.actorId ?? null,
      actor_name: input.actorName ?? null,
      ip_address: input.ip ?? null,
      device: input.device ?? null,
      created_by: input.actorId ?? null,
    } as never);
    if (res.error && !isSchemaMissing(res.error) && import.meta.env.DEV) {
      console.warn("[leads] activity log failed:", res.error.message);
    }
  }

  /** Append a security/audit entry (export, delete, escalation…). */
  async audit(input: AuditInput): Promise<void> {
    const res = await this.db.from("lead_audit").insert({
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      detail: input.detail ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      actor_id: input.actorId ?? null,
      actor_name: input.actorName ?? null,
    } as never);
    if (res.error && !isSchemaMissing(res.error) && import.meta.env.DEV) {
      console.warn("[leads] audit failed:", res.error.message);
    }
  }

  async listForLead(leadId: string): Promise<LeadActivity[]> {
    const res = await this.db
      .from("lead_activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[]) ?? []).map(toActivity);
  }
}

export const leadActivityService = new LeadActivityService();
export const LEAD_ACTIVITY_KEY = queryKeys.leads.activities;
