// ──────────────────────────────────────────────────────────────────────────────
// Credentials service — the client gateway to the verify-credentials edge
// function plus the read-only Credential Health snapshot.
//
// VERIFY: never returns "ok to send" unless the edge function PROVED a login.
// HEALTH: derived from `profiles` (+ students/app-access) — no secrets ever
// reach the browser; the login proof stays server-side.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import {
  summarizeStaffCredentials,
  type StaffCredRow,
} from "../utils/credentialHealth";
import type {
  CredentialSubject,
  CredentialVerifyResult,
  CredentialHealthSnapshot,
} from "../types/communication.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

export interface VerifyInput {
  subject: CredentialSubject;
  profileId?: string;
  email?: string;
  studentId?: string;
  loginUrl?: string;
}

class CredentialsService extends BaseService {
  /**
   * Verify (and, for staff, provision + prove login on) a credential before it
   * is sent. The edge function returns verified:false (HTTP 200) with a reason
   * for handled cases (no account / login failed / student-no-backend); only a
   * true 4xx/5xx surfaces as an error.
   */
  async verify(input: VerifyInput): Promise<CredentialVerifyResult> {
    try {
      const { data, error } = await this.db.functions.invoke("verify-credentials", {
        body: input,
      });
      if (error) {
        return {
          verified: false,
          subject: input.subject,
          reason: "edge_error",
          message:
            (error as { message?: string }).message ??
            "Credential verification service is unavailable. Deploy the verify-credentials edge function.",
        };
      }
      return data as CredentialVerifyResult;
    } catch (e) {
      return {
        verified: false,
        subject: input.subject,
        reason: "edge_error",
        message: (e as Error).message,
      };
    }
  }

  /** Read-only credential health across staff (profiles) + students. */
  async health(): Promise<CredentialHealthSnapshot> {
    // ── Staff: profiles carry the auth linkage (user_id) + login email ─────
    let staffRows: StaffCredRow[] = [];
    const profRes = await this.db
      .from("profiles" as never)
      .select("id, name, email, user_id, is_active");
    if (profRes.error && !isMissingTable(profRes.error)) {
      throw AppError.fromSupabase(profRes.error, "profiles");
    }
    staffRows = ((profRes.data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      profileId: String(r.id),
      name: String(r.name ?? "—"),
      email: (r.email as string) ?? null,
      userId: (r.user_id as string) ?? null,
      isActive: r.is_active !== false,
    }));
    const staff = summarizeStaffCredentials(staffRows);

    // ── Students: count + app-access; there is no auth backend (see edge fn) ─
    let studentTotal = 0;
    let appAccessEnabled = 0;
    const studRes = await this.db
      .from("students" as never)
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (!studRes.error) studentTotal = studRes.count ?? 0;

    const accessRes = await this.db
      .from("student_app_access" as never)
      .select("id", { count: "exact", head: true })
      .eq("login_enabled", true);
    if (!accessRes.error) appAccessEnabled = accessRes.count ?? 0;

    return {
      staff: {
        total: staff.total,
        active: staff.active,
        linked: staff.linked,
        missingAuthLink: staff.missingAuthLink,
        missingEmail: staff.missingEmail,
        duplicateEmails: staff.duplicateEmails,
        issues: staff.issues,
      },
      student: {
        total: studentTotal,
        appAccessEnabled,
        noAuthBackend: true,
      },
    };
  }
}

export const credentialsService = new CredentialsService();
