// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK PARENT PORTAL — Academic Calendar Page
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  isToday,
  parseISO,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  Sparkles,
  Download,
  Users,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useCalendarEvents } from "@/features/calendar/hooks/useCalendarEvents";
import { EVENT_TYPES_METADATA } from "@/features/calendar/constants/eventTypes";
import { MonthView } from "@/features/calendar/components/MonthView";
import { AgendaView } from "@/features/calendar/components/AgendaView";
import { EventDetailModal } from "@/features/calendar/components/EventDetailModal";
import { downloadCalendarIcsFile } from "@/features/calendar/utils/calendarIcs";
import type { CalendarEvent, CalendarViewMode } from "@/features/calendar/types/calendar.types";

export const ParentCalendarPage: React.FC = () => {
  const { activeChild, children: allChildren } = useActiveChild();
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "agenda">("agenda");
  const [selectedChildId, setSelectedChildId] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(addMonths(currentDate, 1)), "yyyy-MM-dd");

  const { data: allEvents = [], isLoading } = useCalendarEvents({
    start_date: monthStart,
    end_date: monthEnd,
  });

  // Filter events relevant to selected child or all children
  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev) => {
      // 1. Organization-wide events (holidays, school closures, general announcements)
      if (ev.target_scope === "all") return true;

      // 2. Filter by selected child's standard or batch
      if (selectedChildId === "all") {
        return allChildren.some((k) => {
          const stId = k.student.standard_id;
          const btId = k.student.batch_id;
          return ev.audiences?.some(
            (a) =>
              a.target_type === "all" ||
              a.target_type === "parent" ||
              (a.target_type === "standard" && a.target_id === stId) ||
              (a.target_type === "batch" && a.target_id === btId) ||
              (a.target_type === "student" && a.target_id === k.student.id)
          );
        });
      }

      // Specific child selected
      const targetChild = allChildren.find((k) => k.student.id === selectedChildId);
      if (!targetChild) return false;

      const stId = targetChild.student.standard_id;
      const btId = targetChild.student.batch_id;

      return ev.audiences?.some(
        (a) =>
          a.target_type === "all" ||
          a.target_type === "parent" ||
          (a.target_type === "standard" && a.target_id === stId) ||
          (a.target_type === "batch" && a.target_id === btId) ||
          (a.target_type === "student" && a.target_id === targetChild.student.id)
      );
    });
  }, [allEvents, selectedChildId, allChildren]);

  const handleExportIcs = () => {
    downloadCalendarIcsFile(
      filteredEvents,
      `My_Children_Calendar_${format(currentDate, "yyyy_MM")}.ics`,
      `Academic Calendar`
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border p-5 rounded-2xl shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-primary" />
            <span>Academic Calendar</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track holidays, examinations, PTMs, and important dates for your children
          </p>
        </div>

        {/* Multi-Child Selector */}
        {allChildren.length > 1 && (
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setSelectedChildId("all")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                selectedChildId === "all"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Children
            </button>
            {allChildren.map((k) => (
              <button
                key={k.student.id}
                type="button"
                onClick={() => setSelectedChildId(k.student.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  selectedChildId === k.student.id
                    ? "bg-card text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k.student.name.split(" ")[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation & View Toggle Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border p-3.5 rounded-2xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-foreground">
            {format(currentDate, "MMMM yyyy")}
          </span>
          <button
            type="button"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Agenda vs Month Switcher */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setViewMode("agenda")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                viewMode === "agenda"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground"
              }`}
            >
              Agenda View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                viewMode === "month"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground"
              }`}
            >
              Month View
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportIcs}
            className="px-3 py-1.5 text-xs font-medium rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Add to Calendar</span>
          </button>
        </div>
      </div>

      {/* Main Content View */}
      {isLoading ? (
        <div className="p-16 text-center text-xs text-muted-foreground">Loading calendar...</div>
      ) : viewMode === "month" ? (
        <MonthView
          currentDate={currentDate}
          events={filteredEvents}
          onSelectEvent={setSelectedEvent}
        />
      ) : (
        <AgendaView events={filteredEvents} onSelectEvent={setSelectedEvent} />
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          canManage={false}
        />
      )}
    </div>
  );
};

export default ParentCalendarPage;
