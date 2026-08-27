// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Calendar Service
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { BaseService } from "@/shared/services";
import { requireOrganization, currentOrganizationId } from "@/core/tenant/tenant";
import type {
  CalendarEvent,
  CalendarEventStatus,
  CreateCalendarEventInput,
  EventAudience,
  EventConflict,
  EventFilter,
  TargetCountPreview,
  UpdateCalendarEventInput,
} from "../types/calendar.types";
import { announcementsService } from "@/features/announcements/services/announcements.service";

export class CalendarService extends BaseService {
  private handleError(message: string, error: any): never {
    console.error(`[CalendarService] ${message}:`, error);
    const detail =
      error?.message ||
      error?.error_description ||
      (typeof error === "string" ? error : JSON.stringify(error));
    throw new Error(`${message}: ${detail}`);
  }

  /**
   * List calendar events scoped strictly to the current organization.
   */
  async list(filter: EventFilter = {}): Promise<CalendarEvent[]> {
    const orgId = requireOrganization();

    let query = supabase
      .from("academic_calendar_events")
      .select(`
        *,
        audiences:academic_calendar_audiences(*),
        creator:created_by(id, full_name, email)
      `)
      .eq("organization_id", orgId)
      .order("start_at", { ascending: true });

    // Date range window
    if (filter.start_date) {
      query = query.gte("end_at", filter.start_date);
    }
    if (filter.end_date) {
      query = query.lte("start_at", filter.end_date);
    }

    // Event types filter
    if (filter.event_types && filter.event_types.length > 0) {
      query = query.in("event_type", filter.event_types);
    }

    // Status filter
    if (filter.statuses && filter.statuses.length > 0) {
      query = query.in("status", filter.statuses);
    }

    const { data, error } = await query;
    if (error) {
      this.handleError("Failed to fetch calendar events", error);
    }

    let results = (data || []) as CalendarEvent[];

    // Client-side keyword search
    if (filter.search && filter.search.trim()) {
      const q = filter.search.toLowerCase().trim();
      results = results.filter(
        (ev) =>
          ev.title.toLowerCase().includes(q) ||
          (ev.description && ev.description.toLowerCase().includes(q)) ||
          (ev.location && ev.location.toLowerCase().includes(q))
      );
    }

    // Class / batch filter
    if (filter.standard_id || filter.batch_id) {
      results = results.filter((ev) => {
        if (ev.target_scope === "all") return true;
        return ev.audiences?.some(
          (a) =>
            (filter.standard_id && a.target_type === "standard" && a.target_id === filter.standard_id) ||
            (filter.batch_id && a.target_type === "batch" && a.target_id === filter.batch_id)
        );
      });
    }

    return results;
  }

  /**
   * Get single event by ID.
   */
  async getById(id: string): Promise<CalendarEvent | null> {
    const orgId = requireOrganization();

    const { data, error } = await supabase
      .from("academic_calendar_events")
      .select(`
        *,
        audiences:academic_calendar_audiences(*),
        creator:created_by(id, full_name, email)
      `)
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      this.handleError("Failed to get calendar event", error);
    }

