import { BaseService, AppError } from "@/shared/services";
import type { StudentAppAccess } from "../types/student.types";

type AccessRow = {
  id: string;
  student_id: string;
  mobile_enabled: boolean;
  login_enabled: boolean;
  features: Record<string, boolean> | null;
  updated_by: string | null;
  updated_at: string | null;
};

const toDomain = (r: AccessRow): StudentAppAccess => ({
  id: r.id,
  studentId: r.student_id,
  mobileEnabled: !!r.mobile_enabled,
  loginEnabled: !!r.login_enabled,
  features: r.features ?? {},
  updatedBy: r.updated_by ?? undefined,
  updatedAt: r.updated_at ?? undefined,
});

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
};

const DEFAULTS = (studentId: string): StudentAppAccess => ({
  studentId,
  mobileEnabled: false,
  loginEnabled: false,
  features: {},
});

/**
 * Student app-access & rights. One `student_app_access` row per student;
 * `features` is a free-form jsonb permission map so new toggles never need a
 * migration. Management/Admin only (enforced by RLS + RBAC submodule gate).
 */
class AppAccessService extends BaseService {
  async get(studentId: string): Promise<StudentAppAccess> {
    const res = await this.db
      .from("student_app_access" as never)
      .select("id, student_id, mobile_enabled, login_enabled, features, updated_by, updated_at")
      .eq("student_id", studentId)
      .maybeSingle();
    if (res.error) {
      if (tableMissing(res.error)) return DEFAULTS(studentId);
      throw AppError.fromSupabase(res.error, "student_app_access");
    }
    return res.data ? toDomain(res.data as unknown as AccessRow) : DEFAULTS(studentId);
  }

  async save(access: StudentAppAccess, updatedBy?: string): Promise<void> {
    const row = {
      student_id: access.studentId,
      mobile_enabled: access.mobileEnabled,
      login_enabled: access.loginEnabled,
      features: access.features ?? {},
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.db
      .from("student_app_access" as never)
      .upsert(row as never, { onConflict: "student_id" });
    if (error) throw AppError.fromSupabase(error, "student_app_access.save");
  }
}

export const appAccessService = new AppAccessService();
