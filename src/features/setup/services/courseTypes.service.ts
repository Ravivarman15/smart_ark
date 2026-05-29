import { BaseService, AppError } from "@/shared/services";
import type { CourseType, CourseTypeInput } from "../types/setup.types";

type DbRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string | null;
};

const toDomain = (r: DbRow): CourseType => ({
  id: r.id,
  name: r.name,
  description: r.description ?? undefined,
  createdAt: r.created_at ?? undefined,
});

class CourseTypesService extends BaseService {
  async list(): Promise<CourseType[]> {
    const res = await this.db
      .from("course_types")
      .select("id, name, description, created_at")
      .order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "course_types");
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  async create(input: CourseTypeInput): Promise<string> {
    const res = await this.db
      .from("course_types")
      .insert({ name: input.name, description: input.description || null } as never)
      .select("id")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "course_types.create");
    return (res.data as { id: string }).id;
  }

  async update(id: string, input: Partial<CourseTypeInput>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.description !== undefined) payload.description = input.description || null;
    const { error } = await this.db.from("course_types").update(payload as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "course_types.update");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("course_types").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "course_types.remove");
  }
}

export const courseTypesService = new CourseTypesService();