    return data as CalendarEvent | null;
  }

  /**
   * Create a new calendar event with audiences, smart reminders, and optional announcement.
   */
  async create(input: CreateCalendarEventInput): Promise<CalendarEvent> {
    const orgId = requireOrganization();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    // Resolve profileId to satisfy public.profiles(id) FK constraint
    let profileId: string | null = null;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (profile?.id) {
        profileId = profile.id;
      }
    }

    let startIso: string;
    let endIso: string;
    try {
      startIso = new Date(input.start_at).toISOString();
    } catch {
      startIso = input.start_at;
    }
    try {
      endIso = new Date(input.end_at).toISOString();
    } catch {
      endIso = input.end_at;
    }

    // 1. Insert main event row
    const eventPayload = {
      organization_id: orgId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      event_type: input.event_type,
      start_at: startIso,
      end_at: endIso,
      all_day: Boolean(input.all_day),
      timezone: input.timezone || "Asia/Kolkata",
      status: input.status || "scheduled",
      location: input.location?.trim() || null,
      color: input.color || null,
      target_scope: input.target_scope || "all",
      is_recurring: Boolean(input.is_recurring),
      recurrence_rule: input.recurrence_rule || null,
      reminders: input.reminders || [],
      linked_entity_type: input.linked_entity_type || null,
      linked_entity_id: input.linked_entity_id || null,
      linked_metadata: input.linked_metadata || {},
      created_by: profileId,
      updated_by: profileId,
    };

    const { data: event, error: eventErr } = await supabase
      .from("academic_calendar_events")
      .insert(eventPayload)
      .select()
      .single();

    if (eventErr || !event) {
      this.handleError("Failed to create calendar event", eventErr);
    }

    const eventId = event.id;

    // 2. Insert targeting audience rows
    if (input.audiences && input.audiences.length > 0 && input.target_scope !== "all") {
      const audienceRows = input.audiences.map((aud) => ({
        organization_id: orgId,
        event_id: eventId,
        target_type: aud.target_type,
        target_id: aud.target_id || null,
        target_name: aud.target_name || null,
      }));

      const { error: audErr } = await supabase
        .from("academic_calendar_audiences")
        .insert(audienceRows);

      if (audErr) {
        console.warn("Failed to insert calendar audiences:", audErr);
      }
    }

    // 3. Schedule Reminders queue rows
    if (input.reminders && input.reminders.length > 0) {
      const startMs = new Date(input.start_at).getTime();
      const reminderRows = input.reminders.map((rem) => {
        const triggerTime = new Date(startMs - rem.offset_minutes * 60 * 1000).toISOString();
        return {
          organization_id: orgId,
          event_id: eventId,
          reminder_type: rem.reminder_type,
          offset_minutes: rem.offset_minutes,
          trigger_at: triggerTime,
          channels: rem.channels,
          status: "pending",
        };
      });

      const { error: remErr } = await supabase
        .from("academic_calendar_reminders")
        .insert(reminderRows);

      if (remErr) {
        console.warn("Failed to schedule calendar reminders:", remErr);
      }
    }

    // 4. Optionally publish announcement linked to this event
    if (input.publish_as_announcement) {
      try {
        const categoryMap: Record<string, any> = {
          holiday: "holiday",
          exam: "exam",
          school_event: "event",
          school_closure: "urgent",
          fee_due: "fee",
          custom: "general",
        };

        await announcementsService.create({
          title: input.title,
          content: input.description || `Academic Calendar Notification for ${input.title}.`,
          category: categoryMap[input.event_type] || "general",
          priority: input.event_type === "school_closure" ? "urgent" : "normal",
          target_scope: input.target_scope === "standards" ? "standards" : "all",
          publish_at: new Date().toISOString(),
          channels: ["in_app"],
        });
      } catch (annErr) {
        console.warn("Failed to auto-create linked announcement:", annErr);
      }
    }

    return (await this.getById(eventId)) || (event as CalendarEvent);
  }

  /**
   * Update an existing event.
   */
  async update(input: UpdateCalendarEventInput): Promise<CalendarEvent> {
    const orgId = requireOrganization();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    let profileId: string | null = null;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (profile?.id) {
        profileId = profile.id;
      }
    }

    const eventPayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
      updated_by: profileId,
    };

    if (input.title !== undefined) eventPayload.title = input.title.trim();
    if (input.description !== undefined) eventPayload.description = input.description?.trim() || null;
    if (input.event_type !== undefined) eventPayload.event_type = input.event_type;
    if (input.start_at !== undefined) {
      try {
        eventPayload.start_at = new Date(input.start_at).toISOString();
      } catch {
        eventPayload.start_at = input.start_at;
      }
    }
    if (input.end_at !== undefined) {
      try {
        eventPayload.end_at = new Date(input.end_at).toISOString();
      } catch {
        eventPayload.end_at = input.end_at;
      }
    }
    if (input.all_day !== undefined) eventPayload.all_day = Boolean(input.all_day);
    if (input.timezone !== undefined) eventPayload.timezone = input.timezone;
    if (input.status !== undefined) eventPayload.status = input.status;
    if (input.location !== undefined) eventPayload.location = input.location?.trim() || null;
    if (input.color !== undefined) eventPayload.color = input.color;
    if (input.target_scope !== undefined) eventPayload.target_scope = input.target_scope;
    if (input.is_recurring !== undefined) eventPayload.is_recurring = input.is_recurring;
    if (input.recurrence_rule !== undefined) eventPayload.recurrence_rule = input.recurrence_rule;
    if (input.reminders !== undefined) eventPayload.reminders = input.reminders;
    if (input.linked_entity_type !== undefined) eventPayload.linked_entity_type = input.linked_entity_type;
    if (input.linked_entity_id !== undefined) eventPayload.linked_entity_id = input.linked_entity_id;
    if (input.linked_metadata !== undefined) eventPayload.linked_metadata = input.linked_metadata;

    const { error: updateErr } = await supabase
      .from("academic_calendar_events")
      .update(eventPayload)
      .eq("organization_id", orgId)
      .eq("id", input.id);

    if (updateErr) {
      this.handleError("Failed to update calendar event", updateErr);
    }

    // Refresh audiences if provided
    if (input.audiences !== undefined) {
      await supabase
        .from("academic_calendar_audiences")
        .delete()
        .eq("organization_id", orgId)
        .eq("event_id", input.id);

      if (input.audiences.length > 0 && input.target_scope !== "all") {
        const rows = input.audiences.map((a) => ({
          organization_id: orgId,
          event_id: input.id,
          target_type: a.target_type,
          target_id: a.target_id || null,
          target_name: a.target_name || null,
        }));
        await supabase.from("academic_calendar_audiences").insert(rows);
      }
    }

    // Refresh reminders if date changed or reminders updated
    if (input.reminders !== undefined || input.start_at !== undefined) {
      await supabase
        .from("academic_calendar_reminders")
        .delete()
        .eq("organization_id", orgId)
        .eq("event_id", input.id)
        .eq("status", "pending");

      const existing = await this.getById(input.id);
      if (existing && existing.reminders && existing.reminders.length > 0) {
        const startMs = new Date(existing.start_at).getTime();
        const reminderRows = existing.reminders.map((rem) => ({
          organization_id: orgId,
          event_id: input.id,
          reminder_type: rem.reminder_type,
          offset_minutes: rem.offset_minutes,
          trigger_at: new Date(startMs - rem.offset_minutes * 60 * 1000).toISOString(),
          channels: rem.channels,
          status: "pending",
        }));
        await supabase.from("academic_calendar_reminders").insert(reminderRows);
      }
    }

    return (await this.getById(input.id)) as CalendarEvent;
  }

  /**
   * Cancel or Delete event.
   */
  async delete(id: string): Promise<void> {
    const orgId = requireOrganization();

    // Cancel pending reminders first
    await supabase
      .from("academic_calendar_reminders")
      .update({ status: "cancelled" })
      .eq("organization_id", orgId)
      .eq("event_id", id);

    const { error } = await supabase
      .from("academic_calendar_events")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", id);

    if (error) {
      this.handleError("Failed to delete calendar event", error);
    }
  }

  /**
   * Preview server-side audience counts.
   */
  async getTargetCountPreview(
    scope: string,
    audiences: Array<{ target_type: string; target_id?: string }> = []
  ): Promise<TargetCountPreview> {
    const orgId = currentOrganizationId();
    if (!orgId) {
      return { studentsCount: 0, parentsCount: 0, staffCount: 0, totalRecipients: 0 };
    }

    try {
      if (scope === "all") {
        const [{ count: stCount }, { count: sfCount }] = await Promise.all([
          supabase
            .from("students")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId),
        ]);

        const students = stCount || 0;
        const staff = sfCount || 0;
        const parents = Math.round(students * 0.95);
        return {
          studentsCount: students,
          parentsCount: parents,
          staffCount: staff,
          totalRecipients: students + parents + staff,
        };
      }

      // Targeted by standard / batch
      const standardIds = audiences
        .filter((a) => a.target_type === "standard" && a.target_id)
        .map((a) => a.target_id!);

      const batchIds = audiences
        .filter((a) => a.target_type === "batch" && a.target_id)
        .map((a) => a.target_id!);

      let studentsQuery = supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId);

      if (standardIds.length > 0) {
        studentsQuery = studentsQuery.in("standard_id", standardIds);
      } else if (batchIds.length > 0) {
        studentsQuery = studentsQuery.in("batch_id", batchIds);
      }

      const { count: stCount } = await studentsQuery;
      const students = stCount || 0;
      const parents = Math.round(students * 0.95);

      return {
        studentsCount: students,
        parentsCount: parents,
        staffCount: 4, // Default teaching staff assigned
        totalRecipients: students + parents + 4,
      };
    } catch {
      return { studentsCount: 0, parentsCount: 0, staffCount: 0, totalRecipients: 0 };
    }
  }

  /**
   * Conflict Detection Engine
   */
  async detectConflicts(
    event: Partial<CalendarEvent>,
    excludeEventId?: string
  ): Promise<EventConflict[]> {
    if (!event.start_at || !event.end_at) return [];
    const orgId = currentOrganizationId();
    if (!orgId) return [];

    const conflicts: EventConflict[] = [];

    // Query events in overlapping window
    let query = supabase
      .from("academic_calendar_events")
      .select("*, audiences:academic_calendar_audiences(*)")
      .eq("organization_id", orgId)
      .neq("status", "cancelled")
      .lte("start_at", event.end_at)
      .gte("end_at", event.start_at);

    if (excludeEventId) {
      query = query.neq("id", excludeEventId);
    }

    const { data: overlapping } = await query;
    if (!overlapping || overlapping.length === 0) return [];

    for (const other of overlapping) {
      if (other.event_type === "holiday") {
        conflicts.push({
          conflictingEvent: other as CalendarEvent,
          conflictType: "holiday_clash",
          message: `Date clashes with scheduled holiday: "${other.title}"`,
        });
      } else if (event.event_type === "exam" && other.event_type === "exam") {
        conflicts.push({
          conflictingEvent: other as CalendarEvent,
          conflictType: "same_class_exam",
          message: `Another exam is scheduled in the same time window: "${other.title}"`,
        });
      } else if (event.event_type === "ptm" && other.event_type === "school_event") {
        conflicts.push({
          conflictingEvent: other as CalendarEvent,
          conflictType: "overlap",
          message: `PTM overlaps with school event: "${other.title}"`,
        });
      }
    }

    return conflicts;
  }
}

export const calendarService = new CalendarService();
