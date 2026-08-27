// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Day View Component
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import { format, isToday } from "date-fns";
import type { CalendarEvent } from "../types/calendar.types";
import { EVENT_TYPES_METADATA } from "../constants/eventTypes";
import { Clock, MapPin, Users } from "lucide-react";

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
}

export const DayView: React.FC<Props> = ({ currentDate, events, onSelectEvent }) => {
  const dayStr = format(currentDate, "yyyy-MM-dd");
  const today = isToday(currentDate);

  const dayEvents = events.filter((ev) => {
    const startStr = ev.start_at.substring(0, 10);
    const endStr = ev.end_at.substring(0, 10);
    return dayStr >= startStr && dayStr <= endStr;
  });

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-2xs space-y-4">
      {/* Day Header Banner */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {format(currentDate, "EEEE")}
          </p>
          <h3 className="text-xl sm:text-2xl font-extrabold text-foreground flex items-center gap-2">
            <span>{format(currentDate, "MMMM d, yyyy")}</span>
            {today && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-primary/10 text-primary border border-primary/20">
                Today
              </span>
            )}
          </h3>
        </div>

        <div className="text-right text-xs font-semibold text-muted-foreground">
          <span>{dayEvents.length} Event(s) Scheduled</span>
        </div>
      </div>

      {/* Events Timeline / Schedule */}
      {dayEvents.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="text-3xl">🗓️</p>
          <p className="text-sm font-semibold text-foreground">No events scheduled for this day</p>
          <p className="text-xs text-muted-foreground">Click "Create Event" to schedule an activity</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayEvents.map((ev) => {
            const meta = EVENT_TYPES_METADATA[ev.event_type] || EVENT_TYPES_METADATA.custom;
            const Icon = meta.icon;

            return (
              <div
                key={ev.id}
                onClick={() => onSelectEvent(ev)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-xs ${meta.badgeClass} space-y-2`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: meta.color }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{ev.title}</h4>
                      <p className="text-xs text-muted-foreground">{meta.label}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-semibold bg-background/80 px-2.5 py-1 rounded-lg border border-border shrink-0">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span>
                      {ev.all_day
                        ? "All Day"
                        : `${format(new Date(ev.start_at), "h:mm a")} - ${format(
                            new Date(ev.end_at),
                            "h:mm a"
                          )}`}
                    </span>
                  </div>
                </div>

                {ev.description && (
                  <p className="text-xs text-foreground/80 leading-relaxed pl-10">
                    {ev.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground pl-10 pt-1">
                  {ev.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{ev.location}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    <span className="capitalize">{ev.target_scope} Audience</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
