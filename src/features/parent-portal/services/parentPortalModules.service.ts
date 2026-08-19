// ──────────────────────────────────────────────────────────────────────────────
// PARENT PORTAL MODULE VISIBILITY — per-organization storage
//
// ┌── WHY THERE IS NO NEW TABLE, AND NO MIGRATION ─────────────────────────┐
// │ `organization_settings` is already a per-tenant key/value store with    │
// │ the exact policies this needs:                                          │
// │                                                                         │
// │   SELECT  organization_id = current_org_id()                            │
// │   ALL     organization_id = current_org_id()                            │
// │             AND has_any_role('admin','management')                      │
// │                                                                         │
// │ Every requirement falls out of those two lines. ARK's administrator can │
// │ only ever write ARK's row; a teacher cannot write at all; and a PARENT  │
// │ — an `authenticated` principal whose `current_org_id()` resolves to     │
// │ their own institution — can read their own organization's row and no    │
// │ other. Adding a table would have meant re-deriving all of that and      │
// │ getting one clause subtly wrong.                                        │
// └─────────────────────────────────────────────────────────────────────────┘
//
// SCOPING ON READ: no organization_id is passed. RLS already restricts the row
// to the caller's tenant, and a client-supplied id would be a second, weaker
// filter that could disagree with the first.
//
// SCOPING ON WRITE: organization_id IS passed, because it has to be — the
// column is NOT NULL with no default, so an omitted value is a failed insert
// rather than a silent cross-tenant one. `requireOrganization()` throws when no
// tenant is resolved, which is the correct outcome: a settings save with no
// known organization has nowhere legitimate to go.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import { requireOrganization } from "@/core/tenant/tenant";
import { sanitiseDisabledList, type ParentModuleId } from "../constants/parentModules";

/** The single `organization_settings.key` this feature owns. */
export const PARENT_PORTAL_SETTINGS_KEY = "parent_portal";

export interface ParentPortalModuleSettings {
  /** Pages this organization has hidden from its parents. */
  disabled: ParentModuleId[];
  updatedAt?: string;
}

const EMPTY: ParentPortalModuleSettings = { disabled: [] };

class ParentPortalModulesService extends BaseService {
  /**
   * Never throws.
   *
   * This is read on every parent's first paint and on every settings render, so
   * a transient failure must degrade to "everything is offered" rather than to
   * an error screen or — far worse — an empty menu. Failing closed here would
   * turn one bad request into a parent portal with two links in it, which is
   * indistinguishable from an administrator having hidden twelve pages.
   */
  async get(): Promise<ParentPortalModuleSettings> {
    const res = (await this.db
      .from("organization_settings" as never)
      .select("value, updated_at")
      .eq("key", PARENT_PORTAL_SETTINGS_KEY)
      .maybeSingle()) as { data: unknown; error: unknown };

    if (res.error) {
      console.warn("[parentPortalModules] could not read settings; offering every page", res.error);
      return EMPTY;
    }
    if (!res.data) return EMPTY;

    const row = res.data as { value?: unknown; updated_at?: string };
    const value = (row.value ?? {}) as Record<string, unknown>;
    return {
      disabled: sanitiseDisabledList(value.disabled),
      updatedAt: row.updated_at,
    };
  }

  /**
   * Replace this organization's hidden set.
   *
   * The whole list is written rather than a per-page toggle: the screen edits a
   * set and saves a set, so a partial write cannot leave the stored value
   * disagreeing with what the administrator just confirmed.
   *
   * `.select()` is not optional. An RLS-filtered write returns 204 with a null
   * error — a coordinator who somehow reached this call would otherwise be told
   * their change saved while nothing happened.
   */
  async save(disabled: readonly ParentModuleId[], updatedBy?: string): Promise<void> {
    const organizationId = requireOrganization();
    const clean = sanitiseDisabledList(disabled);

    const { data, error } = await this.db
      .from("organization_settings" as never)
      .upsert(
        {
          organization_id: organizationId,
          key: PARENT_PORTAL_SETTINGS_KEY,
          value: { disabled: clean },
          updated_by: updatedBy ?? null,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "organization_id,key" },
      )
      .select("key");

    if (error) throw error;
    if (!data || (data as unknown[]).length === 0) {
      throw new Error(
        "The parent portal settings were not saved. Only an admin or management account may change them.",
      );
    }
  }
}

export const parentPortalModulesService = new ParentPortalModulesService();
