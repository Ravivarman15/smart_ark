import { BaseService, AppError } from "@/shared/services";
import type { LookupOption } from "../types/student.types";

export interface BatchLookup extends LookupOption {
  standardId?: string;
}

/**
 * Read-only lookups for student form pickers — standards, batches, course
 * types, academic years, campuses, teachers. Kept inside the students feature
 * so pages never reach into the setup feature for static lists.
 */
class LookupsService extends BaseService {
  async standards(): Promise<LookupOption[]> {
    const res = await this.db
      .from("standards")
      .select("id, name")
      .order("display_order", { ascending: true });
    if (res.error) throw AppError.fromSupabase(res.error, "standards");
    return (res.data ?? []) as LookupOption[];
  }

  async batches(): Promise<BatchLookup[]> {
    const res = await this.db.from("batches").select("id, name, standard_id").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "batches");
    return ((res.data ?? []) as { id: string; name: string; standard_id: string | null }[]).map(
      (r) => ({ id: r.id, name: r.name, standardId: r.standard_id ?? undefined })
    );
  }

  async courseTypes(): Promise<LookupOption[]> {
    const res = await this.db.from("course_types").select("id, name").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "course_types");
    return (res.data ?? []) as LookupOption[];
  }

  async campuses(): Promise<LookupOption[]> {
    const res = await this.db.from("campuses").select("id, name").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "campuses");
    return (res.data ?? []) as LookupOption[];
  }

  async academicYears(): Promise<LookupOption[]> {
    const res = await this.db
      .from("academic_years")
      .select("id, name")
      .order("start_date", { ascending: false });
    if (res.error) throw AppError.fromSupabase(res.error, "academic_years");
    return (res.data ?? []) as LookupOption[];
  }
}

export const lookupsService = new LookupsService();
