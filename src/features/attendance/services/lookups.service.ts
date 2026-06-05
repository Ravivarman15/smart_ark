import { BaseService, AppError } from "@/shared/services";
import type { BatchFilterOption, LookupOption, StaffOption } from "../types/attendance.types";

/**
 * Read-only lookups for the attendance filter bars. Batches carry their
 * standard / course-type / academic-year ids so the Mark / Register pages can
 * cascade-filter (Academic Year → Course Type → Standard → Batch) entirely
 * client-side without extra round-trips.
 */
class AttendanceLookupsService extends BaseService {
  async academicYears(): Promise<LookupOption[]> {
    const res = await this.db
      .from("academic_years")
      .select("id, name")
      .order("start_date", { ascending: false });
    if (res.error) throw AppError.fromSupabase(res.error, "academic_years");
    return (res.data ?? []) as LookupOption[];
  }

  async standards(): Promise<LookupOption[]> {
    const res = await this.db
      .from("standards")
      .select("id, name")
      .order("display_order", { ascending: true });
    if (res.error) throw AppError.fromSupabase(res.error, "standards");
    return (res.data ?? []) as LookupOption[];
  }

  async courseTypes(): Promise<LookupOption[]> {
    const res = await this.db.from("course_types").select("id, name").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "course_types");
    return (res.data ?? []) as LookupOption[];
  }

  async batches(): Promise<BatchFilterOption[]> {
    // standard_id is base-schema; course_type_id / academic_year_id were added
    // by 20260520_setup_extensions — select them but tolerate their absence on
    // a pre-extension database via the legacy fallback.
    const full = await this.db
      .from("batches")
      .select("id, name, standard_id, course_type_id, academic_year_id, is_active")
      .order("name");
    const rows =
      !full.error
        ? (full.data ?? [])
        : (await this.db.from("batches").select("id, name, standard_id").order("name")).data ?? [];
    return (rows as Record<string, unknown>[])
      .filter((r) => r.is_active === undefined || r.is_active === true)
      .map((r) => ({
        id: String(r.id),
        name: String(r.name),
        standardId: (r.standard_id as string) ?? undefined,
        courseTypeId: (r.course_type_id as string) ?? undefined,
        academicYearId: (r.academic_year_id as string) ?? undefined,
      }));
  }

  /** Active staff (any role) for the staff attendance pickers. */
  async staff(): Promise<StaffOption[]> {
    const res = await this.db
      .from("profiles")
      .select("id, name, role, is_active")
      .order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "profiles");
    return (res.data ?? [])
      .filter((r) => (r as { is_active?: boolean }).is_active !== false)
      .map((r) => {
        const row = r as { id: string; name: string; role: string };
        return { id: row.id, name: row.name, role: String(row.role ?? "") };
      });
  }
}

export const attendanceLookupsService = new AttendanceLookupsService();
