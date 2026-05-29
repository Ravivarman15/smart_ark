import { BaseService, AppError } from "@/shared/services";
import type { Standard, StandardInput } from "../types/setup.types";

type DbRow = {
  id: string;
  name: string;
  display_order: number | null;
  created_at: string | null;
};

const toDomain = (r: DbRow): Standard => ({
  id: r.id,
  name: r.name,
  displayOrder: r.display_order ?? 0,
  createdAt: r.created_at ?? undefined,
});

class StandardsService extends BaseService {
  async list(): Promise<Standard[]> {
    const res = await this.db
      .from("standards")
      .select("id, name, display_order, created_at")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (res.error) throw AppError.fromSupabase(res.error, "standards");
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  async create(input: StandardInput): Promise<string> {
    const payload = { name: input.name, display_order: input.displayOrder ?? 0 };
    const res = await this.db.from("standards").insert(payload as never).select("id").single();
    if (res.error) throw AppError.fromSupabase(res.error, "standards.create");
    return (res.data as { id: string }).id;
  }

  async update(id: string, input: Partial<StandardInput>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.displayOrder !== undefined) payload.display_order = input.displayOrder;
    const { error } = await this.db.from("standards").update(payload as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "standards.update");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("standards").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "standards.remove");
  }

  // ── standard ↔ course_type assignments ───────────────────────────────────
  async listAssignedCourseTypes(standardId: string): Promise<string[]> {
    const res = await this.db
      .from("standard_course_types" as never)
      .select("course_type_id")
      .eq("standard_id", standardId);
    if (res.error) {
      const msg = (res.error.message ?? "").toLowerCase();
      if (msg.includes("does not exist") || msg.includes("schema cache")) return [];
      throw AppError.fromSupabase(res.error, "standard_course_types");
    }
    return ((res.data ?? []) as { course_type_id: string }[]).map((r) => r.course_type_id);
  }

  /** Replace the assignment set for a standard in a single transaction-like flow. */
  async setAssignedCourseTypes(standardId: string, courseTypeIds: string[]): Promise<void> {
    const del = await this.db
      .from("standard_course_types" as never)
      .delete()
      .eq("standard_id", standardId);
    if (del.error) {
      const msg = (del.error.message ?? "").toLowerCase();
      if (!msg.includes("does not exist") && !msg.includes("schema cache")) {
        throw AppError.fromSupabase(del.error, "standard_course_types.delete");
      }
      return;
    }
    if (courseTypeIds.length === 0) return;
    const rows = courseTypeIds.map((courseTypeId) => ({
      standard_id: standardId,
      course_type_id: courseTypeId,
    }));
    const { error } = await this.db
      .from("standard_course_types" as never)
      .insert(rows as never);
    if (error) throw AppError.fromSupabase(error, "standard_course_types.insert");
  }
}

export const standardsService = new StandardsService();
