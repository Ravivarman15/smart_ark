import { BaseService, AppError } from "@/shared/services";
import type { Subject, SubjectInput } from "../types/setup.types";

type DbRow = {
  id: string;
  name: string;
  code: string | null;
  standard_id: string | null;
  is_optional: boolean | null;
  is_active: boolean | null;
  display_order: number | null;
  created_at: string | null;
};

const toDomain = (r: DbRow): Subject => ({
  id: r.id,
  name: r.name,
  code: r.code ?? undefined,
  standardId: r.standard_id ?? undefined,
  isOptional: !!r.is_optional,
  isActive: r.is_active ?? true,
  displayOrder: r.display_order ?? 0,
  createdAt: r.created_at ?? undefined,
});

// A subjects table on a partially-migrated DB may be missing the columns added
// by later migrations (e.g. `created_at`, `is_optional`, `is_active`,
// `display_order`). Detect that so the list can fall back to the core columns
// instead of failing the whole query.
const isColumnError = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("column") || m.includes("schema cache");
};

const RICH_SELECT =
  "id, name, code, standard_id, is_optional, is_active, display_order, created_at";
const CORE_SELECT = "id, name, code, standard_id";

class SubjectsService extends BaseService {
  async list(filters?: { standardId?: string }): Promise<Subject[]> {
    // `withOrder` orders by display_order (a column that may be absent on a
    // drifted schema) — dropped in the core fallback.
    const build = (select: string, withOrder: boolean) => {
      let q = this.db.from("subjects").select(select);
      if (withOrder) q = q.order("display_order", { ascending: true });
      q = q.order("name", { ascending: true });
      if (filters?.standardId) q = q.eq("standard_id", filters.standardId);
      return q;
    };

    let res = await build(RICH_SELECT, true);
    if (res.error && isColumnError(res.error)) {
      // Older/partial schema — retry with only the columns guaranteed to exist.
      res = await build(CORE_SELECT, false);
    }
    if (res.error) throw AppError.fromSupabase(res.error, "subjects");
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  async create(input: SubjectInput): Promise<void> {
    const payload = {
      name: input.name,
      code: input.code || null,
      standard_id: input.standardId || null,
      is_optional: input.isOptional ?? false,
      is_active: input.isActive ?? true,
      display_order: input.displayOrder ?? 0,
    };
    const { error } = await this.db.from("subjects").insert(payload as never);
    if (error) throw AppError.fromSupabase(error, "subjects.create");
  }

  async update(id: string, input: Partial<SubjectInput>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.code !== undefined) payload.code = input.code || null;
    if (input.standardId !== undefined) payload.standard_id = input.standardId || null;
    if (input.isOptional !== undefined) payload.is_optional = input.isOptional;
    if (input.isActive !== undefined) payload.is_active = input.isActive;
    if (input.displayOrder !== undefined) payload.display_order = input.displayOrder;
    const { error } = await this.db.from("subjects").update(payload as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "subjects.update");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("subjects").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "subjects.remove");
  }
}

export const subjectsService = new SubjectsService();
