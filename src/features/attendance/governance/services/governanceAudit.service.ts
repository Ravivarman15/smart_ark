import { BaseService, AppError } from "@/shared/services";
import type { AttendanceMarker } from "../../types/attendance.types";
import type { GovAuditAction, GovAuditEntry } from "../types/governance.types";

export const isGovMissing = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205" || e.code === "42P01") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("schema cache") || m.includes("does not exist") || m.includes("relation");
};

export interface GovAuditInput {
  entityType: string;
  entityId?: string;
  action: GovAuditAction;
  scope?: string;
  summary?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
}

const toEntry = (r: Record<string, unknown>): GovAuditEntry => ({
  id: String(r.id),
  entityType: String(r.entity_type ?? ""),
  entityId: (r.entity_id as string) ?? undefined,
  action: r.action as GovAuditAction,
  scope: (r.scope as string) ?? undefined,
  summary: (r.summary as string) ?? undefined,
  oldValue: (r.old_value as Record<string, unknown>) ?? undefined,
  newValue: (r.new_value as Record<string, unknown>) ?? undefined,
  reason: (r.reason as string) ?? undefined,
  actorId: (r.actor_id as string) ?? undefined,
  actorName: (r.actor_name as string) ?? undefined,
  actorRole: (r.actor_role as string) ?? undefined,
  createdAt: String(r.created_at ?? ""),
});

/**
 * Append-only governance audit. `log()` is best-effort — a failed audit write
 * never blocks the governance action that triggered it. The Audit Center reads
 * the unified timeline via `list()`.
 */
class GovernanceAuditService extends BaseService {
  private table() {
    return this.db.from("attendance_governance_audit" as never);
  }

  /** Fire-and-forget audit write (swallows errors so it can't break a flow). */
  async log(input: GovAuditInput, marker?: AttendanceMarker): Promise<void> {
    try {
      await this.table().insert({
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        action: input.action,
        scope: input.scope ?? null,
        summary: input.summary ?? null,
        old_value: input.oldValue ?? null,
        new_value: input.newValue ?? null,
        reason: input.reason ?? null,
        actor_id: marker?.profileId ?? null,
        actor_name: marker?.name ?? null,
        actor_role: marker?.role ?? null,
      } as never);
    } catch {
      /* audit is best-effort */
    }
  }

  async list(filters: { entityType?: string; action?: string; limit?: number } = {}): Promise<GovAuditEntry[]> {
    let q = this.table()
      .select(
        "id, entity_type, entity_id, action, scope, summary, old_value, new_value, reason, actor_id, actor_name, actor_role, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(filters.limit ?? 300);
    if (filters.entityType && filters.entityType !== "all") q = q.eq("entity_type", filters.entityType);
    if (filters.action && filters.action !== "all") q = q.eq("action", filters.action);
    const res = await q;
    if (res.error) {
      if (isGovMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "attendance_governance_audit");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(toEntry);
  }
}

export const governanceAuditService = new GovernanceAuditService();
