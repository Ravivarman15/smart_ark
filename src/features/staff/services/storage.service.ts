import { BaseService, AppError } from "@/shared/services";
import { orgPath } from "@/lib/orgStorage";

// Storage service for staff profile pictures.
//
// Bucket: `profile-pictures` (created by the staff_profile_extensions
// migration; public read, authenticated write).
//
// File naming: `<profile_id_or_user_id>/<timestamp>.<ext>`. Using the id as
// a folder lets us add row-level storage policies later (allow self-upload,
// admins upload anywhere) without restructuring keys.

const BUCKET = "profile-pictures";

class StaffStorageService extends BaseService {
  /**
   * Upload an image and return a public URL. Caller is responsible for
   * sticking that URL onto the staff profile via `staffService.update()`.
   * Replaces any previous picture stored at the same folder.
   */
  async uploadProfilePicture(args: {
    /** Folder name — typically the staff profile id or the auth user id. */
    ownerId: string;
    file: File | Blob;
    /** Optional override for the storage key (e.g. for tests). */
    keyOverride?: string;
  }): Promise<string> {
    const ext = (() => {
      const name = "name" in args.file ? (args.file as File).name : "";
      const fromName = name.includes(".") ? name.split(".").pop() : "";
      if (fromName) return fromName.toLowerCase();
      const mime = (args.file as Blob).type || "";
      return mime.split("/")[1] || "png";
    })();
    const key = orgPath(args.keyOverride ?? `${args.ownerId}/${Date.now()}.${ext}`);

    const { error } = await this.db.storage.from(BUCKET).upload(key, args.file, {
      upsert: true,
      cacheControl: "3600",
      contentType: (args.file as Blob).type || undefined,
    });
    if (error) throw AppError.fromSupabase(error, "storage.upload");

    const { data } = this.db.storage.from(BUCKET).getPublicUrl(key);
    if (!data?.publicUrl) {
      throw AppError.validation("Storage returned no public URL — check bucket visibility");
    }
    return data.publicUrl;
  }

  /**
   * Delete a previously uploaded picture by its public URL. No-op if the URL
   * is from a different bucket (defensive — callers may pass arbitrary URLs).
   */
  async removeProfilePicture(publicUrl: string): Promise<void> {
    const marker = `/${BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const key = publicUrl.slice(idx + marker.length);
    const { error } = await this.db.storage.from(BUCKET).remove([key]);
    if (error) throw AppError.fromSupabase(error, "storage.remove");
  }
}

export const staffStorageService = new StaffStorageService();
