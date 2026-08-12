// ──────────────────────────────────────────────────────────────────────────────
// SCHEDULE RANGE BAR
//
// Quick presets + a calendar date, shared by the coordinator and teacher views
// so "Today" is one implementation rather than two that drift.
//
// RESPONSIVE: on a phone the presets become a single horizontally-scrollable
// row and the date input drops to its own full-width line. They are NOT hidden
// behind a menu — picking "Tomorrow" is the most common action on this screen
// and burying it behind a tap would make the small screen the slow one.
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RANGE_PRESETS, type RangePreset } from "../utils/scheduleView";

interface Props {
  preset: RangePreset;
  /** Set when `preset === "date"`. */
  date: string;
  onPreset: (p: RangePreset) => void;
  onDate: (iso: string) => void;
  /** Rendered on the right — status filters, a count, a refresh button. */
  children?: React.ReactNode;
  className?: string;
}

export const ScheduleRangeBar: React.FC<Props> = ({
  preset, date, onPreset, onDate, children, className,
}) => (
  <div className={cn("space-y-2", className)}>
    <div className="flex flex-wrap items-center gap-2">
      {/* -mx-1 px-1 lets the focus ring of the first/last button breathe while
          still scrolling edge to edge on a narrow screen. */}
      <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5 sm:overflow-visible">
        {RANGE_PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={preset === p.id ? "default" : "outline"}
            className="shrink-0"
            onClick={() => onPreset(p.id)}
            aria-pressed={preset === p.id}
          >
            {/* Abbreviated below `sm` so five presets fit without scrolling on
                a 360px phone. This project defines no `xs` breakpoint, so the
                switch happens at Tailwind's default 640px. */}
            <span className="sm:hidden">{p.short}</span>
            <span className="hidden sm:inline">{p.label}</span>
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            aria-label="Show a specific date"
            value={preset === "date" ? date : ""}
            onChange={(e) => {
              const v = e.target.value;
              // Clearing the field returns to Today rather than leaving the
              // list filtered to an empty date, which would show nothing and
              // look like a data problem.
              if (v) onDate(v);
              else onPreset("today");
            }}
            className="h-9 w-[150px] pl-7 sm:w-[165px]"
          />
        </div>
        {preset === "date" && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0"
            aria-label="Clear date filter"
            onClick={() => onPreset("today")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  </div>
);
