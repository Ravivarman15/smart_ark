// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — RFC 5545 iCalendar (.ics) Generator
// ──────────────────────────────────────────────────────────────────────────────

import { format, parseISO, isValid } from "date-fns";
import type { CalendarEvent } from "../types/calendar.types";

function escapeIcsText(str?: string | null): string {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatIcsDateTime(dateStr: string, allDay = false): string {
  try {
    const d = typeof dateStr === "string" ? parseISO(dateStr) : new Date(dateStr);
    if (!isValid(d)) return "";
    if (allDay) {
      return format(d, "yyyyMMdd");
    }
    return format(d, "yyyyMMdd'T'HHmmss'Z'");
  } catch {
    return "";
  }
}

/**
 * Generate standard RFC 5545 compliant VCALENDAR string for one or multiple events.
 */
export function generateEventsIcs(
  events: CalendarEvent[],
  calendarName = "Academic Calendar",
  organizationName = "Smart ARK"
): string {
  const nowIcs = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Smart ARK//Academic Calendar Generator//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-TIMEZONE:Asia/Kolkata`,
  ];

  for (const ev of events) {
    const dtStart = formatIcsDateTime(ev.start_at, ev.all_day);
    const dtEnd = formatIcsDateTime(ev.end_at, ev.all_day);
    if (!dtStart) continue;

    const uid = `${ev.id}@smartark.app`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${nowIcs}`);

    if (ev.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      if (dtEnd) {
        lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
      }
    } else {
      lines.push(`DTSTART:${dtStart}`);
      if (dtEnd) {
        lines.push(`DTEND:${dtEnd}`);
      }
    }

    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`);

    let desc = ev.description ? `${ev.description}\n\n` : "";
    desc += `Event Type: ${ev.event_type}\nOrganization: ${organizationName}`;
    if (ev.location) {
      desc += `\nLocation: ${ev.location}`;
    }
    lines.push(`DESCRIPTION:${escapeIcsText(desc)}`);

    if (ev.location) {
      lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
    }

    lines.push(`STATUS:${ev.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * Trigger client browser download of an .ics file.
 */
export function downloadCalendarIcsFile(
  events: CalendarEvent[],
  filename = "academic-calendar.ics",
  calendarName = "Academic Calendar"
): void {
  const content = generateEventsIcs(events, calendarName);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename.endsWith(".ics") ? filename : `${filename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
