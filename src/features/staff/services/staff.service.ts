import { BaseService, AppError } from "@/shared/services";
import type {
  CreateStaffInput,
  EmailDeliveryStatus,
  Gender,
  OnboardingStatus,
  Staff,
  StaffStatus,
  UpdateStaffInput,
  Role,
} from "../types/staff.types";

// ── DB row shape (private) ───────────────────────────────────────────────────
// Columns added by `staff_profile_extensions` + `staff_onboarding` migrations
// are optional from the *runtime* perspective so this file keeps working
// against an older deployment that hasn't applied them yet. The trigger on the
// DB side keeps `name` in sync with first/middle/last automatically.
type ProfileRow = {
  id: string;
  user_id: string | null;
  name: string;
  role: string;
  subject: string | null;
  is_active: boolean | null;
  campus_id: string | null;
  campuses: { name: string } | { name: string }[] | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  gender?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  profile_picture_url?: string | null;
  department?: string | null;
  designation?: string | null;
  status?: string | null;
  joining_date?: string | null;
  onboarding_status?: string | null;
  invite_sent_at?: string | null;
  invite_email_status?: string | null;
  invite_email_error?: string | null;
  last_login_at?: string | null;
  onboarding_completed_at?: string | null;
};

// Column tiers — selects are retried down this ladder so the staff list keeps
// working no matter which schema migrations a deployment has applied.
//   Tier 1 (core)      — original `profiles` columns, present everywhere.
//   Tier 2 (extension) — profile detail columns (staff_profile_extensions).
//   Tier 3 (onboarding)— onboarding lifecycle columns (staff_onboarding).
const CORE_COLUMNS =
  "id, user_id, name, role, subject, is_active, campus_id, campuses(name)";

const EXTENSION_COLUMNS =
  "first_name, middle_name, last_name, gender, mobile, email, address, " +
  "profile_picture_url, department, designation, status, joining_date";

const ONBOARDING_COLUMNS =
  "onboarding_status, invite_sent_at, invite_email_status, " +
  "invite_email_error, last_login_at, onboarding_completed_at";

const EXTENDED_COLUMNS = `${CORE_COLUMNS}, ${EXTENSION_COLUMNS}`;
const FULL_COLUMNS = `${EXTENDED_COLUMNS}, ${ONBOARDING_COLUMNS}`;

// Tried in order — the first column set the live schema supports wins.
const COLUMN_TIERS = [FULL_COLUMNS, EXTENDED_COLUMNS, CORE_COLUMNS];

const isColumnError = (err: unknown): boolean => {
  const m = (err as { message?: string } | null)?.message;
  return !!m && /column|schema cache|does not exist/i.test(m);
};

const pickJoin = <T extends { name: string }>(v: T | T[] | null): string =>
  Array.isArray(v) ? v[0]?.name ?? "" : v?.name ?? "";

const normaliseStatus = (s?: string | null, active?: boolean | null): StaffStatus => {
  if (s === "active" || s === "invited" || s === "suspended" || s === "inactive") return s;
  return active === false ? "inactive" : "active";
};

const toDomain = (r: ProfileRow): Staff => ({
  id: r.id,
  userId: r.user_id ?? undefined,
  name: r.name,
  firstName: r.first_name ?? undefined,
  middleName: r.middle_name ?? undefined,
  lastName: r.last_name ?? undefined,
  gender: (r.gender as Gender | undefined) ?? undefined,
  mobile: r.mobile ?? undefined,
  email: r.email ?? undefined,
  address: r.address ?? undefined,
  profilePictureUrl: r.profile_picture_url ?? undefined,
  role: r.role as Role,
  department: r.department ?? undefined,
  designation: r.designation ?? undefined,
  status: normaliseStatus(r.status, r.is_active),
  joiningDate: r.joining_date ?? undefined,
  active: r.is_active ?? true,
  subject: r.subject ?? undefined,
  campusId: r.campus_id ?? undefined,
  campus: pickJoin(r.campuses) || undefined,
  onboardingStatus: (r.onboarding_status as OnboardingStatus | undefined) ?? undefined,
  inviteSentAt: r.invite_sent_at ?? undefined,
  inviteEmailStatus:
    (r.invite_email_status as EmailDeliveryStatus | undefined) ?? undefined,
  inviteEmailError: r.invite_email_error ?? undefined,
  lastLoginAt: r.last_login_at ?? undefined,
  onboardingCompletedAt: r.onboarding_completed_at ?? undefined,
});

/**
 * Inverse mapping — strip undefined keys so partial updates don't blank
 * existing columns. Returns DB column names.
 */
const toDb = (
  i: Partial<CreateStaffInput & UpdateStaffInput & { active?: boolean }>
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (i.name !== undefined) out.name = i.name;
  if (i.firstName !== undefined) out.first_name = i.firstName;
  if (i.middleName !== undefined) out.middle_name = i.middleName ?? null;
  if (i.lastName !== undefined) out.last_name = i.lastName;
  if (i.gender !== undefined) out.gender = i.gender ?? null;
  if (i.mobile !== undefined) out.mobile = i.mobile ?? null;
  if (i.email !== undefined) out.email = i.email ? i.email.toLowerCase() : null;
  if (i.address !== undefined) out.address = i.address ?? null;
  if (i.profilePictureUrl !== undefined) out.profile_picture_url = i.profilePictureUrl ?? null;
  if (i.role !== undefined) out.role = i.role;
  if (i.department !== undefined) out.department = i.department ?? null;
  if (i.designation !== undefined) out.designation = i.designation ?? null;
  if (i.joiningDate !== undefined) out.joining_date = i.joiningDate ?? null;
  if (i.status !== undefined) out.status = i.status;
  if (i.subject !== undefined) out.subject = i.subject ?? null;
  if (i.campusId !== undefined) out.campus_id = i.campusId || null;
  if (i.active !== undefined) out.is_active = i.active;
  return out;
};

