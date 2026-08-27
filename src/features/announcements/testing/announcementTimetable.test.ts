// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Timetable Parser, Templates & ICS Export Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  getTemplateDefaults,
  calculateDayFromDate,
  matchHeaderToStandardField,
  parseRawDelimitedText,
  applyColumnMappingToRows,
  generateIcsCalendar,
} from "../utils/timetableParser";
import type { TimetableColumn, TimetableRow } from "../types/announcements.types";

describe("Timetable Templates Engine", () => {
  it("provides complete default configurations for Exam template", () => {
    const exam = getTemplateDefaults("exam");
    expect(exam.template).toBe("exam");
    expect(exam.columns.some((c) => c.key === "date")).toBe(true);
    expect(exam.columns.some((c) => c.key === "subject")).toBe(true);
    expect(exam.columns.some((c) => c.key === "start_time")).toBe(true);
    expect(exam.columns.some((c) => c.key === "end_time")).toBe(true);
    expect(exam.rows.length).toBeGreaterThan(0);
    expect(exam.rows[0].subject).toBe("Mathematics");
  });

  it("provides complete default configurations for Weekly Class template", () => {
    const weekly = getTemplateDefaults("weekly");
    expect(weekly.template).toBe("weekly");
    expect(weekly.columns.some((c) => c.key === "day")).toBe(true);
    expect(weekly.columns.some((c) => c.key === "teacher")).toBe(true);
    expect(weekly.rows[0].subject).toBe("Physics");
  });

  it("provides complete default configurations for Event Schedule template", () => {
    const event = getTemplateDefaults("event");
    expect(event.template).toBe("event");
    expect(event.columns.some((c) => c.key === "description")).toBe(true);
    expect(event.rows[0].subject).toContain("Inauguration");
  });
});

describe("Date to Day of Week Calculation", () => {
  it("calculates correct Day from ISO Date string", () => {
    // 2026-10-12 is a Monday
    expect(calculateDayFromDate("2026-10-12")).toBe("Monday");
    // 2026-10-14 is a Wednesday
    expect(calculateDayFromDate("2026-10-14")).toBe("Wednesday");
    // 2026-10-16 is a Friday
    expect(calculateDayFromDate("2026-10-16")).toBe("Friday");
  });

  it("returns empty string gracefully for null or invalid dates", () => {
    expect(calculateDayFromDate("")).toBe("");
    expect(calculateDayFromDate(undefined)).toBe("");
    expect(calculateDayFromDate("not-a-date")).toBe("");
  });
});

describe("Heuristic Header Matching", () => {
  it("maps synonyms to standard field keys accurately", () => {
    expect(matchHeaderToStandardField("Exam Date")).toBe("date");
    expect(matchHeaderToStandardField("Schedule Date")).toBe("date");
    expect(matchHeaderToStandardField("Subject Name")).toBe("subject");
    expect(matchHeaderToStandardField("Paper")).toBe("subject");
    expect(matchHeaderToStandardField("Start")).toBe("start_time");
    expect(matchHeaderToStandardField("From Time")).toBe("start_time");
    expect(matchHeaderToStandardField("Finish")).toBe("end_time");
    expect(matchHeaderToStandardField("To Time")).toBe("end_time");
    expect(matchHeaderToStandardField("Hall")).toBe("room");
    expect(matchHeaderToStandardField("Exam Hall")).toBe("room");
    expect(matchHeaderToStandardField("Venue")).toBe("room");
    expect(matchHeaderToStandardField("Faculty")).toBe("teacher");
    expect(matchHeaderToStandardField("Invigilator")).toBe("teacher");
    expect(matchHeaderToStandardField("Instructions")).toBe("notes");
  });

  it("returns null for unknown custom fields", () => {
    expect(matchHeaderToStandardField("RandomCustomColumnXYZ")).toBeNull();
  });
});

