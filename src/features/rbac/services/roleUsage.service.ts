import { BaseService, AppError } from "@/shared/services";
import type { RoleUsageStats } from "../types/role.types";

// Lightweight aggregator that powers the analytics cards on the Role Center
// list page. Runs three counts (profiles.role, rbac_role_permissions.role,
// rbac_role_actions.role) and stitches them into a single map keyed by slug.
//
// Pre-migration safe — counts fall back to 0 if a table is missing.

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("relation")
  );
};

class RoleUsageService extends BaseService {
  async byRole(): Promise<Record<string, RoleUsageStats>> {
    const empty: Record<string, RoleUsageStats> = {};

    // ── profile counts ────────────────────────────────────────────────────
    const profileRes = await this.db
      .from("profiles")
      .select("role")
      .neq("role", null as never);
    if (profileRes.error) {
      if (!isTableMissing(profileRes.error)) {
        throw AppError.fromSupabase(profileRes.error, "profiles.role.count");
      }
    } else {
      for (const row of profileRes.data ?? []) {
        const slug = (row as { role: string }).role;
        if (!slug) continue;
        ensure(empty, slug).userCount += 1;
      }
    }

    // ── module grant counts ───────────────────────────────────────────────
    const modRes = await this.db
      .from("rbac_role_permissions" as never)
      .select("role");
    if (modRes.error) {
      if (!isTableMissing(modRes.error)) {
        throw AppError.fromSupabase(modRes.error, "rbac_role_permissions.count");
      }
    } else {
      for (const row of (modRes.data ?? []) as { role: string }[]) {
        ensure(empty, row.role).moduleGrantCount += 1;
      }
    }

    // ── action grant counts ───────────────────────────────────────────────
    const actRes = await this.db
      .from("rbac_role_actions" as never)
      .select("role");
    if (actRes.error) {
      if (!isTableMissing(actRes.error)) {
        throw AppError.fromSupabase(actRes.error, "rbac_role_actions.count");
      }
    } else {
      for (const row of (actRes.data ?? []) as { role: string }[]) {
        ensure(empty, row.role).actionGrantCount += 1;
      }
    }

    return empty;
  }

  /**
   * Lightweight profile rows for "users assigned to this role" — emails are
   * read separately via the staff feature where the extension columns are
   * known to exist with the right fallbacks.
   */
  async listUsersByRole(slug: string): Promise<
    { id: string; name: string; role: string }[]
  > {
    const res = await this.db
      .from("profiles")
      .select("id, name, role")
      .eq("role", slug)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "profiles.listByRole");
    }
    return ((res.data ?? []) as unknown as {
      id: string;
      name: string;
      role: string;
    }[]).map((r) => ({ id: r.id, name: r.name, role: r.role }));
  }
}

const ensure = (map: Record<string, RoleUsageStats>, slug: string): RoleUsageStats => {
  if (!map[slug]) {
    map[slug] = {
      slug,
      userCount: 0,
      moduleGrantCount: 0,
      actionGrantCount: 0,
    };
  }
  return map[slug];
};

export const roleUsageService = new RoleUsageService();
