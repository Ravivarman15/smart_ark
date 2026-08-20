import { BaseService, AppError } from "@/shared/services";
import { requireOrganization } from "@/core/tenant/tenant";
import type { Role } from "@/core/constants/roles";

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL ROLES — the portals a staff member may switch into.
//
// A grant is permission to ENTER a role, never the act of being in it. The role
// someone is currently acting as lives in `profiles.active_role` and is written
// only by `switch_active_role()`; nothing here touches it.
//
// `profiles.role` — the primary role — is deliberately NOT represented as a
// grant. It is what the person IS: the staff directory, teacher dropdowns and
// payroll grouping all read it, and it stays fixed while they move between
// portals. Grants are what they MAY ALSO be.
// ─────────────────────────────────────────────────────────────────────────────

/** The table arrives with 20261013; before that, nobody has extra roles. */
const isMissing = (err: { message?: string; code?: string } | null | undefined): boolean => {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "42703" || err.code === "PGRST205") return true;
  const m = (err.message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
};

class StaffRolesService extends BaseService {
  private table() {
    return this.db.from("staff_role_grants" as never);
  }

  /**
   * The extra roles granted to one person.
   *
   * Degrades to "none" rather than throwing when the table is absent: an
   * un-migrated database has no multi-role staff, so an empty list is the
   * truthful answer, and the staff sheet must still open.
   */
  async grantsFor(profileId: string): Promise<Role[]> {
    if (!profileId) return [];
    const res = await this.table().select("role").eq("profile_id", profileId);
    if (res.error) {
      if (isMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "staff_role_grants");
    }
    return ((res.data ?? []) as unknown as { role: string }[]).map((r) => r.role as Role);
  }

  /** Extra roles for several people at once — one round trip for a table. */
  async grantsForMany(profileIds: string[]): Promise<Record<string, Role[]>> {
    const out: Record<string, Role[]> = {};
    if (profileIds.length === 0) return out;
    const res = await this.table().select("profile_id, role").in("profile_id", profileIds);
    if (res.error) {
      if (isMissing(res.error)) return out;
      throw AppError.fromSupabase(res.error, "staff_role_grants");
    }
    for (const r of (res.data ?? []) as unknown as { profile_id: string; role: string }[]) {
      (out[r.profile_id] ??= []).push(r.role as Role);
    }
    return out;
  }

  /**
   * Replace someone's granted roles with exactly `roles`.
   *
   * Written as a diff rather than delete-all-then-insert. The rows carry
   * `granted_by` and `granted_at`, and rewriting every row on an unrelated edit
   * would restamp the whole history — an audit trail saying an admin granted
   * "coordinator" today when they granted it in March.
   *
   * The organization is stamped explicitly via `requireOrganization()`: the
   * column is NOT NULL and its default died the day a second tenant appeared,
   * so an unstamped insert fails outright rather than landing cross-tenant.
   */
  async setGrants(input: {
    profileId: string;
    /** The person's PRIMARY role — never stored as a grant. */
    primaryRole: Role;
    roles: Role[];
    grantedBy?: string;
  }): Promise<void> {
    const wanted = new Set(input.roles.filter((r) => r !== input.primaryRole));
    const current = new Set(await this.grantsFor(input.profileId));

    const toAdd = [...wanted].filter((r) => !current.has(r));
    const toRemove = [...current].filter((r) => !wanted.has(r));

    if (toRemove.length > 0) {
      const res = await this.table()
        .delete()
        .eq("profile_id", input.profileId)
        .in("role", toRemove);
      if (res.error && !isMissing(res.error)) {
        throw AppError.fromSupabase(res.error, "staff_role_grants.revoke");
      }
    }

    if (toAdd.length > 0) {
      const organizationId = requireOrganization();
      const rows = toAdd.map((role) => ({
        profile_id: input.profileId,
        organization_id: organizationId,
        role,
        granted_by: input.grantedBy ?? null,
      }));
      const res = await this.table().insert(rows as never).select("id");
      if (res.error) {
        if (isMissing(res.error)) {
          throw AppError.validation(
            "Additional roles need migration 20261013 — apply it, then try again.",
          );
        }
        throw AppError.fromSupabase(res.error, "staff_role_grants.grant");
      }
      // An RLS-filtered INSERT returns no rows and no error, so without this a
      // coordinator granting a role would be told it worked.
      if (!res.data?.length) {
        throw AppError.validation(
          "Nothing was saved — only Admin and Management can grant additional roles.",
        );
      }
    }
  }
}

export const staffRolesService = new StaffRolesService();
