import { BaseService, AppError } from "@/shared/services";
import type { AttendanceMarker } from "../../types/attendance.types";
import { governanceAuditService, isGovMissing } from "./governanceAudit.service";
import { locksService } from "./locks.service";
import { closingService } from "./closing.service";
import type {
  ApprovalInput,
  ApprovalStatus,
  AttendanceApproval,
  ApprovalRequestType,
  GovScope,
  LockPeriodType,
} from "../types/governance.types";

const COLS =
  "id, request_type, entity_type, target_id, target_name, affected_from, affected_to, " +
  "old_value, new_value, reason, attachments, status, requested_by, requested_by_name, " +
  "requested_by_role, requested_at, decided_by, decided_by_name, decided_at, decision_note";

const toApproval = (r: Record<string, unknown>): AttendanceApproval => ({
  id: String(r.id),
  requestType: r.request_type as ApprovalRequestType,
  entityType: (r.entity_type as "student" | "staff") ?? "student",
  targetId: (r.target_id as string) ?? undefined,
  targetName: (r.target_name as string) ?? undefined,
  affectedFrom: (r.affected_from as string) ?? undefined,
  affectedTo: (r.affected_to as string) ?? undefined,
  oldValue: (r.old_value as Record<string, unknown>) ?? undefined,
  newValue: (r.new_value as Record<string, unknown>) ?? undefined,
  reason: (r.reason as string) ?? undefined,
  attachments: (r.attachments as string[]) ?? [],
  status: (r.status as ApprovalStatus) ?? "pending",
  requestedBy: (r.requested_by as string) ?? undefined,
  requestedByName: (r.requested_by_name as string) ?? undefined,
  requestedByRole: (r.requested_by_role as string) ?? undefined,
  requestedAt: String(r.requested_at ?? ""),
  decidedBy: (r.decided_by as string) ?? undefined,
  decidedByName: (r.decided_by_name as string) ?? undefined,
  decidedAt: (r.decided_at as string) ?? undefined,
  decisionNote: (r.decision_note as string) ?? undefined,
});

/**
 * The attendance approval queue. Anyone can FILE a request (correction /
 * backdated / bulk_import / month reopen / attendance unlock); admin /
 * management / coordinator decide. Approving a `reopen` or `unlock` request
 * performs the governance side-effect automatically.
 */
class ApprovalsService extends BaseService {
  private table() {
    return this.db.from("attendance_approvals" as never);
  }

  async list(filters: { status?: ApprovalStatus | "all"; requestType?: ApprovalRequestType | "all"; limit?: number } = {}): Promise<AttendanceApproval[]> {
    let q = this.table().select(COLS).order("requested_at", { ascending: false }).limit(filters.limit ?? 300);
    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.requestType && filters.requestType !== "all") q = q.eq("request_type", filters.requestType);
    const res = await q;
    if (res.error) {
      if (isGovMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "attendance_approvals");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(toApproval);
  }

  async create(input: ApprovalInput, marker?: AttendanceMarker): Promise<void> {
    const payload = {
      request_type: input.requestType,
      entity_type: input.entityType,
      target_id: input.targetId ?? null,
      target_name: input.targetName ?? null,
      affected_from: input.affectedFrom ?? null,
      affected_to: input.affectedTo ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      reason: input.reason ?? null,
      attachments: input.attachments ?? [],
      status: "pending",
      requested_by: marker?.profileId ?? null,
      requested_by_name: marker?.name ?? null,
      requested_by_role: marker?.role ?? null,
      requested_at: new Date().toISOString(),
    };
    const res = await this.table().insert(payload as never);
    if (res.error) throw AppError.fromSupabase(res.error, "attendance_approvals.create");
    await governanceAuditService.log(
      {
        entityType: "approval",
        action: "created",
        summary: `${input.requestType} request${input.targetName ? ` for ${input.targetName}` : ""}`,
        newValue: input.newValue,
        reason: input.reason,
      },
      marker,
    );
  }

  /** Approve / reject / return a request. Side-effects fire on approval. */
  async decide(
    approval: AttendanceApproval,
    decision: Exclude<ApprovalStatus, "pending">,
    note: string | undefined,
    marker?: AttendanceMarker,
  ): Promise<void> {
    const res = await this.table()
      .update({
        status: decision,
        decided_by: marker?.profileId ?? null,
        decided_by_name: marker?.name ?? null,
        decided_at: new Date().toISOString(),
        decision_note: note ?? null,
      } as never)
      .eq("id", approval.id);
    if (res.error) throw AppError.fromSupabase(res.error, "attendance_approvals.decide");

    // Side-effects that the queue is allowed to execute directly.
    if (decision === "approved") {
      try {
        if (approval.requestType === "reopen") {
          const scope = (approval.newValue?.scope as GovScope) ?? approval.entityType;
          const month = (approval.newValue?.month as string) ?? approval.affectedFrom?.slice(0, 7);
          if (month) await closingService.reopen(scope, month, note ?? approval.reason ?? "Approved reopen", marker);
        } else if (approval.requestType === "unlock") {
          const scope = (approval.newValue?.scope as GovScope) ?? approval.entityType;
          const periodType = (approval.newValue?.periodType as LockPeriodType) ?? "month";
          const periodKey = (approval.newValue?.periodKey as string) ?? approval.affectedFrom?.slice(0, 7);
          if (periodKey) await locksService.unlockByKey(scope, periodType, periodKey, marker, note ?? approval.reason);
        }
      } catch {
        /* side-effect best-effort — the decision itself is already recorded */
      }
    }

    const action = decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "returned";
    await governanceAuditService.log(
      {
        entityType: "approval",
        entityId: approval.id,
        action,
        summary: `${action} ${approval.requestType}${approval.targetName ? ` for ${approval.targetName}` : ""}`,
        reason: note,
      },
      marker,
    );
  }

  async pendingCount(): Promise<number> {
    const res = await this.table().select("id", { count: "exact", head: true }).eq("status", "pending");
    if (res.error) return 0;
    return res.count ?? 0;
  }
}

export const approvalsService = new ApprovalsService();
