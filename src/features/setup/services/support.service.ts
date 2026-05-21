import { BaseService, AppError } from "@/shared/services";

// Small read-only helpers for the form pickers (campuses + teachers). Kept
// in setup so pages don't need to reach into other features for static lists.

export interface CampusOption { id: string; name: string }
export interface TeacherOption { id: string; name: string; role: string }

class SupportService extends BaseService {
  async listCampuses(): Promise<CampusOption[]> {
    const res = await this.db.from("campuses").select("id, name").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "campuses");
    return ((res.data ?? []) as { id: string; name: string }[]).map((r) => ({
      id: r.id,
      name: r.name,
    }));
  }

  async listTeachers(): Promise<TeacherOption[]> {
    const res = await this.db
      .from("profiles")
      .select("id, name, role")
      .in("role", ["teacher", "coordinator", "admin"])
      .order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "profiles");
    return ((res.data ?? []) as { id: string; name: string; role: string }[]).map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
    }));
  }
}

export const supportService = new SupportService();
