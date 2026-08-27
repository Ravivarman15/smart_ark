// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Event Detail Modal
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import {
  X,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  Bell,
  Download,
  Edit2,
  Trash2,
  ExternalLink,
  Tag,
  AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "../types/calendar.types";
import { EVENT_TYPES_METADATA } from "../constants/eventTypes";
import { downloadCalendarIcsFile } from "../utils/calendarIcs";
import { useDeleteCalendarEvent } from "../hooks/useCalendarEvents";
import { useNavigate } from "react-router-dom";

interface Props {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit?: (event: CalendarEvent) => void;
  canManage?: boolean;
}

export const EventDetailModal: React.FC<Props> = ({
  event,
  onClose,
  onEdit,
  canManage = true,
}) => {
  const deleteMutation = useDeleteCalendarEvent();
  const navigate = useNavigate();

  if (!event) return null;

  const meta = EVENT_TYPES_METADATA[event.event_type] || EVENT_TYPES_METADATA.custom;
  const Icon = meta.icon;
  const isCancelled = event.status === "cancelled";

  const handleExportIcs = () => {
    downloadCalendarIcsFile([event], `${event.title.replace(/\s+/g, "_")}.ics`, event.title);
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to remove "${event.title}" from the calendar?`)) {
      await deleteMutation.mutateAsync(event.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col text-xs">
        {/* Modal Header */}
        <div className={`p-4 sm:p-5 border-b border-border flex items-start justify-between ${meta.badgeClass}`}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
              style={{ backgroundColor: meta.color }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-background/80 border border-border">
                {meta.label}
              </span>
              <h3 className="text-base font-bold text-foreground mt-1">{event.title}</h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Status & Cancellation Alert */}
          {isCancelled && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>This event has been cancelled.</span>
            </div>
          )}

          {/* Date & Time */}
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-2">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <CalendarIcon className="w-4 h-4 text-primary shrink-0" />
              <span>
                {format(new Date(event.start_at), "EEEE, MMMM d, yyyy")}
                {event.start_at.substring(0, 10) !== event.end_at.substring(0, 10) && (
                  <span> to {format(new Date(event.end_at), "EEEE, MMMM d, yyyy")}</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground font-medium pl-6">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                {event.all_day
                  ? "All Day Event"
                  : `${format(new Date(event.start_at), "h:mm a")} - ${format(
                      new Date(event.end_at),
                      "h:mm a"
                    )} (${event.timezone})`}
              </span>
            </div>

            {event.location && (
              <div className="flex items-center gap-2 text-muted-foreground font-medium pl-6">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>{event.location}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {event.description && (
            <div className="space-y-1">
              <h4 className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                Details
              </h4>
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          )}

          {/* Audience Targeting */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider flex items-center gap-1">
              <Users className="w-3 h-3 text-primary" />
              <span>Audience Scope</span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {event.target_scope === "all" ? (
                <span className="px-2.5 py-0.5 rounded-md bg-muted text-foreground font-medium border border-border">
                  Entire Organization (All Students, Parents & Staff)
                </span>
              ) : (
                event.audiences?.map((aud, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-0.5 rounded-md bg-primary/10 text-primary font-semibold border border-primary/20"
                  >
                    {aud.target_name || aud.target_type}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Reminders List */}
          {event.reminders && event.reminders.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider flex items-center gap-1">
                <Bell className="w-3 h-3 text-primary" />
                <span>Configured Smart Reminders</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {event.reminders.map((rem) => (
                  <span
                    key={rem.id}
                    className="px-2 py-0.5 rounded-md bg-muted text-foreground font-medium border border-border text-[11px]"
                  >
                    🔔 {rem.label} ({rem.channels.join(", ")})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Deep Link to Exam / Announcement */}
          {event.linked_entity_type === "exam" && (
            <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 flex items-center justify-between">
              <div>
                <p className="font-bold text-indigo-900 dark:text-indigo-200">
                  Linked Online Examination
                </p>
                <p className="text-[11px] text-muted-foreground">
                  View full test paper and instructions in the Exam Runner
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate("/admin/exams")}
                className="px-3 py-1 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1 text-[11px]"
              >
                <span>Open Exam</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-border flex items-center justify-between bg-muted/20">
          <button
            type="button"
            onClick={handleExportIcs}
            className="px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted font-medium text-foreground transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Add to Calendar (.ics)</span>
          </button>

          <div className="flex items-center gap-2">
            {canManage && onEdit && !isCancelled && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(event);
                }}
                className="px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-foreground transition-colors flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}

            {canManage && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-3 py-1.5 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 font-semibold transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
