// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Academic Calendar Management Page
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from "react";
import {
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { Calendar as CalendarIcon, Sparkles } from "lucide-react";
import { CalendarHeader } from "../components/CalendarHeader";
import { MonthView } from "../components/MonthView";
import { WeekView } from "../components/WeekView";
import { DayView } from "../components/DayView";
import { AgendaView } from "../components/AgendaView";
import { EventComposerModal } from "../components/EventComposerModal";
import { EventDetailModal } from "../components/EventDetailModal";
import { CalendarImportModal } from "../components/CalendarImportModal";
import { CalendarAnalyticsDrawer } from "../components/CalendarAnalyticsDrawer";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import { downloadCalendarIcsFile } from "../utils/calendarIcs";
import type { CalendarEvent, CalendarViewMode, EventFilter } from "../types/calendar.types";
import { usePermissions } from "@/core/permissions";

export const AcademicCalendarPage: React.FC = () => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [filter, setFilter] = useState<EventFilter>({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedDateForCreate, setSelectedDateForCreate] = useState<Date>(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const { canDoAction } = usePermissions();
  const canManage = canDoAction("calendar.create") || canDoAction("calendar.manage");

  // Calculate query date window based on current view mode
  const dateWindow = useMemo(() => {
    if (viewMode === "month") {
      const s = startOfWeek(startOfMonth(currentDate));
      const e = endOfWeek(endOfMonth(currentDate));
      return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd") };
    }
    if (viewMode === "week") {
      const s = startOfWeek(currentDate);
      const e = endOfWeek(currentDate);
      return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd") };
    }
    if (viewMode === "day") {
      const d = format(currentDate, "yyyy-MM-dd");
      return { start: d, end: d };
    }
    // Agenda: 3 months window
    const s = format(startOfMonth(currentDate), "yyyy-MM-dd");
    const e = format(endOfMonth(addMonths(currentDate, 2)), "yyyy-MM-dd");
    return { start: s, end: e };
  }, [currentDate, viewMode]);

  const { data: events = [], isLoading } = useCalendarEvents({
    ...filter,
    start_date: dateWindow.start,
    end_date: dateWindow.end,
  });

  const handlePrev = () => {
    if (viewMode === "month") setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(subWeeks(currentDate, 1));
    else if (viewMode === "day") setCurrentDate(subDays(currentDate, 1));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const handleNext = () => {
    if (viewMode === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(addWeeks(currentDate, 1));
    else if (viewMode === "day") setCurrentDate(addDays(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const handleToday = () => setCurrentDate(new Date());

  const getHeaderTitle = (): string => {
    if (viewMode === "month") return format(currentDate, "MMMM yyyy");
    if (viewMode === "week") {
      const s = startOfWeek(currentDate);
      const e = endOfWeek(currentDate);
      return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
    }
    if (viewMode === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    return `Agenda (${format(currentDate, "MMMM yyyy")})`;
  };

  const handleExportIcs = () => {
    downloadCalendarIcsFile(
      events,
      `Academic_Calendar_${format(currentDate, "yyyy_MM")}.ics`,
      `Smart ARK Academic Calendar`
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Page Title & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-primary" />
            <span>Smart Academic Calendar</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Centralized timeline for holidays, exams, PTMs, assignment deadlines, and school events
          </p>
        </div>
      </div>

      {/* Calendar Controls & Navigation Header */}
      <CalendarHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        title={getHeaderTitle()}
        onCreateEvent={() => {
          setSelectedDateForCreate(new Date());
          setEditingEvent(null);
          setComposerOpen(true);
        }}
        onOpenImport={() => setImportOpen(true)}
        onOpenAnalytics={() => setAnalyticsOpen(true)}
        onExportIcs={handleExportIcs}
        filter={filter}
        onFilterChange={setFilter}
        canManage={canManage}
      />

      {/* Calendar Grid / Content Views */}
      {isLoading ? (
        <div className="p-16 text-center space-y-2 bg-card border border-border rounded-2xl">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground font-medium">Loading academic calendar events...</p>
        </div>
      ) : viewMode === "month" ? (
        <MonthView
          currentDate={currentDate}
          events={events}
          onSelectEvent={setSelectedEvent}
          onSelectDate={(d) => {
            setSelectedDateForCreate(d);
            setComposerOpen(true);
          }}
        />
      ) : viewMode === "week" ? (
        <WeekView
          currentDate={currentDate}
          events={events}
          onSelectEvent={setSelectedEvent}
          onSelectDate={(d) => {
            setSelectedDateForCreate(d);
            setComposerOpen(true);
          }}
        />
      ) : viewMode === "day" ? (
        <DayView
          currentDate={currentDate}
          events={events}
          onSelectEvent={setSelectedEvent}
        />
      ) : (
        <AgendaView events={events} onSelectEvent={setSelectedEvent} />
      )}

      {/* Event Composer Modal */}
      {composerOpen && (
        <EventComposerModal
          isOpen={composerOpen}
          onClose={() => {
            setComposerOpen(false);
            setEditingEvent(null);
          }}
          initialDate={selectedDateForCreate}
          existingEvent={editingEvent}
        />
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={(ev) => {
            setEditingEvent(ev);
            setComposerOpen(true);
          }}
          canManage={canManage}
        />
      )}

      {/* Calendar Bulk Import Modal */}
      {importOpen && (
        <CalendarImportModal
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
        />
      )}

      {/* Operational Analytics Drawer */}
      {analyticsOpen && (
        <CalendarAnalyticsDrawer
          isOpen={analyticsOpen}
          onClose={() => setAnalyticsOpen(false)}
          events={events}
        />
      )}
    </div>
  );
};

export default AcademicCalendarPage;
