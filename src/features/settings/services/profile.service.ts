import { BaseService, AppError } from "@/shared/services";
import type { ProfileUpdateInput, SettingsProfile } from "../types/settings.types";

// Profile service for the Settings → Profile page.
//
// Reads/writes against the existing `profiles` table — no new columns. The
// staff_profile_extensions migration already added the optional fields used
// here (mobile, address, designation, department, profile_picture_url).

type DbRow = {
  id: string;
  user_id: string;
  name: string;
  email?: string | null;
  role: string;
  mobile: string | null;
  address: string | null;
  designation: string | null;
  department: string | null;
  profile_picture_url: string | null;
  campus_id: string | null;
  updated_at: string | null;
  campuses?: { name?: string | null } | null;
};

const toDomain = (r: DbRow, fallbackEmail?: string): SettingsProfile => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  email: r.email ?? fallbackEmail ?? "",
  role: r.role,
  mobile: r.mobile ?? undefined,
  address: r.address ?? undefined,
  designation: r.designation ?? undefined,
  department: r.department ?? undefined,
  profilePictureUrl: r.profile_picture_url ?? undefined,
  campusId: r.campus_id ?? undefined,
  campusName: r.campuses?.name ?? undefined,
  updatedAt: r.updated_at ?? undefined,
});

class SettingsProfileService extends BaseService {
  /** Fetch the current user's profile by auth user id. */
  async getForUser(userId: string, email?: string): Promise<SettingsProfile> {
    const res = await this.db
      .from("profiles")
      .select(
        "id, user_id, name, email, role, mobile, address, designation, department, profile_picture_url, campus_id, updated_at, campuses(name)"
      )
      .eq("user_id", userId)
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "profiles.get");
    return toDomain(res.data as unknown as DbRow, email);
  }

  async update(profileId: string, input: ProfileUpdateInput): Promise<void> {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) payload.name = input.name;
    if (input.email !== undefined) payload.email = input.email;
    if (input.mobile !== undefined) payload.mobile = input.mobile || null;
    if (input.address !== undefined) payload.address = input.address || null;
    if (input.designation !== undefined) payload.designation = input.designation || null;
    if (input.department !== undefined) payload.department = input.department || null;
    if (input.profilePictureUrl !== undefined)
      payload.profile_picture_url = input.profilePictureUrl;

    const { error } = await this.db
      .from("profiles")
      .update(payload as never)
      .eq("id", profileId);
    if (error) throw AppError.fromSupabase(error, "profiles.update");
  }
}

export const settingsProfileService = new SettingsProfileService();
