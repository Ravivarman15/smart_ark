// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Event Import & CSV/Excel Parser
// ──────────────────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
import { format, parseISO, isValid } from "date-fns";
import type { CalendarEventType, CreateCalendarEventInput } from "../types/calendar.types";

export interface RawImportRow {
  [key: string]: any;
}

export interface ParsedCalendarImport {
  headers: string[];
  rawRows: RawImportRow[];
  suggestedMapping: Record<string, string>;
}

export interface ValidatedImportEvent {
  title: string;
  event_type: CalendarEventType;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location?: string;
  description?: string;
  standard_name?: string;
  batch_name?: string;
  isValid: boolean;
  errors: string[];
}

const STANDARD_CALENDAR_FIELDS: Array<{
  key: string;
  label: string;
  synonyms: string[];
}> = [
  {
    key: "title",
    label: "Event Title",
    synonyms: ["title", "event name", "event title", "subject", "topic", "activity", "name"],
  },
  {
    key: "event_type",
    label: "Event Type / Category",
    synonyms: ["type", "event type", "category", "kind", "event category"],
  },
  {
    key: "start_date",
    label: "Start Date",
    synonyms: ["start date", "date", "from date", "begins", "start"],
  },
  {
    key: "start_time",
    label: "Start Time",
    synonyms: ["start time", "from time", "start", "time"],
  },
  {
    key: "end_date",
    label: "End Date",
    synonyms: ["end date", "to date", "finish date", "until"],
  },
  {
    key: "end_time",
    label: "End Time",
    synonyms: ["end time", "to time", "finish time", "finish"],
  },
  {
    key: "location",
    label: "Location / Venue",
    synonyms: ["location", "venue", "room", "hall", "place"],
  },
  {
    key: "description",
    label: "Description / Notes",
    synonyms: ["description", "notes", "details", "remarks", "instructions"],
  },
  {
    key: "standard_name",
    label: "Class / Standard",
    synonyms: ["class", "standard", "grade", "target class"],
  },
  {
    key: "batch_name",
    label: "Section / Batch",
    synonyms: ["section", "batch", "division", "target batch"],
  },
];

export function matchHeaderToCalendarField(headerName: string): string | null {
  const norm = headerName.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  if (!norm) return null;

  for (const f of STANDARD_CALENDAR_FIELDS) {
    if (norm === f.key || norm === f.label.toLowerCase()) return f.key;
    if (f.synonyms.some((syn) => norm === syn.toLowerCase())) return f.key;
  }

  // Phrase matching
  for (const f of STANDARD_CALENDAR_FIELDS) {
    for (const syn of f.synonyms) {
      const regex = new RegExp(`(^|\\s)${syn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i");
      if (regex.test(norm)) return f.key;
    }
  }

  return null;
}

export function parseDelimitedCalendarText(text: string): ParsedCalendarImport {
  const clean = text.trim();
  if (!clean) return { headers: [], rawRows: [], suggestedMapping: {} };

  const firstLine = clean.split(/\r?\n/)[0] || "";
  let delimiter = ",";
  if (firstLine.includes("\t")) delimiter = "\t";
  else if (firstLine.includes(";")) delimiter = ";";

  const workbook = XLSX.read(clean, { type: "string", raw: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: RawImportRow[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  if (rows.length === 0) return { headers: [], rawRows: [], suggestedMapping: {} };

  const headers = Object.keys(rows[0]);
  const suggestedMapping: Record<string, string> = {};

  for (const h of headers) {
    const matched = matchHeaderToCalendarField(h);
    if (matched) suggestedMapping[h] = matched;
  }

  return { headers, rawRows: rows, suggestedMapping };
}

export async function parseExcelCalendarBuffer(buffer: ArrayBuffer): Promise<ParsedCalendarImport> {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: RawImportRow[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  if (rows.length === 0) return { headers: [], rawRows: [], suggestedMapping: {} };

  const headers = Object.keys(rows[0]);
  const suggestedMapping: Record<string, string> = {};

  for (const h of headers) {
    const matched = matchHeaderToCalendarField(h);
    if (matched) suggestedMapping[h] = matched;
  }

  return { headers, rawRows: rows, suggestedMapping };
}

const CATEGORY_MAP: Record<string, CalendarEventType> = {
  holiday: "holiday",
  vacation: "holiday",
  exam: "exam",
  test: "exam",
  ptm: "ptm",
  "parent teacher meeting": "ptm",
  "parent meeting": "parent_meeting",
  event: "school_event",
  celebration: "school_event",
  assignment: "assignment_deadline",
  deadline: "assignment_deadline",
  fee: "fee_due",
  "fee due": "fee_due",
  "special class": "special_class",
  extra: "special_class",
  closure: "school_closure",
  emergency: "school_closure",
  announcement: "announcement",
};

export function validateMappedCalendarRows(
  rawRows: RawImportRow[],
  mapping: Record<string, string>
): ValidatedImportEvent[] {
  const results: ValidatedImportEvent[] = [];

  for (const raw of rawRows) {
    const mapped: Record<string, string> = {};
    for (const [col, fieldKey] of Object.entries(mapping)) {
      if (fieldKey && raw[col] !== undefined) {
        mapped[fieldKey] = String(raw[col]).trim();
      }
    }

    const errors: string[] = [];
    const title = mapped["title"] || "";
    if (!title) errors.push("Event title is required");

    let eventType: CalendarEventType = "school_event";
    if (mapped["event_type"]) {
      const normType = mapped["event_type"].toLowerCase();
      eventType = CATEGORY_MAP[normType] || "school_event";
    }

    const startDateStr = mapped["start_date"] || format(new Date(), "yyyy-MM-dd");
    const startTimeStr = mapped["start_time"] || (eventType === "holiday" ? "00:00:00" : "09:00:00");
    const endDateStr = mapped["end_date"] || startDateStr;
    const endTimeStr = mapped["end_time"] || (eventType === "holiday" ? "23:59:59" : "10:30:00");

    let allDay = eventType === "holiday" || eventType === "school_closure";
    let startAt = `${startDateStr}T${startTimeStr.includes(":") ? startTimeStr : startTimeStr + ":00"}`;
    let endAt = `${endDateStr}T${endTimeStr.includes(":") ? endTimeStr : endTimeStr + ":00"}`;

    results.push({
      title,
      event_type: eventType,
      start_at: startAt,
      end_at: endAt,
      all_day: allDay,
      location: mapped["location"] || undefined,
      description: mapped["description"] || undefined,
      standard_name: mapped["standard_name"] || undefined,
      batch_name: mapped["batch_name"] || undefined,
      isValid: errors.length === 0,
      errors,
    });
  }

  return results;
}
