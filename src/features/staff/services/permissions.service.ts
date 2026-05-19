import { BaseService, AppError } from "@/shared/services";
import type { ActionRight, ModuleRight, UserPermissions } from "../types/staff.types";

// ── Service ──────────────────────────────────────────────────────────────────
//
// WRITE-side authority for RBAC. Read-side stays in `StaffRightsContext` for
// the current user (cached + reactive across the app). Cross-user reads
// (e.g. PermissionMatrix editor in StaffRightsManager) belong here.
//
// Tables:
//   staff_rights        — (profile_id, module_name, can_view)
//   staff_action_rights — (profile_id, action_key,  is_allowed)
//
// Default-allow policy lives in StaffRightsContext: when no rows exist for
// a user, everything is allowed. This service does NOT replicate that
// policy — it returns the literal DB state.
class PermissionsService extends BaseService {
  /** Read all permission rows for a staff member. */
  async getForStaff(staffId: string): Promise<UserPermissions> {
    const [mods, actions] = await Promise.all([
      this.db
        .from("staff_rights")
        .select("module_name, can_view")
        .eq("profile_id", staffId),
      this.db
        .from("staff_action_rights")
        .select("action_key, is_allowed")
        .eq("profile_id", staffId),
    ]);
    if (mods.error) throw AppError.fromSupabase(mods.error, "staff_rights");
    if (actions.error) throw AppError.fromSupabase(actions.error, "staff_action_rights");

    const modules: Record<string, boolean> = {};
    for (const r of (mods.data ?? []) as { module_name: string; can_view: boolean }[]) {
      modules[r.module_name] = r.can_view;
    }
    const actionsMap: Record<string, boolean> = {};
    for (const r of (actions.data ?? []) as { action_key: string; is_allowed: boolean }[]) {
      actionsMap[r.action_key] = r.is_allowed;
    }
    return { staffId, modules, actions: actionsMap };
  }

  /**
   * Bulk save. Used by the permission matrix editor.
   *
   * Upserts every passed row in two batches (one per table). Rows that are
   * absent from the input are LEFT ALONE — call `resetForStaff()` if you
   * need to wipe before re-applying.
   *
   * Why upsert (not delete+insert): cheaper, atomic enough for this volume,
   * and preserves any DB-side audit columns (created_by) when added later.
   */
  async save(input: UserPermissions): Promise<void> {
    const moduleRows = Object.entries(input.modules).map(([module_name, can_view]) => ({
      profile_id: input.staffId,
      module_name,
      can_view,
    }));
    const actionRows = Object.entries(input.actions).map(([action_key, is_allowed]) => ({
      profile_id: input.staffId,
      action_key,
      is_allowed,
    }));

    const ops: Promise<unknown>[] = [];
    if (moduleRows.length > 0) {
      ops.push(
        this.db.from("staff_rights").upsert(moduleRows as never, {
          onConflict: "profile_id,module_name",
        })
      );
    }
    if (actionRows.length > 0) {
      ops.push(
        this.db.from("staff_action_rights").upsert(actionRows as never, {
          onConflict: "profile_id,action_key",
        })
      );
    }
    const results = await Promise.all(ops);
    for (const r of results as { error: unknown }[]) {
      if (r.error) throw AppError.fromSupabase(r.error as any, "permissions.save");
    }
  }

  /** Convenience: toggle one module right. Returns the new value. */
  async setModuleRight(right: ModuleRight): Promise<void> {
    const { error } = await this.db.from("staff_rights").upsert(
      {
        profile_id: right.staffId,
        module_name: right.moduleName,
        can_view: right.canView,
      } as never,
      { onConflict: "profile_id,module_name" }
    );
    if (error) throw AppError.fromSupabase(error, "staff_rights.upsert");
  }

  /** Convenience: toggle one action right. */
  async setActionRight(right: ActionRight): Promise<void> {
    const { error } = await this.db.from("staff_action_rights").upsert(
      {
        profile_id: right.staffId,
        action_key: right.actionKey,
        is_allowed: right.isAllowed,
      } as never,
      { onConflict: "profile_id,action_key" }
    );
    if (error) throw AppError.fromSupabase(error, "staff_action_rights.upsert");
  }

  /** Wipe all rights for a staff member (returns them to default-allow). */
  async resetForStaff(staffId: string): Promise<void> {
    const [mods, actions] = await Promise.all([
      this.db.from("staff_rights").delete().eq("profile_id", staffId),
      this.db.from("staff_action_rights").delete().eq("profile_id", staffId),
    ]);
    if (mods.error) throw AppError.fromSupabase(mods.error, "staff_rights.delete");
    if (actions.error) throw AppError.fromSupabase(actions.error, "staff_action_rights.delete");
  }
}

export const permissionsService = new PermissionsService();
