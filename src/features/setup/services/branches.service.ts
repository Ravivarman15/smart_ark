import { BaseService, AppError } from "@/shared/services";
import type { Branch, BranchInput } from "../types/setup.types";

// ──────────────────────────────────────────────────────────────────────────────
// BRANCHES
//
// ┌── WHY EVERY CALL HERE IS AN RPC ───────────────────────────────────────┐
// │ A branch is two rows that must agree:                                  │
// │                                                                        │
// │   campuses               what 20 tables carry a campus_id to, and what │
// │                          usage_status() counts against the plan's      │
// │                          "Branches: 5"                                 │
// │   organization_branches  the tenant descriptor — code, address,        │
// │                          geofence, primary flag, active flag           │
// │                                                                        │
// │ `campuses` has SELECT-only RLS on purpose (see the 20261009 migration).│
// │ Two client-side inserts could half-succeed and leave a campus with no  │
// │ descriptor: invisible in this page, still eating a paid plan slot.     │
// │ The RPCs own both rows in one statement.                               │
// └────────────────────────────────────────────────────────────────────────┘
//
// SCOPING: nothing below sends an organization id. The functions read it from
// current_org_id() precisely so a browser cannot nominate the tenant it writes
// into — the same rule the public lead form learned in Phase 7B.
// ──────────────────────────────────────────────────────────────────────────────

interface DbBranch {
  id: string;
  campus_id: string | null;
  name: string;
  code: string | null;
  address: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radius_meters: number | null;
  maps_url: string | null;
  is_primary: boolean;
  is_active: boolean;
  is_checkin_location: boolean;
  created_at: string | null;
  student_count: number | string | null;
  staff_count: number | string | null;
  batch_count: number | string | null;
}

// Postgres `count(*)` is bigint, and PostgREST serialises bigint as a STRING
// when it exceeds 2^53 — and some drivers do it always. `Number()` here rather
// than trusting the wire type keeps `3` from rendering as "3" in a total.
const count = (v: number | string | null): number => Number(v ?? 0) || 0;

const toDomain = (r: DbBranch): Branch => ({
  id: r.id,
  campusId: r.campus_id ?? undefined,
  name: r.name,
  code: r.code ?? undefined,
  address: r.address ?? undefined,
  geoLat: r.geo_lat ?? undefined,
  geoLng: r.geo_lng ?? undefined,
  geoRadiusMeters: r.geo_radius_meters ?? undefined,
  mapsUrl: r.maps_url ?? undefined,
  isPrimary: !!r.is_primary,
  isActive: !!r.is_active,
  isCheckinLocation: !!r.is_checkin_location,
  createdAt: r.created_at ?? undefined,
  studentCount: count(r.student_count),
  staffCount: count(r.staff_count),
  batchCount: count(r.batch_count),
});

/**
 * Branch totals are the ONE thing on this page that must never be guessed.
 * A branch is deletable only when nothing points at it, and the counts are how
 * the user finds out before pressing the button rather than after.
 */
export const branchIsDeletable = (b: Branch): boolean =>
  b.studentCount === 0 && b.staffCount === 0 && b.batchCount === 0;

class BranchesService extends BaseService {
  async list(): Promise<Branch[]> {
    const { data, error } = await this.db.rpc("branch_directory" as never);
    if (error) throw AppError.fromSupabase(error, "branch_directory");
    return ((data ?? []) as unknown as DbBranch[]).map(toDomain);
  }

  async create(input: BranchInput): Promise<void> {
    const { error } = await this.db.rpc("create_branch" as never, {
      _name: input.name,
      _code: input.code || null,
      _address: input.address || null,
      _geo_lat: input.geoLat ?? null,
      _geo_lng: input.geoLng ?? null,
      _is_primary: input.isPrimary ?? false,
    } as never);
    // The plan-limit trigger, the duplicate-name check and the role gate all
    // arrive here as ordinary Postgres errors carrying a sentence written for
    // the person reading it. Rewriting them would lose "3 of 3 branches".
    if (error) throw AppError.fromSupabase(error, "create_branch");
  }

  /**
   * Partial update. `undefined` means "leave alone" all the way down to SQL,
   * where the arguments default to NULL and COALESCE keeps the stored value —
   * so a form that only edits the name cannot blank out an address.
   */
  async update(id: string, input: Partial<BranchInput>): Promise<void> {
    const { error } = await this.db.rpc("update_branch" as never, {
      _id: id,
      _name: input.name ?? null,
      _code: input.code === undefined ? null : input.code || "",
      _address: input.address === undefined ? null : input.address || "",
      _geo_lat: input.geoLat ?? null,
      _geo_lng: input.geoLng ?? null,
      _is_primary: input.isPrimary ?? null,
      _is_active: input.isActive ?? null,
    } as never);
    if (error) throw AppError.fromSupabase(error, "update_branch");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.rpc("delete_branch" as never, { _id: id } as never);
    if (error) throw AppError.fromSupabase(error, "delete_branch");
  }
}

export const branchesService = new BranchesService();
