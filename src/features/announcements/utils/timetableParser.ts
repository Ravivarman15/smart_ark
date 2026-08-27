// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Timetable Parsing, Mapping, Templates & ICS Export
// ──────────────────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
import { format, parseISO, isValid } from "date-fns";
import type {
  AnnouncementTimetableData,
  TimetableColumn,
  TimetableRow,
  TimetableTemplateType,
} from "../types/announcements.types";

/**
 * Standard fields and their common header synonyms for automatic heuristic column mapping.
 */
export const STANDARD_FIELDS: Array<{
  key: string;
  label: string;
  synonyms: string[];
  type: "date" | "time" | "text" | "number";
}> = [
  {
    key: "date",
    label: "Date",
    synonyms: ["date", "exam date", "event date", "schedule date", "day of exam", "test date"],
    type: "date",
  },
  {
    key: "day",
    label: "Day",
    synonyms: ["day", "day of week", "weekday"],
    type: "text",
  },
  {
    key: "start_time",
    label: "Start Time",
    synonyms: ["start", "start time", "from", "starts", "start_time", "begin", "from time"],
    type: "time",
  },
  {
    key: "end_time",
    label: "End Time",
    synonyms: ["end", "end time", "to", "ends", "end_time", "finish", "to time", "until"],
    type: "time",
  },
  {
    key: "subject",
    label: "Subject / Event",
    synonyms: ["subject", "subject name", "event", "title", "course", "paper", "exam", "activity", "topic"],
    type: "text",
  },
  {
    key: "teacher",
    label: "Teacher / Faculty",
    synonyms: ["teacher", "faculty", "staff", "instructor", "invigilator", "examiner", "speaker"],
    type: "text",
  },
  {
    key: "room",
    label: "Venue / Room",
    synonyms: ["venue", "room", "room no", "hall", "exam hall", "lab", "location", "classroom"],
    type: "text",
  },
  {
    key: "description",
    label: "Description / Paper Code",
    synonyms: ["description", "code", "paper code", "subject code", "details", "syllabus"],
    type: "text",
  },
  {
    key: "notes",
    label: "Notes / Instructions",
    synonyms: ["notes", "remarks", "instructions", "additional notes", "guidelines", "materials"],
    type: "text",
  },
];

/**
 * Return default template configuration
 */
export function getTemplateDefaults(template: TimetableTemplateType): AnnouncementTimetableData {
  switch (template) {
    case "exam":
      return {
        title: "Examination Timetable",
        template: "exam",
        columns: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "day", label: "Day", type: "text" },
          { key: "start_time", label: "Start Time", type: "time" },
          { key: "end_time", label: "End Time", type: "time" },
          { key: "subject", label: "Subject", type: "text", required: true },
          { key: "room", label: "Hall / Venue", type: "text" },
          { key: "notes", label: "Special Instructions", type: "text" },
        ],
        rows: [
          {
            id: "row_1",
            date: format(new Date(), "yyyy-MM-dd"),
            day: format(new Date(), "EEEE"),
            start_time: "09:00 AM",
            end_time: "12:00 PM",
            subject: "Mathematics",
            room: "Main Hall",
            notes: "Bring geometry box & non-programmable calculator",
          },
          {
            id: "row_2",
            date: format(new Date(Date.now() + 86400000 * 2), "yyyy-MM-dd"),
            day: format(new Date(Date.now() + 86400000 * 2), "EEEE"),
            start_time: "09:00 AM",
            end_time: "12:00 PM",
            subject: "Science",
            room: "Science Lab",
            notes: "Lab manual required for practical verification",
          },
        ],
      };

    case "weekly":
      return {
        title: "Weekly Class Schedule",
        template: "weekly",
        columns: [
          { key: "day", label: "Day", type: "text", required: true },
          { key: "start_time", label: "Start Time", type: "time" },
          { key: "end_time", label: "End Time", type: "time" },
          { key: "subject", label: "Subject", type: "text", required: true },
          { key: "teacher", label: "Teacher", type: "text" },
          { key: "room", label: "Room", type: "text" },
        ],
        rows: [
          {
            id: "row_1",
            day: "Monday",
            start_time: "08:30 AM",
            end_time: "09:30 AM",
            subject: "Physics",
            teacher: "Dr. Sarah",
            room: "Room 101",
          },
          {
            id: "row_2",
            day: "Monday",
            start_time: "09:30 AM",
            end_time: "10:30 AM",
            subject: "Chemistry",
            teacher: "Prof. Alan",
            room: "Room 102",
          },
        ],
      };

    case "event":
      return {
        title: "Event Itinerary & Schedule",
        template: "event",
        columns: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "start_time", label: "Time", type: "time" },
          { key: "subject", label: "Event / Session", type: "text", required: true },
          { key: "room", label: "Venue", type: "text" },
          { key: "description", label: "Description", type: "text" },
        ],
        rows: [
          {
            id: "row_1",
            date: format(new Date(), "yyyy-MM-dd"),
            start_time: "09:00 AM",
            subject: "Inauguration & Welcome Address",
            room: "Auditorium",
            description: "Opening keynote by Principal and dignitaries",
          },
          {
            id: "row_2",
            date: format(new Date(), "yyyy-MM-dd"),
            start_time: "10:30 AM",
            subject: "Cultural Performances & Competitions",
            room: "Open Air Theatre",
            description: "Annual cultural festival presentations",
          },
        ],
      };

    case "custom":
    default:
      return {
        title: "Custom Schedule",
        template: "custom",
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "start_time", label: "Time", type: "time" },
          { key: "subject", label: "Activity / Subject", type: "text", required: true },
          { key: "notes", label: "Details", type: "text" },
        ],
        rows: [
          {
            id: "row_1",
            date: format(new Date(), "yyyy-MM-dd"),
            start_time: "10:00 AM",
            subject: "Orientation Session",
            notes: "All students to assemble at reception",
          },
        ],
      };
  }
}

