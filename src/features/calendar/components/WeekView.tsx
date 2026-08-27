// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Week View Component
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  format,
} from "date-fns";
import type { CalendarEvent } from "../types/calendar.types";
import { EVENT_TYPES_METADATA } from "../constants/eventTypes";
import { Clock, MapPin } from "lucide-react";

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDate?: (date: Date) => void;
}

export const WeekView: React.FC<Props> = ({
  currentDate,
  events,
  onSelectEvent,
  onSelectDate,
}) => {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    const dayStr = format(day, "yyyy-MM-dd");
    return events.filter((ev) => {
      const startStr = ev.start_at.substring(0, 10);
      const endStr = ev.end_at.substring(0, 10);
      return dayStr >= startStr && dayStr <= endStr;
    });
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xs">
      {/* 7 Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-border">
        {weekDays.map((day) => {
          const dayEvents = getEventsForDay(day);
          const today = isToday(day);
          const isSunday = day.getDay() === 0;

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[300px] flex flex-col ${
                today ? "bg-primary/5" : isSunday ? "bg-muted/15" : "bg-card"
              }`}
            >
              {/* Day Column Header */}
              <div
                onClick={() => onSelectDate && onSelectDate(day)}
                className={`p-3 border-b border-border text-center cursor-pointer transition-colors hover:bg-muted/40 ${
                  today ? "bg-primary/10" : "bg-muted/20"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                  {format(day, "EEE")}
                </p>
                <p
                  className={`text-lg font-extrabold mt-0.5 inline-block w-8 h-8 rounded-full leading-8 ${
                    today
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-foreground"
                  }`}
                >
                  {format(day, "d")}
                </p>
              </div>

              {/* Day Events List */}
              <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[500px]">
                {dayEvents.length === 0 ? (
                  <p className="text-center text-[11px] text-muted-foreground/50 py-6">
                    No events
                  </p>
                ) : (
                  dayEvents.map((ev) => {
                    const meta =
                      EVENT_TYPES_METADATA[ev.event_type] || EVENT_TYPES_METADATA.custom;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={ev.id}
                        onClick={() => onSelectEvent(ev)}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all hover:scale-[1.02] hover:shadow-2xs ${meta.badgeClass}`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{ev.title}</span>
                        </div>

                        {!ev.all_day && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 font-medium">
                            <Clock className="w-3 h-3" />
                            <span>
                              {format(new Date(ev.start_at), "h:mm a")} -{" "}
                              {format(new Date(ev.end_at), "h:mm a")}
                            </span>
                          </div>
                        )}

                        {ev.location && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 truncate">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{ev.location}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
