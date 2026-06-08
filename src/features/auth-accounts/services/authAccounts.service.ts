// ── Student & Parent Authentication — service ────────────────────────────────
// Client gateway to the student-parent-accounts edge function (provision / verify
// / reset / status / link) plus read-only account listing + the Account Health
// snapshot. Degrades gracefully before the migration is applied.

import { BaseService, AppError } from "@/shared/services";
import { summarizeAccountHealth } from "../utils/authAccounts";
import type {
  AccountStatus,
  AccountVerifyResult,
  AccountHealthSnapshot,
  StudentAuthAccount,
  ParentAuthAccount,
} from "../types/authAccounts.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

const num = (v: unknown): string | undefined => (v == null ? undefined : String(v));

class AuthAccountsService extends BaseService {
  private async invoke(body: Record<string, unknown>): Promise<AccountVerifyResult> {
    try {
      const { data, error } = await this.db.functions.invoke("student-parent-accounts", { body });
      if (error) {
        return { ok: false, reason: "edge_error", message: (error as { message?: string }).message ?? "Provisioning service unavailable. Deploy student-parent-accounts." };
      }
      return data as AccountVerifyResult;
    } catch (e) {
      return { ok: false, reason: "edge_error", message: (e as Error).message };
    }
  }

  createStudent(input: { studentId: string; username?: string; email?: string; mobile?: string }) {
    return this.invoke({ action: "create_student", ...input });
  }
  createParent(input: { name: string; username?: string; email?: string; mobile?: string; studentIds?: string[] }) {
    return this.invoke({ action: "create_parent", ...input });
  }
  verify(input: { subject: "student" | "parent"; accountId?: string; studentId?: string; loginUrl?: string }) {
    return this.invoke({ action: "verify", ...input });
  }
  resetPassword(input: { subject: "student" | "parent"; accountId: string }) {
    return this.invoke({ action: "reset_password", ...input });
  }
  setStatus(input: { subject: "student" | "parent"; accountId: string; status: AccountStatus }) {
    return this.invoke({ action: "set_status", ...input });
  }
  linkStudent(input: { parentAccountId: string; studentId: string; relation?: string; isPrimary?: boolean }) {
    return this.invoke({ action: "link_student", ...input });
  }

  async listStudentAccounts(): Promise<StudentAuthAccount[]> {
    const res = await this.db
      .from("student_auth_accounts" as never)
      .select("id, student_id, user_id, username, login_email, mobile, status, last_login_at");
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_auth_accounts");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      studentId: String(r.student_id),
      userId: num(r.user_id),
      username: num(r.username),
      loginEmail: num(r.login_email),
      mobile: num(r.mobile),
      status: (r.status as AccountStatus) ?? "pending",
      lastLoginAt: num(r.last_login_at),
    }));
  }

  async listParentAccounts(): Promise<ParentAuthAccount[]> {
    const res = await this.db
      .from("parent_auth_accounts" as never)
      .select("id, user_id, name, username, login_email, email, mobile, status");
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "parent_auth_accounts");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      userId: num(r.user_id),
      name: num(r.name),
      username: num(r.username),
      loginEmail: num(r.login_email),
      email: num(r.email),
      mobile: num(r.mobile),
      status: (r.status as AccountStatus) ?? "pending",
      linkedStudentIds: [],
    }));
  }

  async health(): Promise<AccountHealthSnapshot> {
    const [studentAccounts, parentAccounts] = await Promise.all([
      this.listStudentAccounts(),
      this.listParentAccounts(),
    ]);

    let totalStudents = 0;
    const studRes = await this.db
      .from("students" as never)
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (!studRes.error) totalStudents = studRes.count ?? 0;

    return summarizeAccountHealth({ totalStudents, studentAccounts, parentAccounts });
  }
}

export const authAccountsService = new AuthAccountsService();