/**
 * Calculate day of the week from a date string (YYYY-MM-DD or standard ISO).
 */
export function calculateDayFromDate(dateStr?: string | null): string {
  if (!dateStr || !dateStr.trim()) return "";
  try {
    const parsed = parseISO(dateStr.trim());
    if (isValid(parsed)) {
      return format(parsed, "EEEE");
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return format(d, "EEEE");
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * Match a raw column name to standard field key using synonyms heuristic.
 */
export function matchHeaderToStandardField(headerName: string): string | null {
  const norm = headerName.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  if (!norm) return null;

  // 1. Exact match check
  for (const f of STANDARD_FIELDS) {
    if (norm === f.key.toLowerCase() || norm === f.label.toLowerCase()) return f.key;
    if (f.synonyms.some((syn) => norm === syn.toLowerCase())) {
      return f.key;
    }
  }

  // 2. Phrase matching (prioritizing longer specific synonyms, e.g. "exam hall" over "exam")
  const allSynonyms: Array<{ syn: string; key: string }> = [];
  for (const f of STANDARD_FIELDS) {
    for (const syn of f.synonyms) {
      allSynonyms.push({ syn: syn.toLowerCase(), key: f.key });
    }
  }
  // Sort descending by length so "exam hall" is tested before "exam"
  allSynonyms.sort((a, b) => b.syn.length - a.syn.length);

  for (const item of allSynonyms) {
    // Word boundary match: e.g. "\bstart time\b"
    const regex = new RegExp(`(^|\\s)${item.syn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i");
    if (regex.test(norm)) {
      return item.key;
    }
  }

  return null;
}

export interface ParsedRawTable {
  headers: string[];
  rawRows: Array<Record<string, string>>;
  suggestedMapping: Record<string, string>; // rawHeader -> standardFieldKey or "custom"
}

/**
 * Parse raw text (CSV, TSV, or pasted clipboard lines)
 */
export function parseRawDelimitedText(text: string): ParsedRawTable {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { headers: [], rawRows: [], suggestedMapping: {} };
  }

  // Detect delimiter: tab vs comma vs semicolon vs pipe
  const firstLine = lines[0];
  let delimiter = ",";
  if (firstLine.includes("\t")) delimiter = "\t";
  else if (firstLine.includes(";")) delimiter = ";";
  else if (firstLine.includes("|")) delimiter = "|";

  const splitLine = (l: string) => {
    if (delimiter === "|") {
      return l
        .split("|")
        .map((c) => c.trim())
        .filter((c, idx, arr) => !(idx === 0 && c === "") && !(idx === arr.length - 1 && c === ""));
    }
    return l.split(delimiter).map((c) => c.replace(/^["']|["']$/g, "").trim());
  };

  const headers = splitLine(lines[0]);
  const rawRows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx] ?? "";
    });
    rawRows.push(rowObj);
  }

  const suggestedMapping: Record<string, string> = {};
  headers.forEach((h) => {
    const match = matchHeaderToStandardField(h);
    suggestedMapping[h] = match || h.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  });

  return { headers, rawRows, suggestedMapping };
}

/**
 * Parse Excel file array buffer (.xlsx or .xls) using xlsx library.
 */
export function parseExcelBuffer(buffer: ArrayBuffer): ParsedRawTable {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const jsonData: Array<Record<string, any>> = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,
    defval: "",
  });

  if (jsonData.length === 0) {
    return { headers: [], rawRows: [], suggestedMapping: {} };
  }

  const headers = Object.keys(jsonData[0]);
  const rawRows = jsonData.map((row) => {
    const rowObj: Record<string, string> = {};
    headers.forEach((h) => {
      rowObj[h] = String(row[h] ?? "").trim();
    });
    return rowObj;
  });

  const suggestedMapping: Record<string, string> = {};
  headers.forEach((h) => {
    const match = matchHeaderToStandardField(h);
    suggestedMapping[h] = match || h.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  });

  return { headers, rawRows, suggestedMapping };
}

/**
 * Convert mapped raw rows into standard TimetableRow records.
 */
export function applyColumnMappingToRows(
  rawRows: Array<Record<string, string>>,
  mapping: Record<string, string>, // sourceHeader -> targetFieldKey
  existingColumns: TimetableColumn[]
): { rows: TimetableRow[]; columns: TimetableColumn[] } {
  // Ensure target columns cover all mapped fields
  const targetColMap = new Map<string, TimetableColumn>();
  existingColumns.forEach((c) => targetColMap.set(c.key, c));

  Object.entries(mapping).forEach(([srcH, targetKey]) => {
    if (!targetKey || targetKey === "_ignore_") return;
    if (!targetColMap.has(targetKey)) {
      const standard = STANDARD_FIELDS.find((f) => f.key === targetKey);
      targetColMap.set(targetKey, {
        key: targetKey,
        label: standard ? standard.label : srcH,
        type: standard ? standard.type : "text",
      });
    }
  });

  const finalColumns = Array.from(targetColMap.values());

  const rows: TimetableRow[] = rawRows.map((raw, idx) => {
    const row: TimetableRow = {
      id: `row_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
    };

    Object.entries(mapping).forEach(([srcH, targetKey]) => {
      if (!targetKey || targetKey === "_ignore_") return;
      const rawVal = raw[srcH]?.trim() || "";
      row[targetKey] = rawVal;
    });

    // Auto-calculate day from date if date is present and day is empty
    if (row.date && !row.day) {
      const calculated = calculateDayFromDate(row.date);
      if (calculated) row.day = calculated;
    }

    return row;
  });

  return { rows, columns: finalColumns };
}

/**
 * Generate RFC 5545 compliant iCalendar (.ics) string for export
 */
export function generateIcsCalendar(
  title: string,
  rows: TimetableRow[],
  orgName = "Smart ARK"
): string {
  const sanitize = (str?: string) =>
    (str || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  const icsLines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Smart ARK//Timetable Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${sanitize(title)}`,
  ];

  rows.forEach((row, idx) => {
    if (!row.subject) return;

    const eventDate = row.date ? row.date.replace(/-/g, "") : format(new Date(), "yyyyMMdd");
    const summary = sanitize(row.subject);
    const description = sanitize(
      [
        row.description,
        row.teacher ? `Teacher: ${row.teacher}` : "",
        row.notes ? `Notes: ${row.notes}` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );
    const location = sanitize(row.room || "");
    const uid = `timetable-${idx}-${Date.now()}@smartark.local`;

    icsLines.push("BEGIN:VEVENT");
    icsLines.push(`UID:${uid}`);
    icsLines.push(`DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`);
    icsLines.push(`DTSTART;VALUE=DATE:${eventDate}`);
    icsLines.push(`SUMMARY:${summary}`);
    if (description) icsLines.push(`DESCRIPTION:${description}`);
    if (location) icsLines.push(`LOCATION:${location}`);
    icsLines.push("STATUS:CONFIRMED");
    icsLines.push("END:VEVENT");
  });

  icsLines.push("END:VCALENDAR");
  return icsLines.join("\r\n");
}

/**
 * Trigger download of ICS file in the browser
 */
export function downloadIcsFile(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export rows to CSV
 */
export function exportTimetableCsv(title: string, columns: TimetableColumn[], rows: TimetableRow[]): void {
  const headers = columns.map((c) => c.label);
  const csvRows = [headers.join(",")];

  rows.forEach((r) => {
    const values = columns.map((c) => {
      const v = String(r[c.key] ?? "").replace(/"/g, '""');
      return `"${v}"`;
    });
    csvRows.push(values.join(","));
  });

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
