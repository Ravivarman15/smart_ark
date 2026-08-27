// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Month View Component
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from "date-fns";
import type { CalendarEvent } from "../types/calendar.types";
import { EVENT_TYPES_METADATA } from "../constants/eventTypes";

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDate?: (date: Date) => void;
}

export const MonthView: React.FC<Props> = ({
  currentDate,
  events,
  onSelectEvent,
  onSelectDate,
}) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Helper to find events on a given day
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
      {/* Weekday Column Headers */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center py-2.5">
        {weekDayLabels.map((lbl, i) => (
          <span
            key={lbl}
            className={`text-xs font-semibold uppercase tracking-wider ${
              i === 0 ? "text-rose-500" : "text-muted-foreground"
            }`}
          >
            {lbl}
          </span>
        ))}
      </div>

      {/* Days Grid Matrix */}
      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border/60">
        {days.map((day, idx) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const today = isToday(day);
          const holidays = dayEvents.filter((e) => e.event_type === "holiday");
          const isHoliday = holidays.length > 0;

          return (
            <div
              key={idx}
              onClick={() => onSelectDate && onSelectDate(day)}
              className={`min-h-[110px] sm:min-h-[125px] p-1.5 flex flex-col justify-between transition-colors cursor-pointer group ${
                !isCurrentMonth
                  ? "bg-muted/15 text-muted-foreground/40"
                  : isHoliday
                  ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                  : "hover:bg-muted/30"
              }`}
            >
              {/* Day Number Header */}
              <div className="flex items-center justify-between px-1">
                <span
                  className={`w-6 h-6 flex items-center justify-center text-xs rounded-full font-bold transition-transform group-hover:scale-105 ${
                    today
                      ? "bg-primary text-primary-foreground font-extrabold shadow-2xs"
                      : isHoliday
                      ? "text-emerald-700 dark:text-emerald-300 font-bold"
                      : isCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  {format(day, "d")}
                </span>

                {isHoliday && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    🏖
                  </span>
                )}
              </div>

              {/* Day Events Stack */}
              <div className="space-y-1 mt-1 flex-1 overflow-hidden">
                {dayEvents.slice(0, 3).map((ev) => {
                  const meta = EVENT_TYPES_METADATA[ev.event_type] || EVENT_TYPES_METADATA.custom;
                  const isCancelled = ev.status === "cancelled";
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(ev);
                      }}
                      className={`w-full text-left px-1.5 py-0.5 rounded-md text-[11px] font-medium truncate flex items-center gap-1 transition-transform hover:scale-[1.02] border ${
                        meta.badgeClass
                      } ${isCancelled ? "line-through opacity-50" : ""}`}
                      title={`${ev.title} (${meta.label})`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="truncate">{ev.title}</span>
                    </button>
                  );
                })}

                {dayEvents.length > 3 && (
                  <span className="block text-[10px] font-bold text-muted-foreground hover:text-primary px-1">
                    +{dayEvents.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
