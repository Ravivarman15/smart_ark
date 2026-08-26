// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Audience Targeting & Deduplication Service
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import { requireOrganization } from "@/core/tenant/tenant";
import type { AnnouncementAudience, AudienceTargetType } from "../types/announcements.types";

export interface ResolvedRecipient {
  recipient_id: string;
  recipient_type: "staff" | "parent" | "student";
  user_id?: string;
  name: string;
  detail?: string;
}

export class AnnouncementAudienceService extends BaseService {
  /**
   * Format human-readable audience summary string from audience rules.
   */
  static formatAudienceSummary(audiences?: AnnouncementAudience[], targetScope?: string): string {
    if (!audiences || audiences.length === 0 || targetScope === "all") {
      return "Entire Organization";
    }

    const types = new Map<string, string[]>();
    for (const a of audiences) {
      const list = types.get(a.target_type) ?? [];
      if (a.target_name) {
        list.push(a.target_name);
      }
      types.set(a.target_type, list);
    }

    const parts: string[] = [];

    if (types.has("all")) {
      return "Entire Organization";
    }
    if (types.has("role")) {
      parts.push(`Roles: ${types.get("role")!.join(", ")}`);
    }
    if (types.has("standard")) {
      parts.push(`Standards: ${types.get("standard")!.join(", ")}`);
    }
    if (types.has("batch")) {
      parts.push(`Classes: ${types.get("batch")!.join(", ")}`);
    }
    if (types.has("student")) {
      const students = types.get("student")!;
      parts.push(students.length > 2 ? `${students.length} Students` : students.join(", "));
    }
    if (types.has("parent")) {
      const parents = types.get("parent")!;
      parts.push(parents.length > 2 ? `${parents.length} Parents` : parents.join(", "));
    }
    if (types.has("staff")) {
      const staff = types.get("staff")!;
      parts.push(staff.length > 2 ? `${staff.length} Staff Members` : staff.join(", "));
    }

    return parts.join(" • ") || "Selected Audience";
  }

  /**
   * Deduplicate recipients across multiple audience rules.
   * A parent with 2 children in the same targeted class/standard only receives
   * one consolidated announcement.
   */
  static deduplicateRecipients<T extends { recipient_id: string }>(recipients: T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const r of recipients) {
      if (!seen.has(r.recipient_id)) {
        seen.add(r.recipient_id);
        result.push(r);
      }
    }
    return result;
  }

  /**
   * Resolve and estimate the number of targeted recipients for a set of audience rules.
   */
  async estimateTargetCount(
    targetScope: string,
    audiences: Array<{ target_type: AudienceTargetType; target_id?: string | null }>
  ): Promise<number> {
    const orgId = requireOrganization();

    if (targetScope === "all" || audiences.some((a) => a.target_type === "all")) {
      // Count all active students + all active staff
      const [studentsRes, staffRes] = await Promise.all([
        this.db.from("students" as never).select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        this.db.from("profiles" as never).select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_active", true),
      ]);
      return (studentsRes.count ?? 0) + (staffRes.count ?? 0);
    }

    const uniqueRecipients = new Set<string>();

    const standardIds = audiences.filter((a) => a.target_type === "standard" && a.target_id).map((a) => a.target_id!);
    const batchIds = audiences.filter((a) => a.target_type === "batch" && a.target_id).map((a) => a.target_id!);
    const studentIds = audiences.filter((a) => a.target_type === "student" && a.target_id).map((a) => a.target_id!);
    const staffIds = audiences.filter((a) => a.target_type === "staff" && a.target_id).map((a) => a.target_id!);
    const roles = audiences.filter((a) => a.target_type === "role" && a.target_id).map((a) => a.target_id!);

    // Students from specific student rules
    studentIds.forEach((id) => uniqueRecipients.add(`student:${id}`));

    // Staff from specific staff rules
    staffIds.forEach((id) => uniqueRecipients.add(`staff:${id}`));

    // Fetch students by standard
    if (standardIds.length > 0) {
      const { data: stdStudents } = await this.db
        .from("students" as never)
        .select("id")
        .eq("organization_id", orgId)
        .in("standard_id", standardIds);
      ((stdStudents as unknown as Array<{ id: string }>) ?? []).forEach((s) => uniqueRecipients.add(`student:${s.id}`));
    }

    // Fetch students by batch
    if (batchIds.length > 0) {
      const { data: batchStudents } = await this.db
        .from("students" as never)
        .select("id")
        .eq("organization_id", orgId)
        .in("batch_id", batchIds);
      ((batchStudents as unknown as Array<{ id: string }>) ?? []).forEach((s) => uniqueRecipients.add(`student:${s.id}`));
    }

    // Fetch staff by roles
    if (roles.length > 0) {
      const { data: roleStaff } = await this.db
        .from("profiles" as never)
        .select("id")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .in("role", roles);
      ((roleStaff as unknown as Array<{ id: string }>) ?? []).forEach((s) => uniqueRecipients.add(`staff:${s.id}`));
    }

    return uniqueRecipients.size;
  }
}

export const announcementAudienceService = new AnnouncementAudienceService();
