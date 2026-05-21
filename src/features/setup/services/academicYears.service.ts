import { BaseService, AppError } from "@/shared/services";
import type { AcademicYear, AcademicYearInput } from "../types/setup.types";

type DbRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_default?: boolean | null;
  created_at: string | null;
};

const toDomain = (r: DbRow): AcademicYear => ({
  id: r.id,
  name: r.name,
  startDate: r.start_date,
  endDate: r.end_date,
  isActive: !!r.is_active,
  isDefault: !!r.is_default,
  createdAt: r.created_at ?? undefined,
});

const stripUndefined = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

class AcademicYearsService extends BaseService {
  async list(): Promise<AcademicYear[]> {
    const res = await this.db
      .from("academic_years")
      .select("id, name, start_date, end_date, is_active, is_default, created_at")
      .order("start_date", { ascending: false });
    if (res.error) throw AppError.fromSupabase(res.error, "academic_years");
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  async create(input: AcademicYearInput): Promise<void> {
    const payload = stripUndefined({
      name: input.name,
      start_date: input.startDate,
      end_date: input.endDate,
      is_active: input.isActive ?? true,
      is_default: input.isDefault ?? false,
    });
    const { error } = await this.db.from("academic_years").insert(payload as never);
    if (error) throw AppError.fromSupabase(error, "academic_years.create");
  }

  async update(id: string, input: Partial<AcademicYearInput>): Promise<void> {
    const payload = stripUndefined({
      name: input.name,
      start_date: input.startDate,
      end_date: input.endDate,
      is_active: input.isActive,
      is_default: input.isDefault,
    });
    const { error } = await this.db.from("academic_years").update(payload as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "academic_years.update");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("academic_years").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "academic_years.remove");
  }

  /** Set one year as default; clear the previous default first (no FK trickery). */
  async setDefault(id: string): Promise<void> {
    // Clear existing defaults (idempotent — partial index allows zero or one).
    await this.db
      .from("academic_years")
      .update({ is_default: false } as never)
      .neq("id", id);
    const { error } = await this.db
      .from("academic_years")
      .update({ is_default: true, is_active: true } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "academic_years.setDefault");
  }
}

export const academicYearsService = new AcademicYearsService();
