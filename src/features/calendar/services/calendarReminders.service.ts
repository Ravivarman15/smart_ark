// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Reminder & Notification Engine
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { BaseService } from "@/shared/services";
import { requireOrganization, currentOrganizationId } from "@/core/tenant/tenant";
import type { CalendarEvent, EventReminder } from "../types/calendar.types";

export interface PendingReminderRow {
  id: string;
  organization_id: string;
  event_id: string;
  reminder_type: string;
  offset_minutes: number;
  trigger_at: string;
  channels: string[];
  status: string;
  event?: CalendarEvent;
}

export class CalendarRemindersService extends BaseService {
  /**
   * Sweep pending reminders that are ready to fire and dispatch them via message_queue / in-app.
   * Strictly idempotent: only triggers rows where status = 'pending' and trigger_at <= now().
   */
  async processDueReminders(nowIso = new Date().toISOString()): Promise<{
    processed: number;
    dispatched: number;
    skipped: number;
    cancelled: number;
  }> {
    const orgId = requireOrganization();

    // 1. Fetch due reminders with event data
    const { data: dueReminders, error } = await supabase
      .from("academic_calendar_reminders")
      .select(`
        *,
        event:academic_calendar_events(*)
      `)
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .lte("trigger_at", nowIso)
      .limit(50);

    if (error || !dueReminders) {
      return { processed: 0, dispatched: 0, skipped: 0, cancelled: 0 };
    }

    let dispatched = 0;
    let skipped = 0;
    let cancelled = 0;

    for (const rem of dueReminders as PendingReminderRow[]) {
      // If event was cancelled or deleted
      if (!rem.event || rem.event.status === "cancelled") {
        await supabase
          .from("academic_calendar_reminders")
          .update({ status: "cancelled" })
          .eq("id", rem.id);
        cancelled++;
        continue;
      }

      // If event start time has already passed
      const eventStartMs = new Date(rem.event.start_at).getTime();
      const nowMs = new Date(nowIso).getTime();
      if (eventStartMs <= nowMs) {
        // Event already started, skip stale reminder
        await supabase
          .from("academic_calendar_reminders")
          .update({ status: "cancelled" })
          .eq("id", rem.id);
        skipped++;
        continue;
      }

      // Enqueue to message_queue for communication dispatcher if channels include whatsapp or email
      if (rem.channels && rem.channels.length > 0) {
        try {
          // Fetch organization name for dynamic branding
          const { data: orgData } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", orgId)
            .maybeSingle();

          const orgName = orgData?.name || "Smart ARK";

          await supabase.from("message_queue").insert({
            organization_id: orgId,
            channel: rem.channels.includes("whatsapp") ? "whatsapp" : "email",
            context_type: "calendar_reminder",
            context_id: rem.event_id,
            template_key: "calendar_event_reminder",
            scheduled_at: nowIso,
            payload: {
              event_id: rem.event_id,
              event_title: rem.event.title,
              title: rem.event.title,
              start_at: rem.event.start_at,
              event_type: rem.event.event_type,
              location: rem.event.location || "",
              organization_name: orgName,
              reminder_label: `${Math.round(rem.offset_minutes / 60)} hours before`,
            },
            status: "queued",
            priority: 6,
          });
        } catch (queueErr) {
          console.warn("Notice: Enqueue message_queue:", queueErr);
        }
      }

      // Mark reminder as sent
      await supabase
        .from("academic_calendar_reminders")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_count: 1,
        })
        .eq("id", rem.id);

      dispatched++;
    }

    return {
      processed: dueReminders.length,
      dispatched,
      skipped,
      cancelled,
    };
  }

  /**
   * Cancel all pending reminders for an event.
   */
  async cancelEventReminders(eventId: string): Promise<void> {
    const orgId = requireOrganization();
    await supabase
      .from("academic_calendar_reminders")
      .update({ status: "cancelled" })
      .eq("organization_id", orgId)
      .eq("event_id", eventId)
      .eq("status", "pending");
  }
}

export const calendarRemindersService = new CalendarRemindersService();