interface ListParams {
  /** Filter by role (e.g. "teacher"). */
  role?: Role | Role[];
  /** Include deactivated staff. Defaults to false. */
  includeInactive?: boolean;
  /** Filter by campus id. */
  campusId?: string;
  /** Filter by department (case-insensitive contains). */
  department?: string;
  /** Filter by lifecycle status. */
  status?: StaffStatus | StaffStatus[];
  /** Free-text search across name/email/mobile. */
  search?: string;
}

// ── Service ──────────────────────────────────────────────────────────────────
class StaffService extends BaseService {
  /**
   * List staff (profiles). Filters role + active + campus on the DB side
   * so paginating later is straightforward. Retries down the column tiers
   * so it works whether or not the staff schema migrations are applied.
   */
  async list(params: ListParams = {}): Promise<Staff[]> {
    const build = (cols: string) => {
      let q = this.db.from("profiles").select(cols);
      if (!params.includeInactive) q = q.eq("is_active", true);
      if (params.role) {
        q = Array.isArray(params.role)
          ? q.in("role", params.role as string[])
          : q.eq("role", params.role);
      }
      if (params.campusId) q = q.eq("campus_id", params.campusId);
      if (params.status) {
        q = Array.isArray(params.status)
          ? q.in("status", params.status as string[])
          : q.eq("status", params.status);
      }
      if (params.department) q = q.ilike("department", `%${params.department}%`);
      if (params.search) {
        const s = `%${params.search}%`;
        q = q.or(`name.ilike.${s},email.ilike.${s},mobile.ilike.${s}`);
      }
      return q.order("name", { ascending: true });
    };

    let res = await build(COLUMN_TIERS[0]);
    for (
      let i = 1;
      i < COLUMN_TIERS.length && res.error && isColumnError(res.error);
      i++
    ) {
      res = await build(COLUMN_TIERS[i]);
    }

    const rows = this.guardList(res, "profiles");
    return (rows as unknown as ProfileRow[]).map(toDomain);
  }

  async getById(id: string): Promise<Staff> {
    const sel = (cols: string) =>
      this.db.from("profiles").select(cols).eq("id", id).single();

    let res = await sel(COLUMN_TIERS[0]);
    for (
      let i = 1;
      i < COLUMN_TIERS.length && res.error && isColumnError(res.error);
      i++
    ) {
      res = await sel(COLUMN_TIERS[i]);
    }
    const row = this.guard(res, "staff");
    return toDomain(row as unknown as ProfileRow);
  }

  /**
   * Resolve a campus name to its id. Surfaced as a public method because
   * the bridge in AppDataContext currently passes campus *names* (legacy
   * Teacher contract) — the lookup belongs here, not in the caller.
   */
  async resolveCampusId(name: string): Promise<string | null> {
    if (!name) return null;
    const { data } = await this.db.from("campuses").select("id").eq("name", name).maybeSingle();
    return data?.id ?? null;
  }

  /**
   * Check whether a profile with this email already exists. Used by the
   * Create Staff form for pre-submit guard so users see a friendly error
   * before the network round-trip to the edge function.
   */
  async emailExists(email: string): Promise<boolean> {
    if (!email) return false;
    const { data } = await this.db
      .from("profiles")
      .select("id")
      .ilike("email", email.trim().toLowerCase())
      .maybeSingle();
    return !!data;
  }

  /**
   * Create a profile row WITHOUT touching auth. Used by:
   *   - the legacy AppDataContext bridge (which already separates name/role
   *     creation from auth — keeps behaviour identical).
   *   - tests that need a profile without an auth user.
   *
   * For the new Create Staff flow, prefer `authProvisionService.invite()`
   * which creates auth + profile atomically via the edge function.
   */
  async create(input: CreateStaffInput): Promise<Staff> {
    const campusId =
      input.campusId ?? (input.campus ? await this.resolveCampusId(input.campus) : null);
    const payload = {
      ...toDb({ ...input, active: true }),
      campus_id: campusId,
    };
    const ins = (cols: string) =>
      this.db.from("profiles").insert(payload as never).select(cols).single();

    let res = await ins(COLUMN_TIERS[0]);
    for (
      let i = 1;
      i < COLUMN_TIERS.length && res.error && isColumnError(res.error);
      i++
    ) {
      res = await ins(COLUMN_TIERS[i]);
    }
    const row = this.guard(res, "staff");
    return toDomain(row as unknown as ProfileRow);
  }

  async update(id: string, updates: UpdateStaffInput): Promise<void> {
    const patch = toDb(updates);
    if (Object.keys(patch).length === 0) return;
    const { error } = await this.db.from("profiles").update(patch as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "staff.update");
  }

  /**
   * Lifecycle helpers — wrappers around `update()` that also keep the
   * legacy `is_active` boolean in sync with the `status` enum so older code
   * paths that read `is_active` keep working.
   */
  async deactivate(id: string): Promise<void> {
    await this.update(id, { status: "inactive", active: false });
  }

  async activate(id: string): Promise<void> {
    await this.update(id, { status: "active", active: true });
  }

  async suspend(id: string): Promise<void> {
    await this.update(id, { status: "suspended", active: false });
  }
}

export const staffService = new StaffService();
