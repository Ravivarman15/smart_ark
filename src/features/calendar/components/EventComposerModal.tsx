// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Event Composer Modal
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from "react";
import {
  X,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  Bell,
  Sparkles,
  Award,
  AlertTriangle,
  Megaphone,
  Check,
  Plus,
  Trash2,
  Globe,
} from "lucide-react";
import { format, addDays } from "date-fns";
import type {
  CalendarEvent,
  CalendarEventType,
  CreateCalendarEventInput,
  EventAudienceTargetType,
  EventReminder,
  TargetScope,
} from "../types/calendar.types";
import { EVENT_TYPES_METADATA, DEFAULT_REMINDER_OPTIONS } from "../constants/eventTypes";
import { DateTime12hPicker } from "@/features/announcements/components/DateTime12hPicker";
import { useStandards } from "@/features/setup/hooks/useStandards";
import { useBatches } from "@/features/setup/hooks/useBatches";
import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useTargetCountPreview,
  useIntegratedExams,
  useIntegratedAnnouncements,
} from "../hooks/useCalendarEvents";
import { calendarService } from "../services/calendar.service";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: Date;
  existingEvent?: CalendarEvent | null;
}

export const EventComposerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  initialDate = new Date(),
  existingEvent = null,
}) => {
  const createMutation = useCreateCalendarEvent();
  const updateMutation = useUpdateCalendarEvent();
  const { data: standards = [] } = useStandards();
  const { data: batches = [] } = useBatches();
  const { data: availableExams = [] } = useIntegratedExams();

  const isEditing = Boolean(existingEvent);

  // Form State
  const [title, setTitle] = useState(existingEvent?.title || "");
  const [description, setDescription] = useState(existingEvent?.description || "");
  const [eventType, setEventType] = useState<CalendarEventType>(
    existingEvent?.event_type || "school_event"
  );
  const [allDay, setAllDay] = useState(existingEvent?.all_day ?? false);

  const initialStart = existingEvent
    ? existingEvent.start_at
    : `${format(initialDate, "yyyy-MM-dd")}T09:00:00`;
  const initialEnd = existingEvent
    ? existingEvent.end_at
    : `${format(initialDate, "yyyy-MM-dd")}T11:00:00`;

  const [startAt, setStartAt] = useState(initialStart);
  const [endAt, setEndAt] = useState(initialEnd);
  const [location, setLocation] = useState(existingEvent?.location || "");
  const [timezone, setTimezone] = useState(existingEvent?.timezone || "Asia/Kolkata");

  // Audience Targeting
  const [targetScope, setTargetScope] = useState<TargetScope>(
    existingEvent?.target_scope || "all"
  );
  const [audiences, setAudiences] = useState<
    Array<{ target_type: EventAudienceTargetType; target_id?: string; target_name?: string }>
  >(
    existingEvent?.audiences?.map((a) => ({
      target_type: a.target_type,
      target_id: a.target_id,
      target_name: a.target_name,
    })) || []
  );

  // Reminders
  const [reminders, setReminders] = useState<EventReminder[]>(
    existingEvent?.reminders || [
      {
        id: "rem_1",
        reminder_type: "1_day",
        offset_minutes: 24 * 60,
        label: "1 day before",
        channels: ["in_app", "whatsapp"],
      },
    ]
  );

  // Cross-Module Links
  const [linkedExamId, setLinkedExamId] = useState<string>(
    existingEvent?.linked_entity_type === "exam" ? existingEvent.linked_entity_id || "" : ""
  );
  const [publishAsAnnouncement, setPublishAsAnnouncement] = useState(false);

  // Real-time server-side target counts preview
  const { data: targetPreview } = useTargetCountPreview(targetScope, audiences);

  // Conflict Warning State
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);

  if (!isOpen) return null;

  const handleEventTypeChange = (type: CalendarEventType) => {
    setEventType(type);
    if (EVENT_TYPES_METADATA[type]?.defaultAllDay) {
      setAllDay(true);
    }
  };

  const addAudienceRule = (
    target_type: EventAudienceTargetType,
    target_id?: string,
    target_name?: string
  ) => {
    if (audiences.some((a) => a.target_type === target_type && a.target_id === target_id)) {
      return;
    }
    setAudiences([...audiences, { target_type, target_id, target_name }]);
  };

  const removeAudienceRule = (idx: number) => {
    setAudiences(audiences.filter((_, i) => i !== idx));
  };

  const addReminder = (remOpt: (typeof DEFAULT_REMINDER_OPTIONS)[0]) => {
    if (reminders.some((r) => r.offset_minutes === remOpt.offset_minutes)) return;
    setReminders([
      ...reminders,
      {
        id: `rem_${Date.now()}`,
        reminder_type: remOpt.value as any,
        offset_minutes: remOpt.offset_minutes,
        label: remOpt.label,
        channels: ["in_app", "whatsapp"],
      },
    ]);
  };

  const removeReminder = (id: string) => {
    setReminders(reminders.filter((r) => r.id !== id));
  };

  const toggleReminderChannel = (remId: string, ch: "in_app" | "whatsapp" | "email") => {
    setReminders(
      reminders.map((r) => {
        if (r.id !== remId) return r;
        const exists = r.channels.includes(ch);
        const next = exists ? r.channels.filter((c) => c !== ch) : [...r.channels, ch];
        return { ...r, channels: next.length > 0 ? next : ["in_app"] };
      })
    );
  };

  const handleCheckConflicts = async () => {
    setIsCheckingConflicts(true);
    try {
      const found = await calendarService.detectConflicts(
        { start_at: startAt, end_at: endAt, event_type: eventType },
        existingEvent?.id
      );
      setConflicts(found.map((c) => c.message));
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const payload: CreateCalendarEventInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      event_type: eventType,
      start_at: startAt,
      end_at: endAt,
      all_day: allDay,
      timezone,
      location: location.trim() || undefined,
      target_scope: targetScope,
      audiences: targetScope !== "all" ? audiences : [],
      reminders,
      linked_entity_type: linkedExamId ? "exam" : undefined,
      linked_entity_id: linkedExamId || undefined,
      publish_as_announcement: publishAsAnnouncement,
    };

    if (isEditing && existingEvent) {
      await updateMutation.mutateAsync({ ...payload, id: existingEvent.id });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onClose();
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-3xl max-h-[90vh] bg-card border border-border rounded-2xl shadow-xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {isEditing ? "Edit Calendar Event" : "Create Academic Calendar Event"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Centralized schedule with targeting, notifications, and portal visibility
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="p-5 space-y-6 overflow-y-auto flex-1 text-xs">
          {/* 1. Event Category Grid */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">
              Event Category <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.values(EVENT_TYPES_METADATA).map((meta) => {
                const isSelected = eventType === meta.type;
                const Icon = meta.icon;
                return (
                  <button
                    key={meta.type}
                    type="button"
                    onClick={() => handleEventTypeChange(meta.type)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground font-semibold shadow-2xs"
                        : "border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: meta.color }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </div>
                    <span className="text-[11px] truncate leading-tight">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Title & Description */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Event Title <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Mid-Term Mathematics Examination or Onam Celebration"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-input focus:ring-1 focus:ring-primary outline-hidden text-foreground font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Location / Venue (Optional)
                </label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="e.g. Auditorium, Exam Hall A, or Online"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-background border border-input focus:ring-1 focus:ring-primary outline-hidden text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Event Timing Mode
                </label>
                <div className="flex items-center gap-2 pt-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={allDay}
                      onChange={(e) => setAllDay(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>All-Day Event (Holiday / School Closure)</span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Description / Instructions (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Add special instructions, agenda details, or notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-input focus:ring-1 focus:ring-primary outline-hidden text-foreground resize-none"
              />
            </div>
          </div>

          {/* 3. Date & Precise 12-Hour Time Pickers */}
          <div className="space-y-3 pt-1 border-t border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Date & Schedule
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DateTime12hPicker
                label="Start Date & Time"
                value={startAt}
                onChange={(val) => {
                  setStartAt(val);
                  handleCheckConflicts();
                }}
                required
              />

              <DateTime12hPicker
                label="End Date & Time"
                value={endAt}
                onChange={(val) => {
                  setEndAt(val);
                  handleCheckConflicts();
                }}
                required
                minDate={startAt ? startAt.split("T")[0] : undefined}
              />
            </div>

            {/* Conflict Warning Card */}
            {conflicts.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Potential Scheduling Conflict Detected</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                  {conflicts.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 4. Audience Targeting Builder */}
          <div className="space-y-3 pt-1 border-t border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-primary" />
                <span>Audience Targeting & Scope</span>
              </h4>

              {targetPreview && (
                <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                  Targeting {targetPreview.totalRecipients} recipients ({targetPreview.studentsCount}{" "}
                  students, {targetPreview.parentsCount} parents, {targetPreview.staffCount} staff)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "all", label: "Entire Organization" },
                { id: "standards", label: "Specific Classes" },
                { id: "batches", label: "Specific Sections" },
                { id: "roles", label: "Specific Roles" },
              ].map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => setTargetScope(scope.id as TargetScope)}
                  className={`p-2 rounded-xl border text-center font-medium transition-colors ${
                    targetScope === scope.id
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-2xs"
                      : "border-border bg-background hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {scope.label}
                </button>
              ))}
            </div>

            {/* Targeted Class Dropdown */}
            {targetScope === "standards" && (
              <div className="pt-2">
                <select
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const st = standards.find((item) => item.id === e.target.value);
                    if (st) addAudienceRule("standard", st.id, `Class: ${st.name}`);
                    e.target.value = "";
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-input text-foreground"
                >
                  <option value="">+ Add Class to Target...</option>
                  {standards.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Targeted Batch Dropdown */}
            {targetScope === "batches" && (
              <div className="pt-2">
                <select
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const b = batches.find((item) => item.id === e.target.value);
                    if (b) addAudienceRule("batch", b.id, `Section: ${b.name}`);
                    e.target.value = "";
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-input text-foreground"
                >
                  <option value="">+ Add Section / Batch...</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Active Audience Tags */}
            {audiences.length > 0 && targetScope !== "all" && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {audiences.map((aud, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary/10 border border-primary/20 text-primary"
                  >
                    <span>{aud.target_name || aud.target_type}</span>
                    <button
                      type="button"
                      onClick={() => removeAudienceRule(idx)}
                      className="hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 5. Smart Multi-Channel Reminders */}
          <div className="space-y-3 pt-1 border-t border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-primary" />
                <span>Smart Multi-Channel Reminders</span>
              </h4>

              <div className="flex items-center gap-1">
                {DEFAULT_REMINDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => addReminder(opt)}
                    className="px-2 py-0.5 text-[10px] font-medium rounded-md border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    +{opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {reminders.map((rem) => (
                <div
                  key={rem.id}
                  className="p-2.5 rounded-xl border border-border bg-background flex items-center justify-between gap-3"
                >
                  <span className="font-semibold text-foreground text-xs">{rem.label}</span>

                  <div className="flex items-center gap-1.5">
                    {(["in_app", "whatsapp", "email"] as const).map((ch) => {
                      const active = rem.channels.includes(ch);
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => toggleReminderChannel(rem.id, ch)}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {ch.replace("_", " ")}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => removeReminder(rem.id)}
                      className="p-1 hover:text-destructive text-muted-foreground"
                      title="Remove reminder"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6. Integrations & Announcement Link */}
          <div className="space-y-3 pt-1 border-t border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Cross-Module Integrations
            </h4>

            {eventType === "exam" && availableExams.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Link to Scheduled Examination
                </label>
                <select
                  value={linkedExamId}
                  onChange={(e) => setLinkedExamId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-input text-foreground"
                >
                  <option value="">-- Standalone Exam Event --</option>
                  {availableExams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.subject_name || "General"} - {ex.exam_date})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-primary" />
                  <span>Also Publish as Official Announcement</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Creates a linked notice in the Announcement Center and notifies targeted portals
                </p>
              </div>

              <input
                type="checkbox"
                checked={publishAsAnnouncement}
                onChange={(e) => setPublishAsAnnouncement(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Create Event"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
