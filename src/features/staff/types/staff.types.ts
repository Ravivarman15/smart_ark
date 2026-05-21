// Domain types for the Staff / RBAC feature.
// App-facing — DB shapes (profiles, teacher_attendance, staff_rights,
// staff_action_rights) stay private to services/.
//
// Role union is re-exported from @/core so there's a single source of truth
// across the app — features depend on core for primitive concepts.

import type { Role } from "@/core/constants/roles";
export type { Role };

// ── Staff lifecycle status (separate from is_active) ─────────────────────────
// `active` is the legacy is_active boolean. `status` is the lifecycle
// state — they overlap (status=inactive ⇒ active=false) but split so the
// UI can show "Invited / awaiting first login" without setting is_active=false.
export type StaffStatus = "active" | "invited" | "suspended" | "inactive";

export type Gender = "male" | "female" | "other";

// ── Onboarding lifecycle ─────────────────────────────────────────────────────
// Tracks where a staff member is in the join → first-login journey. Distinct
// from `StaffStatus` (account state) — a staff member can be `active` and still
// have onboarding `invite_sent` if they have not logged in yet.
//   pending      — account created, welcome email not yet delivered
//   invite_sent  — welcome email sent, awaiting first login
//   completed    — staff has logged in at least once
export type OnboardingStatus = "pending" | "invite_sent" | "completed";

/** Delivery state of a transactional email (welcome / reset). */
export type EmailDeliveryStatus = "pending" | "sent" | "failed" | "skipped";

export type OnboardingEventType =
  | "account_created"
  | "invite_email_sent"
  | "invite_email_failed"
  | "invite_resent"
  | "password_reset"
  | "first_login"
  | "role_changed"
  | "modules_updated"
  | "permissions_updated"
  | "activated"
  | "deactivated"
  | "suspended"
  | "onboarding_completed";

/** One row of the staff onboarding audit log. */
export interface OnboardingEvent {
  id: string;
  profileId: string;
  eventType: OnboardingEventType | string;
  detail?: string;
  metadata?: Record<string, unknown>;
  actorProfileId?: string;
  actorName?: string;
  createdAt: string;
}

// ── Staff / profile ─────────────────────────────────────────────────────────
export interface Staff {
  id: string;               // profiles.id (uuid)
  userId?: string;          // auth.users.id (uuid) — present when joined to auth
  name: string;             // computed display name (first + middle + last)
  firstName?: string;
  middleName?: string;
  lastName?: string;
  gender?: Gender;
  mobile?: string;
  email?: string;
  address?: string;
  profilePictureUrl?: string;
  role: Role;
  department?: string;
  designation?: string;
  status: StaffStatus;
  joiningDate?: string;     // YYYY-MM-DD
  campus?: string;          // joined name
  campusId?: string;
  subject?: string;
  active: boolean;          // legacy is_active flag
  // ── Onboarding lifecycle (optional — present once the migration is applied)
  onboardingStatus?: OnboardingStatus;
  inviteSentAt?: string;
  inviteEmailStatus?: EmailDeliveryStatus;
  inviteEmailError?: string;
  lastLoginAt?: string;
  onboardingCompletedAt?: string;
}

/**
 * Profile-row create payload. Legacy callers (the AppDataContext bridge)
 * pass `name` + `role` only. The new Create Staff form supplies the full
 * detail set, validated against `createStaffSchema` first so the runtime
 * contract (first/last/email required) is enforced before this type is hit.
 */
export interface CreateStaffInput {
  /** Legacy display name. Required when first/last are omitted. */
  name?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  gender?: Gender;
  mobile?: string;
  email?: string;
  address?: string;
  profilePictureUrl?: string;
  role: Role;
  department?: string;
  designation?: string;
  joiningDate?: string;
  status?: StaffStatus;
  campus?: string;
  campusId?: string;
  subject?: string;
}

/** Stricter shape for the auth-provision flow. */
export interface InviteStaffInput extends CreateStaffInput {
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * Result of provisioning a staff account via the `invite-staff` edge function.
 * `tempPassword` is returned so the caller can deliver credentials manually
 * when the welcome email could not be sent.
 */
export interface InviteStaffResult {
  ok: true;
  userId: string;
  profileId: string;
  emailStatus: EmailDeliveryStatus;
  emailError?: string;
  tempPassword?: string;
  brevoConfigured?: boolean;
}

/** Result of an email-only operation (resend welcome / reset password). */
export interface EmailOpResult {
  ok: true;
  emailStatus: EmailDeliveryStatus;
  emailError?: string;
  /** Recovery link (reset_password) or new temp password (resend). */
  link?: string;
  tempPassword?: string;
}

export type UpdateStaffInput = Partial<
  Pick<
    Staff,
    | "firstName"
    | "middleName"
    | "lastName"
    | "gender"
    | "mobile"
    | "email"
    | "address"
    | "profilePictureUrl"
    | "department"
    | "designation"
    | "joiningDate"
    | "status"
    | "subject"
    | "campusId"
    | "active"
    | "role"
    | "name"
  >
>;

// ── Attendance / check-in ───────────────────────────────────────────────────
export type CheckInStatus = "on-time" | "late" | "absent" | "pending";
export type CheckOutStatus = "on-time" | "early" | "pending";

/**
 * App-facing attendance record for one staff/day. Mirrors the existing
 * `CheckinRecord` in AppDataContext to preserve consumer pages.
 */
export interface AttendanceRecord {
  staffId: string;
  date: string;             // yyyy-mm-dd
  /** Display time HH:MM, computed from check_in_time on the fly. */
  time: string;
  geoValid: boolean;
  status: CheckInStatus;
  checkinTimestamp?: string;
  checkoutTime?: string;
  checkoutGeoValid?: boolean;
  checkoutStatus?: CheckOutStatus;
  checkoutTimestamp?: string;
  comments?: string;
}

export interface ApprovalArgs {
  staffId: string;
  date: string;             // yyyy-mm-dd
  comments?: string;
  /** ISO timestamp to override the recorded check-in/out time. */
  overrideTime?: string;
}

export interface CheckInResult {
  status: "on-time" | "late";
  time: string;             // HH:MM (display)
}

export interface CheckOutResult {
  status: "on-time" | "early";
  time: string;
}

// ── RBAC ────────────────────────────────────────────────────────────────────
/**
 * A single module-visibility right for a staff member.
 * Mirrors the `staff_rights` table row shape.
 */
export interface ModuleRight {
  staffId: string;
  moduleName: string;
  canView: boolean;
}

/**
 * A single per-action right.
 * Mirrors the `staff_action_rights` table row shape.
 */
export interface ActionRight {
  staffId: string;
  actionKey: string;
  isAllowed: boolean;
}

/** The full permission map for one user (used by editors + matrix views). */
export interface UserPermissions {
  staffId: string;
  modules: Record<string, boolean>;
  actions: Record<string, boolean>;
}
