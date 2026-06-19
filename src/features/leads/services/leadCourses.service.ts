// Lead course master — the single source for the apply-form course dropdown and
// the counselor↔course routing rules. Degrades to [] when the table is missing
// (pre-migration) so the public form + config still render.

import { BaseService, AppError } from "@/shared/services";
import { isSchemaMissing } from "./leadMappers";
import { normalizeCourseName } from "../utils/courses";

export interface LeadCourse {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

const toCourse = (r: Record<string, unknown>): LeadCourse => ({
  id: String(r.id),
  name: String(r.name ?? ""),
  isActive: r.is_active !== false,
  sortOrder: Number(r.sort_order ?? 0),
});

class LeadCoursesService extends BaseService {
  /** Active course names for the dropdowns (public-safe: anon RLS allows read). */
  async listActiveNames(): Promise<string[]> {
    const res = await this.db
      .from("lead_courses" as never)
      .select("name, sort_order, is_active")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (res.error) {
      if (isSchemaMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "lead_courses.listActiveNames");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map((r) => String(r.name));
  }

  /** Full list for the management table (active + the row ids). */
  async listAll(): Promise<LeadCourse[]> {
    const res = await this.db
      .from("lead_courses" as never)
      .select("id, name, is_active, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (res.error) {
      if (isSchemaMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "lead_courses.listAll");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toCourse);
  }

  /** Add a course (idempotent-ish — the DB unique index guards duplicates). */
  async create(name: string): Promise<void> {
    const clean = normalizeCourseName(name);
    if (!clean) throw AppError.validation("Course name is required");
    const res = await this.db
      .from("lead_courses" as never)
      .insert({ name: clean } as never);
    if (res.error) {
      if (isSchemaMissing(res.error)) {
        throw AppError.validation("Run migration 20260621_lead_courses.sql to manage courses");
      }
      // 23505 = duplicate — surface a friendly message.
      if ((res.error.message ?? "").includes("duplicate") || (res.error as { code?: string }).code === "23505") {
        throw AppError.validation(`"${clean}" already exists`);
      }
      throw AppError.fromSupabase(res.error, "lead_courses.create");
    }
  }

  /** Soft-delete a course (keeps historical leads' course strings intact). */
  async remove(id: string): Promise<void> {
    const res = await this.db
      .from("lead_courses" as never)
      .update({ deleted_at: new Date().toISOString(), is_active: false } as never)
      .eq("id", id);
    if (res.error && !isSchemaMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "lead_courses.remove");
    }
  }
}

export const leadCoursesService = new LeadCoursesService();
