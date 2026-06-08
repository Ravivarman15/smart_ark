import { BaseService } from "@/shared/services";
import type {
  PayrollAuditEntityType,
  PayrollAuditEntry,
} from "../types/payroll.types";

export interface PayrollAuditActor {
  actorId?: string;
  actorName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Best-effort payroll audit logger. Every lifecycle event (rate change, shift
// change, run generated/approved/paid, item edited) calls `log()`. Failures are
// swallowed — audit must NEVER break a write — but each row gives management a
// who / when / old → new trail across the module.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  detail: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

const toEntry = (r: Row): PayrollAuditEntry => ({
  id: r.id,
  entityType: r.entity_type as PayrollAuditEntityType,
  entityId: r.entity_id,
  action: r.action,
  detail: r.detail ?? undefined,
  oldValue: r.old_value ?? undefined,
  newValue: r.new_value ?? undefined,
  reason: r.reason ?? undefined,
  actorId: r.actor_id ?? undefined,
  actorName: r.actor_name ?? undefined,
  createdAt: r.created_at,
});

class PayrollAuditService extends BaseService {
  async log(args: {
    entityType: PayrollAuditEntityType;
    entityId: string;
    action: string;
    detail?: string;
    oldValue?: string;
    newValue?: string;
    reason?: string;
    actor?: PayrollAuditActor;
  }): Promise<void> {
    try {
      await this.db.from("payroll_audit" as never).insert({
        entity_type: args.entityType,
        entity_id: args.entityId,
        action: args.action,
        detail: args.detail ?? null,
        old_value: args.oldValue ?? null,
        new_value: args.newValue ?? null,
        reason: args.reason ?? null,
        actor_id: args.actor?.actorId ?? null,
        actor_name: args.actor?.actorName ?? null,
      } as never);
    } catch {
      /* audit is best-effort */
    }
  }

  async list(
    entityType: PayrollAuditEntityType,
    entityId?: string,
  ): Promise<PayrollAuditEntry[]> {
    let q = this.db
      .from("payroll_audit" as never)
      .select("*")
      .eq("entity_type", entityType)
      .order("created_at", { ascending: false })
      .limit(200);
    if (entityId) q = q.eq("entity_id", entityId);
    const { data, error } = await q;
    if (error) return [];
    return ((data as unknown as Row[]) ?? []).map(toEntry);
  }

  /** Whole-module recent activity (audit center). */
  async recent(limit = 200): Promise<PayrollAuditEntry[]> {
    const { data, error } = await this.db
      .from("payroll_audit" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return ((data as unknown as Row[]) ?? []).map(toEntry);
  }
}

export const payrollAuditService = new PayrollAuditService();
