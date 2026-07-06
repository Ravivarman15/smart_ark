import { BaseService, AppError } from "@/shared/services";
import type {
  GradeBand,
  GradingScheme,
  GradingSchemeInput,
} from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Grading Schemes — named grade-band sets staff manage and pick per exam.
//
// The chosen scheme's `bands` are COPIED into `exams.grading_scheme` at save
// time (see the exam form), so editing a scheme later never rewrites the grades
// of an exam that already used it. Reads degrade to an empty list if the table
// is unavailable (migration not yet applied), so the exam form always renders.
// ─────────────────────────────────────────────────────────────────────────────

interface SchemeRow {
  id: string;
  name: string;
  bands: GradeBand[] | null;
  is_default: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

const toDomain = (r: SchemeRow): GradingScheme => ({
  id: r.id,
  name: r.name,
  bands: Array.isArray(r.bands) ? r.bands : [],
  isDefault: !!r.is_default,
  createdAt: r.created_at ?? undefined,
  updatedAt: r.updated_at ?? undefined,
});

class GradeSchemeService extends BaseService {
  /** All schemes, defaults first then A→Z. Empty list if the table is missing. */
  async list(): Promise<GradingScheme[]> {
    const { data, error } = await this.db
      .from("grading_schemes" as never)
      .select("*")
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    if (error) return [];
    return ((data ?? []) as unknown as SchemeRow[]).map(toDomain);
  }

  async create(input: GradingSchemeInput, createdBy?: string): Promise<GradingScheme> {
    const res = await this.db
      .from("grading_schemes" as never)
      .insert({
        name: input.name,
        bands: input.bands,
        is_default: input.isDefault ?? false,
        created_by: createdBy ?? null,
      } as never)
      .select("*")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "grading scheme");
    return toDomain(res.data as unknown as SchemeRow);
  }

  async update(id: string, input: GradingSchemeInput): Promise<GradingScheme> {
    const res = await this.db
      .from("grading_schemes" as never)
      .update({
        name: input.name,
        bands: input.bands,
        is_default: input.isDefault ?? false,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", id)
      .select("*")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "grading scheme");
    return toDomain(res.data as unknown as SchemeRow);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db
      .from("grading_schemes" as never)
      .delete()
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "grading scheme");
  }
}

export const gradeSchemeService = new GradeSchemeService();
