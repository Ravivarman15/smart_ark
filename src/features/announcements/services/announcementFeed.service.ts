// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — User Feed & Read / Acknowledgement Service
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import { requireOrganization, currentOrganizationId } from "@/core/tenant/tenant";
import type { Announcement, AnnouncementFilter } from "../types/announcements.types";
import { deriveAnnouncementStatus } from "./announcements.service";

export interface FeedContext {
  userId?: string;
  role?: string;
  isParent?: boolean;
  activeChildStudentId?: string;
  activeChildStandardId?: string;
  activeChildBatchId?: string;
}

export class AnnouncementFeedService extends BaseService {
  private get db() {
    return supabase;
  }

  /**
   * Fetch announcements visible to the current authenticated principal.
   */
  async getFeed(ctx: FeedContext, filter: AnnouncementFilter = {}): Promise<Announcement[]> {
    const orgId = requireOrganization();

    let query = this.db
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
      .in("status", ["live", "scheduled"])
      .order("priority", { ascending: false })
      .order("publish_at", { ascending: false });

    if (filter.category && filter.category !== "all") {
      query = query.eq("category", filter.category);
    }
    if (filter.priority && filter.priority !== "all") {
      query = query.eq("priority", filter.priority);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Feed query error:", error);
      throw new AppError(error.message, "500");
    }

    // Filter by lifecycle: only 'live' announcements are shown to end users
    const liveItems = (data || []).filter((item: any) => {
      const effective = deriveAnnouncementStatus(
        item.status,
        item.publish_at,
        item.expires_at,
        Date.now()
      );
      return effective === "live";
    });

    // Filter by audience visibility for the caller
    const visibleItems = liveItems.filter((item: any) => {
      // If target scope is 'all', everyone in the organization sees it
      if (item.target_scope === "all") return true;

      const auds: any[] = item.audiences || [];
      if (auds.length === 0 || auds.some((a) => a.target_type === "all")) return true;

      if (ctx.isParent) {
        if (item.target_scope === "parents") return true;
        // Parent audience matching:
        return auds.some((a) => {
          if (a.target_type === "all" || a.target_type === "parent") return true;
          if (
            a.target_type === "role" &&
            (a.target_id === "parents" ||
              a.target_id === "parent" ||
              a.target_name?.toLowerCase().includes("parent"))
          )
            return true;

          // Match by active child or any child in the family
          const studentIds = [
            ctx.activeChildStudentId,
            ...(ctx.allChildStudentIds || []),
          ].filter(Boolean);
          if (a.target_type === "student" && a.target_id && studentIds.includes(a.target_id))
            return true;

          const standardIds = [
            ctx.activeChildStandardId,
            ...(ctx.allChildStandardIds || []),
          ].filter(Boolean);
          if (a.target_type === "standard" && a.target_id && standardIds.includes(a.target_id))
            return true;

          const batchIds = [
            ctx.activeChildBatchId,
            ...(ctx.allChildBatchIds || []),
          ].filter(Boolean);
          if (a.target_type === "batch" && a.target_id && batchIds.includes(a.target_id))
            return true;

          return false;
        });
      } else {
        // Staff audience matching:
        return auds.some((a) => {
          if (a.target_type === "staff") return true;
          if (
            a.target_type === "role" &&
            (a.target_id === ctx.role ||
              a.target_name?.toLowerCase() === ctx.role?.toLowerCase() ||
              (ctx.role === "admin" || ctx.role === "management"))
          )
            return true;
          return false;
        });
      }
    });

    // Annotate user's own read and acknowledgement state
    const callerUserId = ctx.userId;
    const callerStudentId = ctx.activeChildStudentId;

    const result: Announcement[] = visibleItems.map((item: any) => {
      const userRead = item.reads?.find((r: any) => {
        if (r.user_id !== callerUserId) return false;
        if (ctx.isParent && callerStudentId) {
          return r.student_id === callerStudentId;
        }
        return true;
      });

      return {
        ...item,
        is_read: !!userRead,
        is_acknowledged: !!userRead?.acknowledged,
      };
    });

    if (filter.onlyUnread) {
      return result.filter((item) => !item.is_read);
    }

    if (filter.search?.trim()) {
      const q = filter.search.trim().toLowerCase();
      return result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q) ||
          (a.summary && a.summary.toLowerCase().includes(q))
      );
    }

    return result;
  }

  /**
   * Get unread announcements count for navbar badge.
   */
  async getUnreadCount(ctx: FeedContext): Promise<number> {
    const feed = await this.getFeed(ctx);
    return feed.filter((item) => !item.is_read).length;
  }

  /**
   * Record that current user has read an announcement.
   */
  async markAsRead(announcementId: string, ctx: FeedContext): Promise<void> {
    const orgId = requireOrganization();
    const userRes = await this.db.auth.getUser();
    const userId = userRes.data?.user?.id || ctx.userId;
    if (!userId) return;

    const studentId = ctx.isParent ? ctx.activeChildStudentId || null : null;
    const userType = ctx.isParent ? "parent" : "staff";

    const { error } = await this.db.from("announcement_reads" as never).upsert(
      {
        organization_id: orgId,
        announcement_id: announcementId,
        user_id: userId,
        user_type: userType,
        student_id: studentId,
        read_at: new Date().toISOString(),
      } as never,
      { onConflict: "announcement_id, user_id, student_id" }
    );

    if (error) {
      console.warn("Failed to mark announcement as read:", error);
    }
  }

  /**
   * Acknowledge an announcement requiring confirmation.
   */
  async acknowledge(announcementId: string, ctx: FeedContext): Promise<void> {
    const orgId = requireOrganization();
    const userRes = await this.db.auth.getUser();
    const userId = userRes.data?.user?.id || ctx.userId;
    if (!userId) throw new AppError("Authentication required to acknowledge", "401");

    const studentId = ctx.isParent ? ctx.activeChildStudentId || null : null;
    const userType = ctx.isParent ? "parent" : "staff";
    const now = new Date().toISOString();

    const { error } = await this.db.from("announcement_reads" as never).upsert(
      {
        organization_id: orgId,
        announcement_id: announcementId,
        user_id: userId,
        user_type: userType,
        student_id: studentId,
        read_at: now,
        acknowledged: true,
        acknowledged_at: now,
      } as never,
      { onConflict: "announcement_id, user_id, student_id" }
    );

    if (error) {
      throw AppError.fromSupabase(error, "announcements.acknowledge");
    }
  }

  /**
   * Mark all active announcements in user feed as read.
   */
  async markAllAsRead(ctx: FeedContext): Promise<void> {
    const feed = await this.getFeed(ctx);
    const unread = feed.filter((a) => !a.is_read);

    await Promise.all(unread.map((a) => this.markAsRead(a.id, ctx)));
  }
}

export const announcementFeedService = new AnnouncementFeedService();
