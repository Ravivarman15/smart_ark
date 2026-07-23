import { BaseService, AppError } from "@/shared/services";
import type {
  CoordinatorStaffLink,
  CoordinatorStandardLink,
  Section,
} from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Academic Allocation service — the Management-driven backbone.
//
//   • coordinator_staff      — which staff each coordinator manages (M2M)
//   • coordinator_standards  — which standards a coordinator owns (scope)
//   • sections               — dynamic sections per standard
//
// Every read is missing-table-safe: before the migration is applied the tables
// don't exist, so we return empty rather than throwing into the UI. Writes
// surface real errors (Management needs to know an assignment failed).
// ─────────────────────────────────────────────────────────────────────────────

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
};

const toStaffLink = (r: Record<string, unknown>): CoordinatorStaffLink => ({
  id: String(r.id),
  coordinatorId: String(r.coordinator_id ?? ""),
  staffId: String(r.staff_id ?? ""),
  assignedBy: (r.assigned_by as string) ?? undefined,
  assignedAt: (r.assigned_at as string) ?? undefined,
  isActive: r.is_active !== false,
});

const toStandardLink = (r: Record<string, unknown>): CoordinatorStandardLink => ({
  id: String(r.id),
  coordinatorId: String(r.coordinator_id ?? ""),
  standardId: String(r.standard_id ?? ""),
  assignedBy: (r.assigned_by as string) ?? undefined,
  assignedAt: (r.assigned_at as string) ?? undefined,
});

const toSection = (r: Record<string, unknown>): Section => ({
  id: String(r.id),
  standardId: (r.standard_id as string) ?? undefined,
  name: String(r.name ?? ""),
  sortOrder: Number(r.sort_order ?? 0),
  isActive: r.is_active !== false,
});

interface Actor {
  id?: string;
}

class AllocationService extends BaseService {
  // ── coordinator_staff ─────────────────────────────────────────────────────
  /** All staff↔coordinator links (Management view). Optionally scope by coordinator. */
  async listStaffLinks(coordinatorId?: string): Promise<CoordinatorStaffLink[]> {
    let q = this.db.from("coordinator_staff" as never).select("*").eq("is_active", true);
    if (coordinatorId) q = q.eq("coordinator_id", coordinatorId);
    const res = await q;
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "coordinator_staff");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toStaffLink);
  }

  /** The staff ids a coordinator manages (used to scope the scheduler). */
  async staffIdsForCoordinator(coordinatorId: string): Promise<string[]> {
    const links = await this.listStaffLinks(coordinatorId);
    return [...new Set(links.map((l) => l.staffId))];
  }

  /** Assign a staff member to a coordinator (idempotent — reactivates if present). */
  async assignStaff(coordinatorId: string, staffId: string, actor?: Actor): Promise<void> {
    const res = await this.db
      .from("coordinator_staff" as never)
      .upsert(
        {
          coordinator_id: coordinatorId,
          staff_id: staffId,
          assigned_by: actor?.id ?? null,
          is_active: true,
        } as never,
        { onConflict: "coordinator_id,staff_id" } as never,
      );
    if (res.error) throw AppError.fromSupabase(res.error, "coordinator_staff");
  }

  /** Remove a staff member from a coordinator. */
  async removeStaff(coordinatorId: string, staffId: string): Promise<void> {
    const res = await this.db
      .from("coordinator_staff" as never)
      .delete()
      .eq("coordinator_id", coordinatorId)
      .eq("staff_id", staffId);
    if (res.error) throw AppError.fromSupabase(res.error, "coordinator_staff");
  }

  /**
   * Transfer a staff member from one coordinator to another. Additive by design:
   * a staff member may be under multiple coordinators, so "transfer" removes the
   * source link and adds the target link in one call.
   */
  async transferStaff(
    fromCoordinatorId: string,
    toCoordinatorId: string,
    staffId: string,
    actor?: Actor,
  ): Promise<void> {
    await this.assignStaff(toCoordinatorId, staffId, actor);
    await this.removeStaff(fromCoordinatorId, staffId);
  }

  // ── coordinator_standards ───────────────────────────────────────────────────
  async listStandardLinks(coordinatorId?: string): Promise<CoordinatorStandardLink[]> {
    let q = this.db.from("coordinator_standards" as never).select("*");
    if (coordinatorId) q = q.eq("coordinator_id", coordinatorId);
    const res = await q;
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "coordinator_standards");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toStandardLink);
  }

  async standardIdsForCoordinator(coordinatorId: string): Promise<string[]> {
    const links = await this.listStandardLinks(coordinatorId);
    return [...new Set(links.map((l) => l.standardId))];
  }

  async assignStandard(coordinatorId: string, standardId: string, actor?: Actor): Promise<void> {
    const res = await this.db
      .from("coordinator_standards" as never)
      .upsert(
        {
          coordinator_id: coordinatorId,
          standard_id: standardId,
          assigned_by: actor?.id ?? null,
        } as never,
        { onConflict: "coordinator_id,standard_id" } as never,
      );
    if (res.error) throw AppError.fromSupabase(res.error, "coordinator_standards");
  }

  async removeStandard(coordinatorId: string, standardId: string): Promise<void> {
    const res = await this.db
      .from("coordinator_standards" as never)
      .delete()
      .eq("coordinator_id", coordinatorId)
      .eq("standard_id", standardId);
    if (res.error) throw AppError.fromSupabase(res.error, "coordinator_standards");
  }

  // ── sections ─────────────────────────────────────────────────────────────
  async listSections(standardId?: string): Promise<Section[]> {
    let q = this.db.from("sections" as never).select("*").eq("is_active", true);
    if (standardId) q = q.eq("standard_id", standardId);
    const res = await q.order("sort_order", { ascending: true });
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "sections");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toSection);
  }

  async createSection(standardId: string, name: string, sortOrder = 0): Promise<void> {
    const res = await this.db
      .from("sections" as never)
      .upsert(
        { standard_id: standardId, name, sort_order: sortOrder, is_active: true } as never,
        { onConflict: "standard_id,name" } as never,
      );
    if (res.error) throw AppError.fromSupabase(res.error, "sections");
  }

  async deleteSection(id: string): Promise<void> {
    const res = await this.db.from("sections" as never).delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "sections");
  }
}

export const allocationService = new AllocationService();
