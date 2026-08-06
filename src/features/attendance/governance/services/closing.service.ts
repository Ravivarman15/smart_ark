import { BaseService, AppError } from "@/shared/services";
import type { AttendanceMarker } from "../../types/attendance.types";
import { governanceAuditService, isGovMissing } from "./governanceAudit.service";
import type { AttendanceClosing, ClosingStatus, GovScope } from "../types/governance.types";

const toClosing = (r: Record<string, unknown>): AttendanceClosing => ({
  id: String(r.id),
  scope: (r.scope as GovScope) ?? "all",
  month: String(r.month ?? ""),
  status: (r.status as ClosingStatus) ?? "closed",
  remarks: (r.remarks as string) ?? undefined,
  closedBy: (r.closed_by as string) ?? undefined,
  closedByName: (r.closed_by_name as string) ?? undefined,
  closedAt: (r.closed_at as string) ?? undefined,
  reopenedBy: (r.reopened_by as string) ?? undefined,
  reopenedByName: (r.reopened_by_name as string) ?? undefined,
  reopenedAt: (r.reopened_at as string) ?? undefined,
  reopenReason: (r.reopen_reason as string) ?? undefined,
  updatedAt: (r.updated_at as string) ?? undefined,
});

const COLS =
  "id, scope, month, status, remarks, closed_by, closed_by_name, closed_at, " +
  "reopened_by, reopened_by_name, reopened_at, reopen_reason, updated_at";

/**
 * Monthly closing register. Closing a (scope, month) makes that month read-only
 * — `lockGuardService` blocks writes to any date inside a month whose closing
 * status is 'closed'. Reopening (after an approved request) flips it back.
 */
class ClosingService extends BaseService {
  private table() {
    return this.db.from("attendance_closings" as never);
  }

  async list(): Promise<AttendanceClosing[]> {
    const res = await this.table().select(COLS).order("month", { ascending: false }).limit(500);
    if (res.error) {
      if (isGovMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "attendance_closings");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(toClosing);
  }

  async close(scope: GovScope, month: string, remarks: string | undefined, marker?: AttendanceMarker): Promise<void> {
    const payload = {
      scope,
      month,
      status: "closed",
      remarks: remarks ?? null,
      closed_by: marker?.profileId ?? null,
      closed_by_name: marker?.name ?? null,
      closed_at: new Date().toISOString(),
    };
    const res = await this.table().upsert(payload as never, { onConflict: "organization_id,scope,month" });
    if (res.error) throw AppError.fromSupabase(res.error, "attendance_closings.close");
    await governanceAuditService.log(
      {
        entityType: "closing",
        action: "closed",
        scope,
        summary: `Closed ${scope} attendance for ${month}`,
        newValue: { scope, month },
        reason: remarks,
      },
      marker,
    );
  }

  async reopen(scope: GovScope, month: string, reason: string, marker?: AttendanceMarker): Promise<void> {
    const res = await this.table()
      .update({
        status: "reopened",
        reopened_by: marker?.profileId ?? null,
        reopened_by_name: marker?.name ?? null,
        reopened_at: new Date().toISOString(),
        reopen_reason: reason,
      } as never)
      .eq("scope", scope)
      .eq("month", month);
    if (res.error && !isGovMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "attendance_closings.reopen");
    }
    await governanceAuditService.log(
      {
        entityType: "closing",
        action: "reopened",
        scope,
        summary: `Reopened ${scope} attendance for ${month}`,
        newValue: { scope, month },
        reason,
      },
      marker,
    );
  }
}

export const closingService = new ClosingService();
