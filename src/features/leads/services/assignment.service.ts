// Auto counselor-assignment engine.
//
// Resolution order (per spec):
//   1. candidates = active counselor_course_mapping rows matching the course
//      (course match wins over catch-all; higher `priority` wins).
//   2. choose the counselor with the FEWEST active (open) leads,
//   3. tie-break on FEWEST overdue follow-ups,
//   4. final tie-break round-robin (oldest last-assigned).
// If no candidate exists → returns null (caller marks the lead UNASSIGNED and
// alerts management). Degrades gracefully (returns null) before migration.

import { BaseService } from "@/shared/services";
import { isSchemaMissing, toMapping } from "./leadMappers";
import type { CounselorCourseMapping } from "../types/lead.types";

interface CandidateStat {
  counselorId: string;
  priority: number;
  courseSpecific: boolean;
  activeLeads: number;
  overdueLeads: number;
  lastAssignedAt: number; // epoch ms; 0 = never
}

class AssignmentService extends BaseService {
  /** Active staff (id/name/role) for counselor + faculty pickers. */
  async listStaff(): Promise<{ id: string; name: string; role: string }[]> {
    const res = await this.db.from("profiles").select("id, name, role, is_active").order("name");
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[]) ?? [])
      .filter((r) => (r as { is_active?: boolean }).is_active !== false)
      .map((r) => ({ id: String(r.id), name: String(r.name ?? ""), role: String(r.role ?? "") }));
  }

  async listMappings(): Promise<CounselorCourseMapping[]> {
    const res = await this.db
      .from("counselor_course_mapping")
      .select("*")
      .is("deleted_at", null)
      .eq("is_active", true);
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[]) ?? []).map(toMapping);
  }

  private courseMatches(m: CounselorCourseMapping, course?: string): boolean {
    if (!m.course) return true; // catch-all
    if (!course) return false;
    return m.course.toLowerCase() === course.toLowerCase();
  }

  /** Count open (non-closed, non-deleted) leads assigned to a counselor. */
  private async activeLeadCount(counselorId: string): Promise<number> {
    const res = await this.db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", counselorId)
      .is("deleted_at", null)
      .neq("status", "closed");
    return res.error ? 0 : res.count ?? 0;
  }

  private async overdueCount(counselorId: string): Promise<number> {
    const res = await this.db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", counselorId)
      .is("deleted_at", null)
      .eq("is_overdue", true);
    return res.error ? 0 : res.count ?? 0;
  }

  private async lastAssignedAt(counselorId: string): Promise<number> {
    const res = await this.db
      .from("leads")
      .select("assigned_at")
      .eq("assigned_to", counselorId)
      .not("assigned_at", "is", null)
      .order("assigned_at", { ascending: false })
      .limit(1);
    if (res.error || !res.data?.length) return 0;
    const v = (res.data[0] as Record<string, unknown>).assigned_at;
    return v ? new Date(String(v)).getTime() : 0;
  }

  /**
   * Resolve the best counselor for a lead's course. Returns a profile id or null.
   */
  async resolveCounselor(course?: string): Promise<string | null> {
    const mappings = await this.listMappings();
    if (mappings.length === 0) return null;

    const matched = mappings.filter((m) => this.courseMatches(m, course));
    if (matched.length === 0) return null;

    // Prefer course-specific mappings; within that, the highest priority tier.
    const courseSpecific = matched.filter((m) => m.course);
    const pool = courseSpecific.length > 0 ? courseSpecific : matched;
    const maxPriority = Math.max(...pool.map((m) => m.priority));
    const top = pool.filter((m) => m.priority === maxPriority);

    // De-dup counselor ids (a counselor may have several rows).
    const ids = Array.from(new Set(top.map((m) => m.counselorId)));
    if (ids.length === 1) return ids[0];

    const stats: CandidateStat[] = await Promise.all(
      ids.map(async (counselorId) => ({
        counselorId,
        priority: maxPriority,
        courseSpecific: courseSpecific.length > 0,
        activeLeads: await this.activeLeadCount(counselorId),
        overdueLeads: await this.overdueCount(counselorId),
        lastAssignedAt: await this.lastAssignedAt(counselorId),
      })),
    );

    stats.sort((a, b) => {
      if (a.activeLeads !== b.activeLeads) return a.activeLeads - b.activeLeads;
      if (a.overdueLeads !== b.overdueLeads) return a.overdueLeads - b.overdueLeads;
      return a.lastAssignedAt - b.lastAssignedAt; // oldest assigned first (round-robin)
    });

    return stats[0]?.counselorId ?? null;
  }

  // ── Mapping management (config page) ────────────────────────────────────────
  async upsertMapping(input: {
    id?: string;
    counselorId: string;
    course?: string;
    standard?: string;
    campus?: string;
    priority?: number;
    isActive?: boolean;
  }): Promise<void> {
    const row = {
      counselor_id: input.counselorId,
      course: input.course ?? null,
      standard: input.standard ?? null,
      campus: input.campus ?? null,
      priority: input.priority ?? 0,
      is_active: input.isActive ?? true,
    };
    const res = input.id
      ? await this.db.from("counselor_course_mapping").update(row as never).eq("id", input.id)
      : await this.db.from("counselor_course_mapping").insert(row as never);
    if (res.error && !isSchemaMissing(res.error)) {
      throw res.error;
    }
  }

  async removeMapping(id: string): Promise<void> {
    const res = await this.db
      .from("counselor_course_mapping")
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (res.error && !isSchemaMissing(res.error)) throw res.error;
  }
}

export const assignmentService = new AssignmentService();
