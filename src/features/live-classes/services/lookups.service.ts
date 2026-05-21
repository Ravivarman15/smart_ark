import { BaseService, AppError } from "@/shared/services";
import type { LookupOption } from "../types/liveClass.types";

export interface BatchLookup extends LookupOption {
  standardId?: string;
}
export interface SubjectLookup extends LookupOption {
  standardId?: string;
}

/**
 * Read-only lookups for the Live Class form pickers — teachers, subjects,
 * standards, batches, campuses. Kept inside the feature so pages never
 * reach into other features for static lists.
 */
class LiveClassLookupsService extends BaseService {
  /** Active teaching staff (profiles.role = 'teacher'). */
  async teachers(): Promise<LookupOption[]> {
    const res = await this.db
      .from("profiles")
      .select("id, name, role, is_active")
      .order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "profiles");
    return ((res.data ?? []) as { id: string; name: string; role: string; is_active: boolean }[])
      .filter((r) => r.is_active && (r.role === "teacher" || r.role === "coordinator"))
      .map((r) => ({ id: r.id, name: r.name }));
  }

  async standards(): Promise<LookupOption[]> {
    const res = await this.db.from("standards").select("id, name").order("display_order");
    if (res.error) {
      // standards may not have display_order pre-migration — retry plain
      const retry = await this.db.from("standards").select("id, name").order("name");
      if (retry.error) throw AppError.fromSupabase(retry.error, "standards");
      return (retry.data ?? []) as LookupOption[];
    }
    return (res.data ?? []) as LookupOption[];
  }

  async subjects(): Promise<SubjectLookup[]> {
    const res = await this.db.from("subjects").select("id, name, standard_id").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "subjects");
    return ((res.data ?? []) as { id: string; name: string; standard_id: string | null }[]).map(
      (r) => ({ id: r.id, name: r.name, standardId: r.standard_id ?? undefined })
    );
  }

  async batches(): Promise<BatchLookup[]> {
    const res = await this.db.from("batches").select("id, name, standard_id").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "batches");
    return ((res.data ?? []) as { id: string; name: string; standard_id: string | null }[]).map(
      (r) => ({ id: r.id, name: r.name, standardId: r.standard_id ?? undefined })
    );
  }

  async campuses(): Promise<LookupOption[]> {
    const res = await this.db.from("campuses").select("id, name").order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "campuses");
    return (res.data ?? []) as LookupOption[];
  }
}

export const liveClassLookupsService = new LiveClassLookupsService();
