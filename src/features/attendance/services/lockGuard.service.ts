import { BaseService, AppError } from "@/shared/services";

// Lightweight lock/closing guard consulted by the attendance WRITE services
// before they persist. Kept as a parent-level leaf (no governance imports) so
// `staffAttendance.service` / `studentAttendance.service` can call it without a
// circular dependency. The full lock/closing CRUD lives in
// `governance/services/*` and writes the same tables.
//
// Migration-safe: if 20260613_attendance_governance.sql hasn't been applied the
// guard sees a schema-cache miss and treats everything as writable.

type Scope = "student" | "staff" | "all";

const isMissing = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205" || e.code === "42P01") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("schema cache") || m.includes("does not exist") || m.includes("relation");
};

class LockGuardService extends BaseService {
  /** Is the (scope, date) covered by an active lock or a closed month? */
  async lockReason(scope: Scope, date: string): Promise<string | null> {
    if (!date) return null;
    const scopes = scope === "all" ? ["all"] : [scope, "all"];

    // Active period lock covering the date.
    const lockRes = await this.db
      .from("attendance_locks" as never)
      .select("id, period_type, scope")
      .eq("locked", true)
      .in("scope", scopes)
      .lte("from_date", date)
      .gte("to_date", date)
      .limit(1);
    if (lockRes.error) {
      if (isMissing(lockRes.error)) return null; // governance not installed → writable
      // Any other error (RLS etc.) → don't block writes on a guard failure.
      return null;
    }
    if (((lockRes.data ?? []) as unknown[]).length > 0) {
      return "This attendance period is locked. Request an unlock from the Approval Queue to edit it.";
    }

    // Closed month covering the date.
    const month = date.slice(0, 7);
    const closeRes = await this.db
      .from("attendance_closings" as never)
      .select("id, status, scope")
      .eq("status", "closed")
      .eq("month", month)
      .in("scope", scopes)
      .limit(1);
    if (closeRes.error) return null;
    if (((closeRes.data ?? []) as unknown[]).length > 0) {
      return `${month} attendance is closed (read-only). Request a reopen from the Approval Queue to edit it.`;
    }
    return null;
  }

  async isLocked(scope: Scope, date: string): Promise<boolean> {
    return (await this.lockReason(scope, date)) !== null;
  }

  /** Throw a clear validation error if the (scope, date) is not writable. */
  async assertWritable(scope: Scope, date: string): Promise<void> {
    const reason = await this.lockReason(scope, date);
    if (reason) throw AppError.validation(reason);
  }
}

export const lockGuardService = new LockGuardService();
