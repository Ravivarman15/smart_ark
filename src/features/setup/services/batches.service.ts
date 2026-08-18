import { BaseService, AppError } from "@/shared/services";
import type { Batch, BatchInput, BatchSubject } from "../types/setup.types";

type DbRow = {
  id: string;
  name: string;
  campus_id: string | null;
  standard_id: string | null;
  course_type_id: string | null;
  coordinator_id: string | null;
  timing_start: string | null;
  timing_end: string | null;
  capacity: number | null;
  room: string | null;
  is_active: boolean | null;
  health: string | null;
  academic_year_id?: string | null;
  created_at: string | null;
  campuses?: { name?: string | null } | null;
  standards?: { name?: string | null } | null;
  course_types?: { name?: string | null } | null;
  profiles?: { name?: string | null } | null;
};

const toDomain = (r: DbRow): Batch => ({
  id: r.id,
  name: r.name,
  campusId: r.campus_id ?? undefined,
  campusName: r.campuses?.name ?? undefined,
  standardId: r.standard_id ?? undefined,
  standardName: r.standards?.name ?? undefined,
  courseTypeId: r.course_type_id ?? undefined,
  courseTypeName: r.course_types?.name ?? undefined,
  coordinatorId: r.coordinator_id ?? undefined,
  coordinatorName: r.profiles?.name ?? undefined,
  timingStart: r.timing_start ?? undefined,
  timingEnd: r.timing_end ?? undefined,
  capacity: r.capacity ?? undefined,
  room: r.room ?? undefined,
  isActive: r.is_active ?? true,
  health: r.health ?? undefined,
  academicYearId: r.academic_year_id ?? undefined,
  createdAt: r.created_at ?? undefined,
});

class BatchesService extends BaseService {
  async list(filters?: {
    standardId?: string;
    courseTypeId?: string;
    /** Campus (branch) id. Applied client-side beside the others. */
    campusId?: string;
    isActive?: boolean;
  }): Promise<Batch[]> {
    // Try the rich projection first; fall back to a legacy one if newer
    // columns are not present yet.
    const tryRich = await this.db
      .from("batches")
      .select(
        `id, name, campus_id, standard_id, course_type_id, coordinator_id,
         timing_start, timing_end, capacity, room, is_active, health, academic_year_id, created_at,
         campuses(name), standards(name), course_types(name), profiles!batches_coordinator_id_fkey(name)`
      )
      .order("name");
    let rows: DbRow[];
    if (tryRich.error) {
      const msg = (tryRich.error.message ?? "").toLowerCase();
      if (!msg.includes("column") && !msg.includes("schema cache") && !msg.includes("relation")) {
        throw AppError.fromSupabase(tryRich.error, "batches");
      }
      const fallback = await this.db
        .from("batches")
        .select(
          "id, name, campus_id, standard_id, coordinator_id, timing_start, timing_end, health, created_at, campuses(name), standards(name)"
        )
        .order("name");
      if (fallback.error) throw AppError.fromSupabase(fallback.error, "batches");
      rows = (fallback.data ?? []) as unknown as DbRow[];
    } else {
      rows = (tryRich.data ?? []) as unknown as DbRow[];
    }
    let mapped = rows.map(toDomain);
    if (filters?.standardId) mapped = mapped.filter((b) => b.standardId === filters.standardId);
    if (filters?.courseTypeId)
      mapped = mapped.filter((b) => b.courseTypeId === filters.courseTypeId);
    if (filters?.campusId) mapped = mapped.filter((b) => b.campusId === filters.campusId);
    if (typeof filters?.isActive === "boolean")
      mapped = mapped.filter((b) => b.isActive === filters.isActive);
    return mapped;
  }

  async create(input: BatchInput): Promise<string> {
    const payload = {
      name: input.name,
      campus_id: input.campusId || null,
      standard_id: input.standardId || null,
      course_type_id: input.courseTypeId || null,
      coordinator_id: input.coordinatorId || null,
      timing_start: input.timingStart || null,
      timing_end: input.timingEnd || null,
      capacity: input.capacity ?? null,
      room: input.room || null,
      is_active: input.isActive ?? true,
      health: input.health || "moderate",
      academic_year_id: input.academicYearId || null,
    };
    const res = await this.db.from("batches").insert(payload as never).select("id").single();
    if (res.error) throw AppError.fromSupabase(res.error, "batches.create");
    return (res.data as { id: string }).id;
  }

  async update(id: string, input: Partial<BatchInput>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.campusId !== undefined) payload.campus_id = input.campusId || null;
    if (input.standardId !== undefined) payload.standard_id = input.standardId || null;
    if (input.courseTypeId !== undefined) payload.course_type_id = input.courseTypeId || null;
    if (input.coordinatorId !== undefined) payload.coordinator_id = input.coordinatorId || null;
    if (input.timingStart !== undefined) payload.timing_start = input.timingStart || null;
    if (input.timingEnd !== undefined) payload.timing_end = input.timingEnd || null;
    if (input.capacity !== undefined) payload.capacity = input.capacity;
    if (input.room !== undefined) payload.room = input.room || null;
    if (input.isActive !== undefined) payload.is_active = input.isActive;
    if (input.health !== undefined) payload.health = input.health;
    if (input.academicYearId !== undefined)
      payload.academic_year_id = input.academicYearId || null;
    const { error } = await this.db.from("batches").update(payload as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "batches.update");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("batches").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "batches.remove");
  }

  // ── batch ↔ subject assignments ─────────────────────────────────────────
  async listSubjects(batchId: string): Promise<BatchSubject[]> {
    const res = await this.db
      .from("batch_subjects" as never)
      .select("id, batch_id, subject_id, teacher_profile_id")
      .eq("batch_id", batchId);
    if (res.error) {
      const msg = (res.error.message ?? "").toLowerCase();
      if (msg.includes("does not exist") || msg.includes("schema cache")) return [];
      throw AppError.fromSupabase(res.error, "batch_subjects");
    }
    return ((res.data ?? []) as {
      id: string;
      batch_id: string;
      subject_id: string;
      teacher_profile_id: string | null;
    }[]).map((r) => ({
      id: r.id,
      batchId: r.batch_id,
      subjectId: r.subject_id,
      teacherProfileId: r.teacher_profile_id ?? undefined,
    }));
  }

  async setSubjects(batchId: string, subjectIds: string[]): Promise<void> {
    const del = await this.db
      .from("batch_subjects" as never)
      .delete()
      .eq("batch_id", batchId);
    if (del.error) {
      const msg = (del.error.message ?? "").toLowerCase();
      if (!msg.includes("does not exist") && !msg.includes("schema cache")) {
        throw AppError.fromSupabase(del.error, "batch_subjects.delete");
      }
      return;
    }
    if (subjectIds.length === 0) return;
    const rows = subjectIds.map((subject_id) => ({ batch_id: batchId, subject_id }));
    const { error } = await this.db.from("batch_subjects" as never).insert(rows as never);
    if (error) throw AppError.fromSupabase(error, "batch_subjects.insert");
  }
}

export const batchesService = new BatchesService();
