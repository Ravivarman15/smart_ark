// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Responsive Timetable Viewer (Desktop & Mobile)
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Search,
  Download,
  CalendarPlus,
  FileSpreadsheet,
  CheckCircle2,
  Filter,
  Info,
  BookOpen,
} from "lucide-react";
import { format, isToday, isThisWeek, isFuture, isPast, parseISO, isValid } from "date-fns";
import { toast } from "sonner";
import type {
  AnnouncementTimetableData,
  TimetableRow,
} from "../../types/announcements.types";
import {
  generateIcsCalendar,
  downloadIcsFile,
  exportTimetableCsv,
} from "../../utils/timetableParser";

interface Props {
  timetable: AnnouncementTimetableData;
  announcementTitle?: string;
  className?: string;
}

type FilterTab = "all" | "today" | "this_week" | "upcoming" | "past";

export const TimetableViewer: React.FC<Props> = ({
  timetable,
  announcementTitle = "Timetable",
  className = "",
}) => {
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [viewMode, setViewMode] = useState<"auto" | "table" | "cards">("auto");

  const rows = timetable.rows || [];
  const columns = timetable.columns || [];

  // Filter and search rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Tab filter
      if (filterTab !== "all" && row.date) {
        try {
          const parsed = parseISO(row.date);
          if (isValid(parsed)) {
            if (filterTab === "today" && !isToday(parsed)) return false;
            if (filterTab === "this_week" && !isThisWeek(parsed)) return false;
            if (filterTab === "upcoming" && !isFuture(parsed) && !isToday(parsed)) return false;
            if (filterTab === "past" && !isPast(parsed)) return false;
          }
        } catch {
          // ignore
        }
      }

      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const match =
          (row.subject && row.subject.toLowerCase().includes(q)) ||
          (row.teacher && row.teacher.toLowerCase().includes(q)) ||
          (row.room && row.room.toLowerCase().includes(q)) ||
          (row.notes && row.notes.toLowerCase().includes(q)) ||
          (row.day && row.day.toLowerCase().includes(q)) ||
          (row.date && row.date.toLowerCase().includes(q)) ||
          (row.description && row.description.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [rows, filterTab, search]);

  // Group rows by Date or Day for timeline/card view
  const groupedRows = useMemo(() => {
    const map = new Map<string, TimetableRow[]>();
    filteredRows.forEach((row) => {
      let groupKey = "Schedule";
      if (row.date) {
        try {
          const parsed = parseISO(row.date);
          if (isValid(parsed)) {
            groupKey = `${format(parsed, "EEEE, d MMMM yyyy")}`;
          } else {
            groupKey = row.day ? `${row.day} (${row.date})` : row.date;
          }
        } catch {
          groupKey = row.date;
        }
      } else if (row.day) {
        groupKey = row.day;
      }

      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(row);
    });

    return Array.from(map.entries()).map(([groupName, items]) => ({
      groupName,
      items,
    }));
  }, [filteredRows]);

  // Export to Calendar (.ics)
  const handleExportIcs = () => {
    try {
      const ics = generateIcsCalendar(
        timetable.title || announcementTitle,
        filteredRows.length > 0 ? filteredRows : rows
      );
      const filename = `${(timetable.title || announcementTitle || "timetable")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")}.ics`;
      downloadIcsFile(filename, ics);
      toast.success("Calendar (.ics) downloaded! Open to add to Google/Apple/Outlook Calendar.");
    } catch (err: any) {
      toast.error("Failed to generate calendar file: " + (err.message || "Unknown error"));
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    exportTimetableCsv(
      timetable.title || announcementTitle,
      columns,
      filteredRows.length > 0 ? filteredRows : rows
    );
    toast.success("Timetable CSV downloaded.");
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Timetable Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-card/60 backdrop-blur-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {timetable.title || "Examination & Class Timetable"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {rows.length} scheduled session{rows.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Quick Filter tabs */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
            {(
              [
                { id: "all", label: "All" },
                { id: "upcoming", label: "Upcoming" },
                { id: "today", label: "Today" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterTab(t.id)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors font-medium ${
                  filterTab === t.id
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Calendar Export button */}
          <button
            type="button"
            onClick={handleExportIcs}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
            title="Add events to your personal calendar (Google / Apple / Outlook)"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>Add to Calendar</span>
          </button>

          {/* CSV Export */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Export as CSV spreadsheet"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by subject, teacher, venue, or notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-input bg-background text-foreground focus:ring-1 focus:ring-primary outline-hidden"
        />
      </div>

      {/* ── Desktop View (Visible on md and up) ── */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-muted-foreground font-semibold">
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              {columns.map((col) => (
                <th key={col.key} className="py-2.5 px-3 whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No timetable entries match your search or filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, idx) => (
                <tr key={row.id || idx} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-3 text-center text-muted-foreground font-mono font-medium">
                    {idx + 1}
                  </td>
                  {columns.map((col) => {
                    const val = row[col.key];
                    if (col.key === "subject") {
                      return (
                        <td key={col.key} className="py-2.5 px-3 font-semibold text-foreground">
                          {val || "—"}
                        </td>
                      );
                    }
                    if (col.key === "start_time" || col.key === "end_time") {
                      return (
                        <td key={col.key} className="py-2.5 px-3 font-mono text-muted-foreground">
                          {val || "—"}
                        </td>
                      );
                    }
                    if (col.key === "room") {
                      return (
                        <td key={col.key} className="py-2.5 px-3 text-muted-foreground">
                          {val ? (
                            <span className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-[11px] font-medium">
                              <MapPin className="w-3 h-3 text-primary" />
                              {val}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    }
                    if (col.key === "teacher") {
                      return (
                        <td key={col.key} className="py-2.5 px-3 text-muted-foreground">
                          {val ? (
                            <span className="inline-flex items-center gap-1">
                              <User className="w-3 h-3 text-muted-foreground" />
                              {val}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    }
                    return (
                      <td key={col.key} className="py-2.5 px-3 text-muted-foreground">
                        {val || "—"}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile / Responsive Card Timeline View (Visible on mobile screens) ── */}
      <div className="block md:hidden space-y-4">
        {groupedRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground border border-border rounded-xl bg-card">
            No timetable entries match your search or filter.
          </div>
        ) : (
          groupedRows.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              {/* Date / Day Header Pill */}
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>{group.groupName}</span>
              </div>

              {/* Stacked Cards for that date */}
              <div className="space-y-2">
                {group.items.map((row, rIdx) => (
                  <div
                    key={row.id || rIdx}
                    className="p-3.5 rounded-xl border border-border bg-card shadow-2xs space-y-2 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-foreground">
                        {row.subject || "Session"}
                      </h4>

                      {(row.start_time || row.end_time) && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">
                          <Clock className="w-3 h-3" />
                          <span>
                            {row.start_time}
                            {row.end_time ? ` – ${row.end_time}` : ""}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Metadata tags: Room, Teacher, Description */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-0.5">
                      {row.room && (
                        <span className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-[11px] font-medium text-foreground">
                          <MapPin className="w-3 h-3 text-primary" />
                          {row.room}
                        </span>
                      )}
                      {row.teacher && (
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <User className="w-3 h-3" />
                          {row.teacher}
                        </span>
                      )}
                    </div>

                    {row.notes && (
                      <p className="text-[11px] text-muted-foreground italic border-t border-border pt-1.5">
                        {row.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