describe("Delimited Text Parser & Column Mapping", () => {
  it("parses CSV lines and produces suggested column mappings", () => {
    const csv = `Date,Subject Name,Start,Finish,Hall\n2026-10-10,Mathematics,09:00 AM,12:00 PM,Hall A\n2026-10-12,Science,09:00 AM,12:00 PM,Lab 1`;
    const parsed = parseRawDelimitedText(csv);

    expect(parsed.headers).toEqual(["Date", "Subject Name", "Start", "Finish", "Hall"]);
    expect(parsed.rawRows).toHaveLength(2);
    expect(parsed.rawRows[0]["Subject Name"]).toBe("Mathematics");

    expect(parsed.suggestedMapping["Date"]).toBe("date");
    expect(parsed.suggestedMapping["Subject Name"]).toBe("subject");
    expect(parsed.suggestedMapping["Start"]).toBe("start_time");
    expect(parsed.suggestedMapping["Finish"]).toBe("end_time");
    expect(parsed.suggestedMapping["Hall"]).toBe("room");
  });

  it("parses Tab-delimited (TSV / Excel pasted) text correctly", () => {
    const tsv = "Exam Date\tCourse\tStart Time\tVenue\n2026-10-15\tEnglish Literature\t10:00 AM\tAuditorium";
    const parsed = parseRawDelimitedText(tsv);

    expect(parsed.headers).toEqual(["Exam Date", "Course", "Start Time", "Venue"]);
    expect(parsed.rawRows).toHaveLength(1);
    expect(parsed.rawRows[0]["Course"]).toBe("English Literature");
    expect(parsed.suggestedMapping["Exam Date"]).toBe("date");
  });

  it("applies column mapping and auto-computes Day for rows", () => {
    const rawRows = [
      {
        "Exam Date": "2026-10-12",
        "Subject Name": "Mathematics",
        "Start": "09:00 AM",
        "Finish": "12:00 PM",
        "Hall": "Hall A",
      },
    ];

    const mapping = {
      "Exam Date": "date",
      "Subject Name": "subject",
      "Start": "start_time",
      "Finish": "end_time",
      "Hall": "room",
    };

    const initialColumns: TimetableColumn[] = [
      { key: "date", label: "Date", type: "date" },
      { key: "day", label: "Day", type: "text" },
      { key: "subject", label: "Subject", type: "text" },
      { key: "start_time", label: "Start Time", type: "time" },
      { key: "end_time", label: "End Time", type: "time" },
      { key: "room", label: "Room", type: "text" },
    ];

    const { rows, columns } = applyColumnMappingToRows(rawRows, mapping, initialColumns);

    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-10-12");
    expect(rows[0].day).toBe("Monday"); // Auto-calculated!
    expect(rows[0].subject).toBe("Mathematics");
    expect(rows[0].start_time).toBe("09:00 AM");
    expect(rows[0].end_time).toBe("12:00 PM");
    expect(rows[0].room).toBe("Hall A");
  });
});

describe("RFC 5545 iCalendar (.ics) Generation", () => {
  it("generates valid standard VCALENDAR / VEVENT text format", () => {
    const rows: TimetableRow[] = [
      {
        id: "row-1",
        date: "2026-10-10",
        day: "Saturday",
        start_time: "09:00 AM",
        end_time: "12:00 PM",
        subject: "Mathematics Exam",
        room: "Main Hall",
        notes: "Calculators allowed",
      },
      {
        id: "row-2",
        date: "2026-10-12",
        day: "Monday",
        start_time: "09:00 AM",
        end_time: "12:00 PM",
        subject: "Science Practical",
        room: "Lab 2",
      },
    ];

    const ics = generateIcsCalendar("Mid-Term Examination", rows, "ARK Learning Arena");

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//Smart ARK//Timetable Calendar Export//EN");
    expect(ics).toContain("X-WR-CALNAME:Mid-Term Examination");

    // Events
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Mathematics Exam");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261010");
    expect(ics).toContain("LOCATION:Main Hall");
    expect(ics).toContain("DESCRIPTION:Notes: Calculators allowed");
    expect(ics).toContain("SUMMARY:Science Practical");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261012");
    expect(ics).toContain("END:VCALENDAR");
  });
});
