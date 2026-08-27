import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
  Download,
  Upload,
  BarChart3,
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { CalendarEventType, CalendarViewMode, EventFilter } from "../types/calendar.types";
import { EVENT_TYPES_METADATA } from "../constants/eventTypes";

interface Props {
  currentDate: Date;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  title: string;
  onCreateEvent?: () => void;
  onOpenImport?: () => void;
  onOpenAnalytics?: () => void;
  onExportIcs?: () => void;
  filter: EventFilter;
  onFilterChange: (f: EventFilter) => void;
  canManage?: boolean;
}

export const CalendarHeader: React.FC<Props> = ({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  title,
  onCreateEvent,
  onOpenImport,
  onOpenAnalytics,
  onExportIcs,
  filter,
  onFilterChange,
  canManage = true,
}) => {
  const [filterOpen, setFilterOpen] = React.useState(false);

  const activeCategoryCount = filter.event_types?.length || 0;

  const toggleCategory = (type: CalendarEventType) => {
    const current = filter.event_types || [];
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    onFilterChange({ ...filter, event_types: next.length > 0 ? next : undefined });
  };

  const clearFilters = () => {
    onFilterChange({
      ...filter,
      event_types: undefined,
      search: undefined,
      standard_id: undefined,
      batch_id: undefined,
    });
  };

  return (
    <div className="space-y-3">
      {/* Top Bar: Title, Date Nav, Views & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card border border-border p-4 rounded-2xl shadow-2xs">
        {/* Date Navigation */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center bg-muted/60 rounded-xl p-0.5 border border-border">
            <button
              type="button"
              onClick={onPrev}
              className="p-1.5 hover:bg-background rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onToday}
              className="px-2.5 py-1 text-xs font-semibold hover:bg-background rounded-lg text-foreground transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={onNext}
              className="p-1.5 hover:bg-background rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
            {title}
          </h2>
        </div>

        {/* View Mode & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search events..."
              value={filter.search || ""}
              onChange={(e) => onFilterChange({ ...filter, search: e.target.value || undefined })}
              className="w-32 sm:w-44 pl-8 pr-2.5 py-1.5 text-xs rounded-xl border border-input bg-background text-foreground focus:ring-1 focus:ring-primary outline-hidden"
            />
          </div>

          {/* Filter Toggle */}
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors flex items-center gap-1.5 ${
              activeCategoryCount > 0 || filterOpen
                ? "border-primary bg-primary/10 text-primary font-semibold"
                : "border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Categories</span>
            {activeCategoryCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                {activeCategoryCount}
              </span>
            )}
          </button>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-muted/60 rounded-xl p-0.5 border border-border">
            {(["month", "week", "day", "agenda"] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                className={`px-3 py-1 text-xs font-semibold capitalize rounded-lg transition-colors ${
                  viewMode === mode
                    ? "bg-card text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Export ICS Button */}
          {onExportIcs && (
            <button
              type="button"
              onClick={onExportIcs}
              className="p-2 text-xs font-medium rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Export Calendar (.ics)"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Import Spreadsheet Button */}
          {canManage && onOpenImport && (
            <button
              type="button"
              onClick={onOpenImport}
              className="p-2 text-xs font-medium rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Bulk Import (.xlsx / .csv)"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Analytics Drawer Button */}
          {onOpenAnalytics && (
            <button
              type="button"
              onClick={onOpenAnalytics}
              className="p-2 text-xs font-medium rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Calendar Operational Analytics"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Create Event Button */}
          {canManage && onCreateEvent && (
            <button
              type="button"
              onClick={onCreateEvent}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Event</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Category Filter Drawer */}
      {filterOpen && (
        <div className="p-3.5 bg-card/70 border border-border rounded-2xl space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
              <span>Filter by Event Category</span>
            </span>
            {activeCategoryCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 font-medium"
              >
                <X className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {Object.values(EVENT_TYPES_METADATA).map((meta) => {
              const isSelected = filter.event_types?.includes(meta.type) ?? false;
              const Icon = meta.icon;
              return (
                <button
                  key={meta.type}
                  type="button"
                  onClick={() => toggleCategory(meta.type)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
                    isSelected
                      ? `${meta.badgeClass} ring-1 ring-primary/40 font-semibold shadow-2xs`
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  <Icon className="w-3 h-3" />
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
