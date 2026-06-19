// Recipient-targeted in-app notification center for the Lead CRM.
// Writes lead_notifications (per-user) and mirrors high-level events into the
// existing coarse `notifications` table (admin/mgmt feed). Degrades silently.

import { BaseService } from "@/shared/services";
import { isSchemaMissing, toNotification } from "./leadMappers";
import type { LeadNotification } from "../types/lead.types";

export interface NotifyInput {
  recipientId?: string;
  leadId?: string;
  type: string;
  title: string;
  message?: string;
  /** Also push to the global admin/mgmt notifications feed. */
  mirrorGlobal?: boolean;
}

class LeadNotificationsService extends BaseService {
  async notify(input: NotifyInput): Promise<void> {
    const res = await this.db.from("lead_notifications").insert({
      recipient_id: input.recipientId ?? null,
      lead_id: input.leadId ?? null,
      type: input.type,
      title: input.title,
      message: input.message ?? null,
    } as never);
    if (res.error && !isSchemaMissing(res.error) && import.meta.env.DEV) {
      console.warn("[leads] notify failed:", res.error.message);
    }

    if (input.mirrorGlobal) {
      // Best-effort mirror to the legacy global feed (no recipient targeting).
      await this.db
        .from("notifications")
        .insert({
          type: "alert",
          message: input.message ? `${input.title} — ${input.message}` : input.title,
          reference_id: input.leadId ?? null,
        } as never);
    }
  }

  /** Fan out the same notification to several recipients. */
  async notifyMany(recipientIds: string[], input: Omit<NotifyInput, "recipientId">): Promise<void> {
    const unique = Array.from(new Set(recipientIds.filter(Boolean)));
    if (unique.length === 0) {
      if (input.mirrorGlobal) await this.notify(input);
      return;
    }
    const rows = unique.map((rid) => ({
      recipient_id: rid,
      lead_id: input.leadId ?? null,
      type: input.type,
      title: input.title,
      message: input.message ?? null,
    }));
    const res = await this.db.from("lead_notifications").insert(rows as never);
    if (res.error && !isSchemaMissing(res.error) && import.meta.env.DEV) {
      console.warn("[leads] notifyMany failed:", res.error.message);
    }
    if (input.mirrorGlobal) {
      await this.db.from("notifications").insert({
        type: "alert",
        message: input.message ? `${input.title} — ${input.message}` : input.title,
        reference_id: input.leadId ?? null,
      } as never);
    }
  }

  async listForRecipient(recipientId: string, limit = 50): Promise<LeadNotification[]> {
    const res = await this.db
      .from("lead_notifications")
      .select("*")
      .eq("recipient_id", recipientId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[]) ?? []).map(toNotification);
  }

  async markRead(id: string): Promise<void> {
    const res = await this.db
      .from("lead_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (res.error && !isSchemaMissing(res.error)) {
      if (import.meta.env.DEV) console.warn("[leads] markRead failed:", res.error.message);
    }
  }

  async markAllRead(recipientId: string): Promise<void> {
    const res = await this.db
      .from("lead_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() } as never)
      .eq("recipient_id", recipientId)
      .eq("is_read", false);
    if (res.error && !isSchemaMissing(res.error)) {
      if (import.meta.env.DEV) console.warn("[leads] markAllRead failed:", res.error.message);
    }
  }
}

export const leadNotificationsService = new LeadNotificationsService();
