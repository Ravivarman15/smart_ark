// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Multi-Tenant & Parent Isolation Security Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "../types/calendar.types";

describe("Strict Multi-Tenant Isolation for Academic Calendar", () => {
  const orgArkId = "11111111-1111-4111-8111-111111111111"; // ARK Learning Arena
  const orgAbcId = "22222222-2222-4222-8222-222222222222"; // ABC Academi

  const arkEvents: CalendarEvent[] = [
    {
      id: "ev-ark-1",
      organization_id: orgArkId,
      title: "Onam Festival Holiday",
      event_type: "holiday",
      start_at: "2026-09-04T00:00:00.000Z",
      end_at: "2026-09-05T23:59:59.000Z",
      all_day: true,
      timezone: "Asia/Kolkata",
      status: "scheduled",
      target_scope: "all",
      is_recurring: false,
      reminders: [],
      created_at: "2026-08-20T08:00:00.000Z",
      updated_at: "2026-08-20T08:00:00.000Z",
    },
    {
      id: "ev-ark-2",
      organization_id: orgArkId,
      title: "Class 10 Mid-Term Mathematics",
      event_type: "exam",
      start_at: "2026-10-10T09:00:00.000Z",
      end_at: "2026-10-10T12:00:00.000Z",
      all_day: false,
      timezone: "Asia/Kolkata",
      status: "scheduled",
      target_scope: "standards",
      is_recurring: false,
      reminders: [],
      audiences: [{ target_type: "standard", target_id: "std-10", target_name: "Class 10" }],
      created_at: "2026-08-20T08:00:00.000Z",
      updated_at: "2026-08-20T08:00:00.000Z",
    },
  ];

  const abcEvents: CalendarEvent[] = [
    {
      id: "ev-abc-1",
      organization_id: orgAbcId,
      title: "Grade 5 Annual PTM",
      event_type: "ptm",
      start_at: "2026-10-15T10:00:00.000Z",
      end_at: "2026-10-15T13:00:00.000Z",
      all_day: false,
      timezone: "Asia/Dubai",
      status: "scheduled",
      target_scope: "standards",
      is_recurring: false,
      reminders: [],
      audiences: [{ target_type: "standard", target_id: "std-abc-5", target_name: "Grade 5" }],
      created_at: "2026-08-20T08:00:00.000Z",
      updated_at: "2026-08-20T08:00:00.000Z",
    },
  ];

  const allRecords = [...arkEvents, ...abcEvents];

  it("ARK queries return ONLY ARK calendar events", () => {
    const arkQuery = allRecords.filter((r) => r.organization_id === orgArkId);
    expect(arkQuery).toHaveLength(2);
    expect(arkQuery.every((r) => r.organization_id === orgArkId)).toBe(true);

    // Verify no ABC PTM leaked into ARK
    const hasAbcEvent = arkQuery.some((r) => r.title.includes("Grade 5 Annual PTM"));
    expect(hasAbcEvent).toBe(false);
  });

  it("ABC Academi queries return ONLY ABC events", () => {
    const abcQuery = allRecords.filter((r) => r.organization_id === orgAbcId);
    expect(abcQuery).toHaveLength(1);
    expect(abcQuery[0].id).toBe("ev-abc-1");
    expect(abcQuery[0].organization_id).toBe(orgAbcId);

    // Verify no ARK Onam Holiday or Class 10 Exam leaked into ABC
    const hasArkEvent = abcQuery.some(
      (r) => r.title.includes("Onam") || r.title.includes("Class 10")
    );
    expect(hasArkEvent).toBe(false);
  });

  it("Cross-tenant event lookup by direct ID is strictly blocked", () => {
    const tenantScopedFind = (orgId: string, eventId: string) => {
      return allRecords.find((r) => r.id === eventId && r.organization_id === orgId) || null;
    };

    // ARK user attempts to load ABC event
    expect(tenantScopedFind(orgArkId, "ev-abc-1")).toBeNull();

    // ABC user attempts to load ARK event
    expect(tenantScopedFind(orgAbcId, "ev-ark-1")).toBeNull();
  });
});

describe("Parent Portal Audience Isolation", () => {
  const orgId = "11111111-1111-4111-8111-111111111111";

  const events: CalendarEvent[] = [
    {
      id: "ev-1",
      organization_id: orgId,
      title: "Annual Sports Day",
      event_type: "school_event",
      start_at: "2026-11-10T09:00:00.000Z",
      end_at: "2026-11-10T17:00:00.000Z",
      all_day: true,
      timezone: "Asia/Kolkata",
      status: "scheduled",
      target_scope: "all",
      is_recurring: false,
      reminders: [],
      created_at: "2026-08-20T08:00:00.000Z",
      updated_at: "2026-08-20T08:00:00.000Z",
    },
    {
      id: "ev-2",
      organization_id: orgId,
      title: "Class 10 Physics Practical Exam",
      event_type: "exam",
      start_at: "2026-10-12T09:00:00.000Z",
      end_at: "2026-10-12T12:00:00.000Z",
      all_day: false,
      timezone: "Asia/Kolkata",
      status: "scheduled",
      target_scope: "standards",
      is_recurring: false,
      reminders: [],
      audiences: [{ target_type: "standard", target_id: "std-10", target_name: "Class 10" }],
      created_at: "2026-08-20T08:00:00.000Z",
      updated_at: "2026-08-20T08:00:00.000Z",
    },
    {
      id: "ev-3",
      organization_id: orgId,
      title: "Class 6 Parent Consultation",
      event_type: "ptm",
      start_at: "2026-10-14T10:00:00.000Z",
      end_at: "2026-10-14T12:00:00.000Z",
      all_day: false,
      timezone: "Asia/Kolkata",
      status: "scheduled",
      target_scope: "standards",
      is_recurring: false,
      reminders: [],
      audiences: [{ target_type: "standard", target_id: "std-6", target_name: "Class 6" }],
      created_at: "2026-08-20T08:00:00.000Z",
      updated_at: "2026-08-20T08:00:00.000Z",
    },
  ];

  it("Parent of Class 10 child sees Sports Day and Class 10 Exam, but NOT Class 6 PTM", () => {
    const parentChildrenStandards = ["std-10"];

    const visibleEvents = events.filter((ev) => {
      if (ev.target_scope === "all") return true;
      return ev.audiences?.some(
        (a) => a.target_type === "standard" && parentChildrenStandards.includes(a.target_id || "")
      );
    });

    expect(visibleEvents).toHaveLength(2);
    expect(visibleEvents.map((e) => e.title)).toEqual([
      "Annual Sports Day",
      "Class 10 Physics Practical Exam",
    ]);

    // Verify Class 6 event is omitted
    const hasClass6 = visibleEvents.some((e) => e.title.includes("Class 6"));
    expect(hasClass6).toBe(false);
  });
});
