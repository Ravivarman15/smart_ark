// ── Parent Portal — audit trail ──────────────────────────────────────────────
//
// Records what a parent DID inside the portal. Login lifecycle already lives in
// `auth_login_audit` (written by the student-parent-accounts edge function);
// this covers the in-portal actions the brief calls out — logins landing on the
// portal, downloads, and preference changes.
//
// Every write is fire-and-forget. An audit failure must never block a parent
// from downloading their child's report card: the alternative is a portal that
// breaks when a logging table is missing, which is strictly worse than a gap in
// the trail. Failures are surfaced to the console for operators.

import { BaseService } from "@/shared/services";

export type ParentAuditEvent =
  | "login"
  | "logout"
  | "view_child"
  | "download_report"
  | "download_receipt"
  | "download_document"
  | "update_preferences"
  | "change_password"
  | "access_denied";

export interface ParentAuditInput {
  parentAccountId: string;
  event: ParentAuditEvent;
  studentId?: string;
  detail?: string;
}

class ParentAuditService extends BaseService {
  async log(input: ParentAuditInput): Promise<void> {
    try {
      const { error } = await this.db.from("parent_portal_audit" as never).insert({
        parent_account_id: input.parentAccountId,
        student_id: input.studentId ?? null,
        event: input.event,
        detail: input.detail ?? null,
        // A best-effort client hint, not an identity claim — the trustworthy
        // identity is parent_account_id, which RLS ties to auth.uid().
        device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      } as never);
      if (error) console.warn("[parentAudit] write failed:", error.message);
    } catch (e) {
      console.warn("[parentAudit] write threw:", (e as Error).message);
    }
  }

  /**
   * How many times this parent has opened the portal in the last `days`.
   *
   * Counts `login` rows only — one is written per portal session, not per
   * navigation, so this is "visits" and not "clicks". A head-only count keeps
   * it a single cheap query with no rows transferred.
   *
   * Returns 0 rather than throwing: the engagement card is a nice-to-have and
   * must never be the reason a dashboard fails to render.
   */
  async visitCount(parentAccountId: string, days = 30): Promise<number> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const res = await this.db
      .from("parent_portal_audit" as never)
      .select("id", { count: "exact", head: true })
      .eq("parent_account_id", parentAccountId)
      .eq("event", "login")
      .gte("created_at", since);
    if (res.error) return 0;
    return res.count ?? 0;
  }

  /** The signed-in parent's own trail — shown read-only in Settings. */
  async myTrail(parentAccountId: string, limit = 50) {
    const res = await this.db
      .from("parent_portal_audit" as never)
      .select("id, event, detail, student_id, created_at")
      .eq("parent_account_id", parentAccountId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) return [];
    return ((res.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      event: String(r.event) as ParentAuditEvent,
      detail: (r.detail as string) ?? undefined,
      studentId: (r.student_id as string) ?? undefined,
      createdAt: String(r.created_at),
    }));
  }
}

export const parentAuditService = new ParentAuditService();
