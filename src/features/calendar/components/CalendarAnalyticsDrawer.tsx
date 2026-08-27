// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Operational Calendar Analytics Drawer
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import {
  X,
  BarChart3,
  Calendar,
  Sparkles,
  Award,
  Bell,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import type { CalendarEvent } from "../types/calendar.types";
import { EVENT_TYPES_METADATA } from "../constants/eventTypes";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[];
}

export const CalendarAnalyticsDrawer: React.FC<Props> = ({ isOpen, onClose, events }) => {
  if (!isOpen) return null;

  // Category counts
  const categoryCounts = events.reduce((acc, ev) => {
    acc[ev.event_type] = (acc[ev.event_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Reminder stats
  let totalRemindersConfigured = 0;
  for (const ev of events) {
    totalRemindersConfigured += ev.reminders?.length || 0;
  }

  const holidaysCount = categoryCounts["holiday"] || 0;
  const examsCount = categoryCounts["exam"] || 0;
  const ptmsCount = categoryCounts["ptm"] || categoryCounts["parent_meeting"] || 0;
  const specialClassesCount = categoryCounts["special_class"] || 0;
  const deadlinesCount = categoryCounts["assignment_deadline"] || 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-2xs animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border-l border-border h-full shadow-2xl flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Calendar Operational Analytics</h3>
              <p className="text-[11px] text-muted-foreground">
                Distribution, reminders pipeline & academic density
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="p-5 space-y-6 overflow-y-auto flex-1">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-border bg-background space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">
                Total Events Active
              </span>
              <p className="text-2xl font-extrabold text-foreground">{events.length}</p>
              <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>In current view window</span>
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-background space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">
                Smart Reminders
              </span>
              <p className="text-2xl font-extrabold text-primary">{totalRemindersConfigured}</p>
              <p className="text-[10px] text-muted-foreground">Configured notifications</p>
            </div>
          </div>

          {/* Academic Density Breakdown */}
          <div className="space-y-3">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <span>Category Distribution</span>
            </h4>

            <div className="space-y-2">
              {Object.entries(categoryCounts).map(([type, count]) => {
                const meta = (EVENT_TYPES_METADATA as any)[type] || EVENT_TYPES_METADATA.custom;
                const pct = Math.round((count / Math.max(events.length, 1)) * 100);

                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span>{meta.label}</span>
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {count} ({pct}%)
                      </span>
                    </div>

                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: meta.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Key Milestones Summary */}
          <div className="space-y-3 pt-2 border-t border-border">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
              Academic Milestones Summary
            </h4>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                <span className="text-[10px] uppercase font-bold">Holidays</span>
                <p className="text-lg font-bold">{holidaysCount} Days</p>
              </div>

              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-800 dark:text-indigo-300">
                <span className="text-[10px] uppercase font-bold">Examinations</span>
                <p className="text-lg font-bold">{examsCount} Tests</p>
              </div>

              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-800 dark:text-purple-300">
                <span className="text-[10px] uppercase font-bold">PTMs</span>
                <p className="text-lg font-bold">{ptmsCount} Sessions</p>
              </div>

              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-800 dark:text-cyan-300">
                <span className="text-[10px] uppercase font-bold">Special Classes</span>
                <p className="text-lg font-bold">{specialClassesCount} Classes</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
