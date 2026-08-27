// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Agenda View Component
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import { format, isToday, isTomorrow, parseISO, isPast } from "date-fns";
import type { CalendarEvent } from "../types/calendar.types";
import { EVENT_TYPES_METADATA } from "../constants/eventTypes";
import { Clock, MapPin, Users, Tag, ChevronRight, Award } from "lucide-react";

interface Props {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
}

export const AgendaView: React.FC<Props> = ({ events, onSelectEvent }) => {
  // Group events by start date (YYYY-MM-DD)
  const grouped = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    // Sort ascending
    const sorted = [...events].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );

    for (const ev of sorted) {
      const dateKey = ev.start_at.substring(0, 10);
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(ev);
    }
    return Array.from(map.entries());
  }, [events]);

  if (grouped.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 text-center space-y-2 shadow-2xs">
        <p className="text-3xl">🗓️</p>
        <h4 className="text-sm font-semibold text-foreground">No events found in this date range</h4>
        <p className="text-xs text-muted-foreground">Adjust filters or search keywords to view events</p>
      </div>
    );
  }

  const getDateLabel = (dateStr: string): string => {
    try {
      const d = parseISO(dateStr);
      if (isToday(d)) return "TODAY";
      if (isTomorrow(d)) return "TOMORROW";
      return format(d, "EEEE, MMMM d, yyyy").toUpperCase();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {grouped.map(([dateKey, dayEvents]) => {
        const isDateToday = isToday(parseISO(dateKey));

        return (
          <div key={dateKey} className="space-y-2.5">
            {/* Group Header Badge */}
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-lg text-xs font-extrabold tracking-wide uppercase ${
                  isDateToday
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {getDateLabel(dateKey)}
              </span>
              <div className="h-px bg-border flex-1" />
            </div>

            {/* Event Items */}
            <div className="space-y-2">
              {dayEvents.map((ev) => {
                const meta =
                  EVENT_TYPES_METADATA[ev.event_type] || EVENT_TYPES_METADATA.custom;
                const Icon = meta.icon;
                const isCancelled = ev.status === "cancelled";

                return (
                  <div
                    key={ev.id}
                    onClick={() => onSelectEvent(ev)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-xs hover:border-primary/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      meta.badgeClass
                    } ${isCancelled ? "opacity-60 line-through" : ""}`}
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                        style={{ backgroundColor: meta.color }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-foreground">{ev.title}</h4>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase"
                            style={{
                              backgroundColor: `${meta.color}20`,
                              color: meta.color,
                            }}
                          >
                            {meta.shortLabel}
                          </span>
                          {ev.is_recurring && (
                            <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                              🔁 Recurring
                            </span>
                          )}
                        </div>

                        {ev.description && (
                          <p className="text-xs text-foreground/80 line-clamp-1">
                            {ev.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right side info & arrow */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60 shrink-0">
                      <div className="text-left sm:text-right space-y-0.5">
                        <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
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

                        {ev.location && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground justify-start sm:justify-end">
                            <MapPin className="w-3 h-3" />
                            <span>{ev.location}</span>
                          </div>
                        )}
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 hidden sm:block" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
