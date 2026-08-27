// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Core Service
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import { requireOrganization, currentOrganizationId } from "@/core/tenant/tenant";
import { orgPath, stripOrgPrefix } from "@/lib/orgStorage";
import type {
  Announcement,
  AnnouncementAnalytics,
  AnnouncementFilter,
  AnnouncementStatus,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "../types/announcements.types";

/**
 * Derive effective status from timestamps and raw status.
 * Visibility rules:
 * - DRAFT / ARCHIVED / CANCELLED are explicit and take precedence.
 * - Otherwise:
 *   - now < publish_at => 'scheduled'
 *   - expires_at <= now => 'expired'
 *   - publish_at <= now < expires_at => 'live'
 */
export function deriveAnnouncementStatus(
  status: AnnouncementStatus,
  publishAt?: string | null,
  expiresAt?: string | null,
  nowMs: number = Date.now()
): AnnouncementStatus {
  if (status === "draft" || status === "archived" || status === "cancelled") {
    return status;
  }

  const pTime = publishAt ? new Date(publishAt).getTime() : null;
  const eTime = expiresAt ? new Date(expiresAt).getTime() : null;

  if (pTime !== null && pTime > nowMs) {
    return "scheduled";
  }

  if (eTime !== null && eTime <= nowMs) {
    return "expired";
  }

  return "live";
}

export class AnnouncementsService extends BaseService {
  /**
   * Log an announcement lifecycle event into announcement_audit
   */
  async logAudit(
    announcementId: string | undefined,
    event: string,
    detail: Record<string, unknown> = {}
  ): Promise<void> {
    const orgId = currentOrganizationId();
    if (!orgId) return;

    try {
      const userRes = await this.db.auth.getUser();
      const actorId = userRes.data?.user?.id ?? null;

      await this.db.from("announcement_audit" as never).insert({
        organization_id: orgId,
        announcement_id: announcementId ?? null,
        event,
        actor_id: actorId,
        detail,
      } as never);
    } catch (e) {
      console.warn("Failed to write announcement audit log:", e);
    }
  }

  /**
   * List announcements for management dashboard (admin/mgmt/coord/teacher).
   */
  async list(filter: AnnouncementFilter = {}): Promise<Announcement[]> {
    const orgId = requireOrganization();

    let query = this.db
      .from("announcements" as never)
      .select(
        `
        *,
        audiences:announcement_audiences(*),
        attachments:announcement_attachments(*),
        reads:announcement_reads(id, user_id, read_at, acknowledged, acknowledged_at)
      `
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (filter.category && filter.category !== "all") {
      query = query.eq("category", filter.category);
    }
    if (filter.priority && filter.priority !== "all") {
      query = query.eq("priority", filter.priority);
    }
    if (filter.content_type && filter.content_type !== "all") {
      query = query.eq("content_type", filter.content_type);
    }

    const { data, error } = await query;
    if (error) {
      throw AppError.fromSupabase(error, "announcements.list");
    }

    const now = Date.now();
    let announcements: Announcement[] = ((data as unknown as Announcement[]) ?? []).map((item) => {
      const effectiveStatus = deriveAnnouncementStatus(
        item.status,
        item.publish_at,
        item.expires_at,
        now
      );
      const readCount = item.reads?.length ?? 0;
      const acknowledgedCount = item.reads?.filter((r) => r.acknowledged).length ?? 0;

      return {
        ...item,
        status: effectiveStatus,
        read_count: readCount,
        acknowledged_count: acknowledgedCount,
      };
    });

    if (filter.status && filter.status !== "all") {
      announcements = announcements.filter((a) => a.status === filter.status);
    }

    if (filter.search?.trim()) {
      const q = filter.search.trim().toLowerCase();
      announcements = announcements.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q) ||
          (a.summary && a.summary.toLowerCase().includes(q))
      );
    }

    return announcements;
  }

  /**
   * Get single announcement by ID with full details.
   */
  async getById(id: string): Promise<Announcement | null> {
    const orgId = requireOrganization();

    const { data, error } = await this.db
      .from("announcements" as never)
      .select(
        `
        *,
        audiences:announcement_audiences(*),
        attachments:announcement_attachments(*),
        reads:announcement_reads(*)
      `
      )
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw AppError.fromSupabase(error, "announcements.getById");
    }
    if (!data) return null;

    const item = data as unknown as Announcement;
    const effectiveStatus = deriveAnnouncementStatus(
      item.status,
      item.publish_at,
      item.expires_at
    );

    return {
      ...item,
      status: effectiveStatus,
      read_count: item.reads?.length ?? 0,
      acknowledged_count: item.reads?.filter((r) => r.acknowledged).length ?? 0,
    };
  }

  /**
   * Create a new announcement with audiences and attachments.
   */
  async create(input: CreateAnnouncementInput): Promise<Announcement> {
    const orgId = requireOrganization();
    const userRes = await this.db.auth.getUser();
    const userId = userRes.data?.user?.id;

    // Get current profile ID for creator reference
    let profileId: string | null = null;
    if (userId) {
      const { data: profile } = await this.db
        .from("profiles" as never)
        .select("id")
        .eq("user_id", userId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (profile) {
        profileId = (profile as { id: string }).id;
      }
    }

    let initialStatus: AnnouncementStatus = "draft";
    let publishAt = input.publish_at ?? null;

    if (!input.save_as_draft) {
      if (input.publish_now) {
        initialStatus = "live";
        publishAt = new Date().toISOString();
      } else if (publishAt && new Date(publishAt).getTime() > Date.now()) {
        initialStatus = "scheduled";
      } else {
        initialStatus = "live";
        publishAt = publishAt || new Date().toISOString();
      }
    }

    // Insert main announcement row
    const { data: announcement, error } = await this.db
      .from("announcements" as never)
      .insert({
        organization_id: orgId,
        title: input.title.trim(),
        summary: input.summary?.trim() || null,
        content: input.content.trim(),
        category: input.category,
        priority: input.priority || "normal",
        content_type: input.content_type || (input.timetable_data ? "timetable" : "text"),
        timetable_data: input.timetable_data || null,
        status: initialStatus,
        publish_at: publishAt,
        expires_at: input.expires_at || null,
        timezone: input.timezone || "Asia/Kolkata",
        target_scope: input.target_scope || "all",
        channels: input.channels && input.channels.length > 0 ? input.channels : ["in_app"],
        requires_acknowledgement: !!input.requires_acknowledgement,
        acknowledgement_prompt: input.acknowledgement_prompt?.trim() || null,
        created_by: profileId,
        updated_by: profileId,
      } as never)
      .select()
      .single();

    if (error || !announcement) {
      throw AppError.fromSupabase(error, "announcements.create");
    }

    const created = announcement as unknown as Announcement;

    // Insert audiences
    if (input.audiences && input.audiences.length > 0) {
      const audienceRows = input.audiences.map((a) => ({
        organization_id: orgId,
        announcement_id: created.id,
        target_type: a.target_type,
        target_id: a.target_id || null,
        target_name: a.target_name || null,
      }));

      const { error: audError } = await this.db
        .from("announcement_audiences" as never)
        .insert(audienceRows as never);

      if (audError) {
        console.error("Failed to insert audiences:", audError);
      }
    }

    // Insert attachments
    if (input.attachments && input.attachments.length > 0) {
      const attachmentRows = input.attachments.map((att) => ({
        organization_id: orgId,
        announcement_id: created.id,
        file_name: att.file_name,
        file_path: att.file_path,
        file_type: att.file_type,
        file_size: att.file_size || 0,
      }));

      const { error: attError } = await this.db
        .from("announcement_attachments" as never)
        .insert(attachmentRows as never);

      if (attError) {
        console.error("Failed to insert attachments:", attError);
      }
    }

    // Audit log
    await this.logAudit(
      created.id,
      initialStatus === "scheduled"
        ? "ANNOUNCEMENT_SCHEDULED"
        : initialStatus === "live"
        ? "ANNOUNCEMENT_PUBLISHED"
        : "ANNOUNCEMENT_CREATED",
      { title: created.title, status: initialStatus, content_type: created.content_type }
    );

    return (await this.getById(created.id)) || created;
  }

  /**
   * Update an existing announcement
   */
  async update(input: UpdateAnnouncementInput): Promise<Announcement> {
    const orgId = requireOrganization();

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.title !== undefined) updatePayload.title = input.title.trim();
    if (input.summary !== undefined) updatePayload.summary = input.summary?.trim() || null;
    if (input.content !== undefined) updatePayload.content = input.content.trim();
    if (input.category !== undefined) updatePayload.category = input.category;
    if (input.priority !== undefined) updatePayload.priority = input.priority;
    if (input.content_type !== undefined) updatePayload.content_type = input.content_type;
    if (input.timetable_data !== undefined) updatePayload.timetable_data = input.timetable_data;
    if (input.status !== undefined) updatePayload.status = input.status;
    if (input.publish_at !== undefined) updatePayload.publish_at = input.publish_at;
    if (input.expires_at !== undefined) updatePayload.expires_at = input.expires_at;
    if (input.timezone !== undefined) updatePayload.timezone = input.timezone;
    if (input.target_scope !== undefined) updatePayload.target_scope = input.target_scope;
    if (input.channels !== undefined) updatePayload.channels = input.channels;
    if (input.requires_acknowledgement !== undefined)
      updatePayload.requires_acknowledgement = input.requires_acknowledgement;
    if (input.acknowledgement_prompt !== undefined)
      updatePayload.acknowledgement_prompt = input.acknowledgement_prompt?.trim() || null;

    const { error } = await this.db
      .from("announcements" as never)
      .update(updatePayload as never)
      .eq("organization_id", orgId)
      .eq("id", input.id);

    if (error) {
      throw AppError.fromSupabase(error, "announcements.update");
    }

    // Replace audiences if supplied
    if (input.audiences !== undefined) {
      await this.db
        .from("announcement_audiences" as never)
        .delete()
        .eq("organization_id", orgId)
        .eq("announcement_id", input.id);

      if (input.audiences.length > 0) {
        const rows = input.audiences.map((a) => ({
          organization_id: orgId,
          announcement_id: input.id,
          target_type: a.target_type,
          target_id: a.target_id || null,
          target_name: a.target_name || null,
        }));
        await this.db.from("announcement_audiences" as never).insert(rows as never);
      }
    }

    // Replace attachments if supplied
    if (input.attachments !== undefined) {
      await this.db
        .from("announcement_attachments" as never)
        .delete()
        .eq("organization_id", orgId)
        .eq("announcement_id", input.id);

      if (input.attachments.length > 0) {
        const rows = input.attachments.map((att) => ({
          organization_id: orgId,
          announcement_id: input.id,
          file_name: att.file_name,
          file_path: att.file_path,
          file_type: att.file_type,
          file_size: att.file_size || 0,
        }));
        await this.db.from("announcement_attachments" as never).insert(rows as never);
      }
    }

    await this.logAudit(input.id, "ANNOUNCEMENT_UPDATED", { changes: Object.keys(updatePayload) });

    const updated = await this.getById(input.id);
    if (!updated) throw new Error("Failed to reload updated announcement");
    return updated;
  }

  /**
   * Extend announcement expiration timestamp
   */
  async extendExpiry(id: string, newExpiresAt: string): Promise<Announcement> {
    return this.update({ id, expires_at: newExpiresAt });
  }

  /**
   * Cancel a scheduled announcement
   */
  async cancel(id: string): Promise<Announcement> {
    const res = await this.update({ id, status: "cancelled" });
    await this.logAudit(id, "ANNOUNCEMENT_CANCELLED");
    return res;
  }

  /**
   * Archive an announcement
   */
  async archive(id: string): Promise<Announcement> {
    const res = await this.update({ id, status: "archived" });
    await this.logAudit(id, "ANNOUNCEMENT_ARCHIVED");
    return res;
  }

  /**
   * Delete an announcement
   */
  async delete(id: string): Promise<void> {
    const orgId = requireOrganization();

    await this.logAudit(id, "ANNOUNCEMENT_DELETED");

    const { error } = await this.db
      .from("announcements" as never)
      .delete()
      .eq("organization_id", orgId)
      .eq("id", id);

    if (error) {
      throw AppError.fromSupabase(error, "announcements.delete");
    }
  }

  /**
   * Upload an attachment file to tenant-isolated storage bucket
   */
  async uploadAttachment(file: File): Promise<{ file_name: string; file_path: string; file_type: string; file_size: number }> {
    const orgId = requireOrganization();
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const rawPath = `announcements/${timestamp}_${sanitizedName}`;
    const partitionedPath = orgPath(rawPath);

    const { data, error } = await this.db.storage
      .from("announcements")
      .upload(partitionedPath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw AppError.fromSupabase(error, "announcements.uploadAttachment");
    }

    return {
      file_name: file.name,
      file_path: data?.path || partitionedPath,
      file_type: file.type || "application/octet-stream",
      file_size: file.size,
    };
  }

  /**
   * Generate a signed URL for secure download of an attachment
   */
  async getAttachmentDownloadUrl(filePath: string): Promise<string> {
    const orgId = requireOrganization();
    // Verify file path starts with current org id
    if (!filePath.startsWith(orgId) && !filePath.includes(orgId)) {
      throw new AppError("Cross-tenant attachment access denied", "403");
    }

    const { data, error } = await this.db.storage
      .from("announcements")
      .createSignedUrl(filePath, 300); // 5 min expiry

    if (error || !data?.signedUrl) {
      throw AppError.fromSupabase(error, "announcements.getSignedUrl");
    }

    return data.signedUrl;
  }

  /**
   * Get analytics & aggregated read statistics for an announcement
   */
  async getAnalytics(id: string): Promise<AnnouncementAnalytics> {
    const announcement = await this.getById(id);
    if (!announcement) {
      throw new AppError("Announcement not found", "404");
    }

    const totalRead = announcement.read_count || 0;
    const totalAck = announcement.acknowledged_count || 0;
    const totalTargeted = announcement.target_count || totalRead || 1;
    const totalUnread = Math.max(0, totalTargeted - totalRead);
    const readRate = totalTargeted > 0 ? Math.round((totalRead / totalTargeted) * 100) : 0;
    const ackRate = totalRead > 0 ? Math.round((totalAck / totalRead) * 100) : 0;

    return {
      announcement_id: id,
      total_targeted: totalTargeted,
      total_read: totalRead,
      total_unread: totalUnread,
      total_acknowledged: totalAck,
      read_rate: readRate,
      acknowledgement_rate: ackRate,
    };
  }
}

export const announcementsService = new AnnouncementsService();
