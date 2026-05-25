// ──────────────────────────────────────────────────────────────────────────────
// Assignee directory — returns active staff profiles eligible to own a
// support ticket (admin / management / coordinator). Used by the assignment
// dropdown in ManagementTriagePage.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

export interface AssigneeOption {
  profileId: string;
  name: string;
  role: string;
  email?: string;
}

class AssigneesService extends BaseService {
  async list(): Promise<AssigneeOption[]> {
    const res = await this.db
      .from("profiles" as never)
      .select("id, name, role, email, is_active")
      .in("role", ["admin", "management", "coordinator"])
      .order("name", { ascending: true });
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "profiles.list");
    }
    const rows = (res.data as Array<{
      id: string;
      name: string | null;
      role: string;
      email: string | null;
      is_active?: boolean | null;
    }> | null) ?? [];
    return rows
      .filter((r) => r.is_active !== false)
      .map((r) => ({
        profileId: r.id,
        name: r.name ?? "—",
        role: r.role,
        email: r.email ?? undefined,
      }));
  }
}

export const assigneesService = new AssigneesService();
