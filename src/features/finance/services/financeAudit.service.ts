import { BaseService } from "@/shared/services";
import type {
  FinanceAuditEntityType,
  FinanceAuditEntry,
} from "../types/finance.types";

export interface FinanceAuditActor {
  actorId?: string;
  actorName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Best-effort finance audit logger.
//
// Every lifecycle event (create / update / approve / reject / pay / delete /
// attach …) calls `log()` from the mutation hook. Failures are swallowed —
// audit must NEVER break a write — but every successful row gives us a
// trail visible on the Manage Expense / Income pages.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  detail: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

const toEntry = (r: Row): FinanceAuditEntry => ({
  id: r.id,
  entityType: r.entity_type as FinanceAuditEntityType,
  entityId: r.entity_id,
  action: r.action,
  detail: r.detail ?? undefined,
  actorId: r.actor_id ?? undefined,
  actorName: r.actor_name ?? undefined,
  createdAt: r.created_at,
});

class FinanceAuditService extends BaseService {
  async log(
    entityType: FinanceAuditEntityType,
    entityId: string,
    action: string,
    detail?: string,
    actor?: FinanceAuditActor,
  ): Promise<void> {
    try {
      await this.db.from("finance_audit").insert({
        entity_type: entityType,
        entity_id: entityId,
        action,
        detail: detail ?? null,
        actor_id: actor?.actorId ?? null,
        actor_name: actor?.actorName ?? null,
      } as never);
    } catch {
      /* audit is best-effort */
    }
  }

  async list(
    entityType: FinanceAuditEntityType,
    entityId: string,
  ): Promise<FinanceAuditEntry[]> {
    const { data, error } = await this.db
      .from("finance_audit")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return ((data as Row[]) ?? []).map(toEntry);
  }
}

export const financeAuditService = new FinanceAuditService();
