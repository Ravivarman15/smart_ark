// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Dashboard Widgets
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import { format, isToday, parseISO } from "date-fns";
import { Calendar, ChevronRight, Sparkles, Award, Users, Clock } from "lucide-react";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import { EVENT_TYPES_METADATA } from "../constants/eventTypes";
import type { CalendarEvent } from "../types/calendar.types";
import { useNavigate } from "react-router-dom";

interface Props {
  role?: string;
  limit?: number;
  onSelectEvent?: (event: CalendarEvent) => void;
}

export const UpcomingEventsWidget: React.FC<Props> = ({
  role = "admin",
  limit = 4,
  onSelectEvent,
}) => {
  const navigate = useNavigate();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const nextMonthStr = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

  const { data: events = [], isLoading } = useCalendarEvents({
    start_date: todayStr,
    end_date: nextMonthStr,
  });

  const upcoming = events.slice(0, limit);

  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-2xs space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-foreground">Academic Calendar</h4>
            <p className="text-[11px] text-muted-foreground">Upcoming holidays, exams & events</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/${role}/calendar`)}
          className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5"
        >
          <span>View All</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Events List */}
      {isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading calendar...</div>
      ) : upcoming.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No upcoming events in the next 30 days.
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map((ev) => {
            const meta = EVENT_TYPES_METADATA[ev.event_type] || EVENT_TYPES_METADATA.custom;
            const Icon = meta.icon;
            const isEventToday = isToday(parseISO(ev.start_at));

            return (
              <div
                key={ev.id}
                onClick={() => (onSelectEvent ? onSelectEvent(ev) : navigate(`/${role}/calendar`))}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer hover:shadow-2xs flex items-center justify-between gap-2.5 ${meta.badgeClass}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs"
                    style={{ backgroundColor: meta.color }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{ev.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {isEventToday
                        ? "Today"
                        : format(new Date(ev.start_at), "EEE, d MMM")}
                      {!ev.all_day && ` • ${format(new Date(ev.start_at), "h:mm a")}`}
                    </p>
                  </div>
                </div>

                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                >
                  {meta.shortLabel}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
