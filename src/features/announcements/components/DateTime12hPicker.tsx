// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Date & 12-Hour Time (AM/PM) Picker with Presets
// ──────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from "react";
import { Calendar, Clock, Sparkles, X, Check } from "lucide-react";
import { format, addDays, isValid, parseISO } from "date-fns";

interface Props {
  label: string;
  value: string; // ISO or YYYY-MM-DDTHH:mm
  onChange: (val: string) => void;
  required?: boolean;
  minDate?: string;
  helperText?: string;
  isExpiry?: boolean;
}

const COMMON_TIMES = [
  { label: "7:00 AM", h: 7, m: 0 },
  { label: "9:00 AM", h: 9, m: 0 },
  { label: "12:00 PM", h: 12, m: 0 },
  { label: "3:00 PM", h: 15, m: 0 },
  { label: "5:00 PM", h: 17, m: 0 },
  { label: "11:59 PM", h: 23, m: 59 },
];

export const DateTime12hPicker: React.FC<Props> = ({
  label,
  value,
  onChange,
  required = false,
  minDate,
  helperText,
  isExpiry = false,
}) => {
  // Parse current value into date, hour12, minute, and period (AM/PM)
  const parsed = useMemo(() => {
    if (!value) {
      return {
        date: "",
        hour12: 3,
        minute: 0,
        period: "PM" as "AM" | "PM",
        formattedHuman: "",
      };
    }

    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        const hours24 = d.getHours();
        const minute = d.getMinutes();
        const period: "AM" | "PM" = hours24 >= 12 ? "PM" : "AM";
        const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
        const dateStr = format(d, "yyyy-MM-dd");
        const formattedHuman = format(d, "EEEE, d MMM yyyy 'at' h:mm a");

        return { date: dateStr, hour12, minute, period, formattedHuman };
      }
    } catch {
      // fallback
    }

    // Attempt string split if ISO parse failed
    if (value.includes("T")) {
      const [dPart, tPart] = value.split("T");
      const [hh, mm] = (tPart || "15:00").split(":");
      const h24 = parseInt(hh || "15", 10);
      const m = parseInt(mm || "0", 10);
      const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
      const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return { date: dPart, hour12, minute: m, period, formattedHuman: value };
    }

    return { date: value, hour12: 3, minute: 0, period: "PM", formattedHuman: value };
  }, [value]);

  const updateDateTime = (
    newDate: string,
    newHour12: number,
    newMinute: number,
    newPeriod: "AM" | "PM"
  ) => {
    if (!newDate) {
      onChange("");
      return;
    }

    let h24 = newHour12 % 12;
    if (newPeriod === "PM") h24 += 12;

    const pad = (n: number) => String(n).padStart(2, "0");
    const combinedStr = `${newDate}T${pad(h24)}:${pad(newMinute)}:00`;
    onChange(combinedStr);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateDateTime(e.target.value, parsed.hour12, parsed.minute, parsed.period);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const h = parseInt(e.target.value, 10);
    const effectiveDate = parsed.date || format(new Date(), "yyyy-MM-dd");
    updateDateTime(effectiveDate, h, parsed.minute, parsed.period);
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = parseInt(e.target.value, 10);
    const effectiveDate = parsed.date || format(new Date(), "yyyy-MM-dd");
    updateDateTime(effectiveDate, parsed.hour12, m, parsed.period);
  };

  const handlePeriodChange = (p: "AM" | "PM") => {
    const effectiveDate = parsed.date || format(new Date(), "yyyy-MM-dd");
    updateDateTime(effectiveDate, parsed.hour12, parsed.minute, p);
  };

  const applyPreset = (dateStr: string, h24: number, m: number) => {
    const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
    const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
    updateDateTime(dateStr, hour12, m, period);
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const in3DaysStr = format(addDays(new Date(), 3), "yyyy-MM-dd");
  const in7DaysStr = format(addDays(new Date(), 7), "yyyy-MM-dd");

  return (
    <div className="space-y-2.5 p-3.5 rounded-xl border border-border bg-card/60">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Date & 12-Hour Time Inputs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        {/* Date Selector */}
        <div className="sm:col-span-6 relative">
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="date"
              value={parsed.date}
              min={minDate}
              onChange={handleDateChange}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-input bg-background text-foreground focus:ring-1 focus:ring-primary outline-hidden font-medium"
            />
          </div>
        </div>

        {/* 12-Hour Time Selector */}
        <div className="sm:col-span-6 flex items-center gap-1.5">
          {/* Hour (1..12) */}
          <select
            value={parsed.hour12}
            onChange={handleHourChange}
            disabled={!parsed.date}
            className="w-16 px-2 py-1.5 text-xs rounded-lg border border-input bg-background text-foreground focus:ring-1 focus:ring-primary outline-hidden font-semibold text-center disabled:opacity-50"
            title="Hour (1 to 12)"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>

          <span className="text-xs font-bold text-muted-foreground">:</span>

          {/* Minute (00, 15, 30, 45, 59...) */}
          <select
            value={parsed.minute}
            onChange={handleMinuteChange}
            disabled={!parsed.date}
            className="w-16 px-2 py-1.5 text-xs rounded-lg border border-input bg-background text-foreground focus:ring-1 focus:ring-primary outline-hidden font-mono text-center disabled:opacity-50"
            title="Minute"
          >
            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 59].map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>

          {/* AM / PM Segmented Control */}
          <div className="flex items-center rounded-lg border border-border bg-muted p-0.5">
            <button
              type="button"
              disabled={!parsed.date}
              onClick={() => handlePeriodChange("AM")}
              className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors disabled:opacity-50 ${
                parsed.period === "AM"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              AM
            </button>
            <button
              type="button"
              disabled={!parsed.date}
              onClick={() => handlePeriodChange("PM")}
              className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors disabled:opacity-50 ${
                parsed.period === "PM"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              PM
            </button>
          </div>
        </div>
      </div>

      {/* Quick Common Time Buttons */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <span className="text-[10px] uppercase font-semibold text-muted-foreground">Quick:</span>
        {COMMON_TIMES.map((ct) => (
          <button
            key={ct.label}
            type="button"
            onClick={() => {
              const d = parsed.date || todayStr;
              applyPreset(d, ct.h, ct.m);
            }}
            className="px-2 py-0.5 text-[10px] font-medium rounded-md border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            {ct.label}
          </button>
        ))}
      </div>

      {/* Expiry Presets (for expiration input) */}
      {isExpiry && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/60">
          <span className="text-[10px] uppercase font-semibold text-amber-600 dark:text-amber-400">
            Presets:
          </span>
          <button
            type="button"
            onClick={() => applyPreset(todayStr, 15, 0)}
            className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors"
          >
            Today 3:00 PM
          </button>
          <button
            type="button"
            onClick={() => applyPreset(todayStr, 23, 59)}
            className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors"
          >
            Today 11:59 PM
          </button>
          <button
            type="button"
            onClick={() => applyPreset(tomorrowStr, 7, 0)}
            className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors"
          >
            Tomorrow 7:00 AM
          </button>
          <button
            type="button"
            onClick={() => applyPreset(in3DaysStr, 15, 0)}
            className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            In 3 Days (3 PM)
          </button>
          <button
            type="button"
            onClick={() => applyPreset(in7DaysStr, 17, 0)}
            className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            In 7 Days (5 PM)
          </button>
        </div>
      )}

      {/* Human Readable Confirmation Display */}
      {parsed.formattedHuman && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/5 border border-primary/20 px-2.5 py-1 rounded-lg">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            {isExpiry ? "Will automatically expire on: " : "Will publish on: "}
            <strong className="font-semibold">{parsed.formattedHuman}</strong>
          </span>
        </div>
      )}

      {helperText && !parsed.formattedHuman && (
        <p className="text-[10px] text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};
